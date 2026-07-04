const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');
const promptRegistry = require('../ai/prompts');
const { renderPrompt, estimateTokens } = require('../ai/prompts/prompt-renderer');
const aiLogger = require('../ai/middleware/ai-logger');
const retriever = require('../ai/rag/retriever');
const vectorStore = require('../ai/rag/vector-store');
const { submitFeedback, getEvaluationReport } = require('../ai/evaluation/metrics');
const { getABTestResults, getABTests, selectVariant } = require('../ai/evaluation/ab-test');
const { rateLimitMiddleware, checkLimit } = require('../ai/governance/rate-limiter');
const costTracker = require('../ai/governance/cost-tracker');
const circuitBreaker = require('../ai/governance/circuit-breaker');

const AI_API_KEY = process.env.AI_API_KEY || '';
if (!AI_API_KEY) {
  console.warn('[AI] ⚠️ 未配置 AI_API_KEY 环境变量，AI 功能将使用本地降级分析。请在 .env 中设置 AI_API_KEY。');
}
const AI_URL = 'dashscope.aliyuncs.com';
const AI_PATH = '/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-turbo';
const MAX_TOKENS = 1200;
const TEMPERATURE = 0.7;

// 旧版 SYSTEM_PROMPT（向后兼容，新代码应使用 promptRegistry）
const SYSTEM_PROMPT = `你是一个专业、耐心、务实的刷题备考助手，服务于公共基础知识和专业知识题库。

回答要求：
- 先给结论，再解释原因。
- 优先围绕考点、易错点、排除法、记忆方法和下一步练习建议。
- 用户贴题时，要说明为什么选正确项，以及其他选项错在哪里。
- 不编造教材原文、法律条文或题库中没有的信息；不确定时明确提醒用户核对教材。
- 语气像靠谱的老师，简洁友好，通常控制在 500 字以内。`;

function sanitizeText(value, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && ['user', 'assistant'].includes(item.role))
    .map(item => ({ role: item.role, content: sanitizeText(item.content, 1200) }))
    .filter(item => item.content)
    .slice(-10);
}

function hasApiKey() {
  return Boolean(AI_API_KEY && AI_API_KEY.startsWith('sk-'));
}

// ===== 非流式调用（支持追踪 + 熔断 + 成本追踪）=====
function callAI(messages, traceContext = null) {
  return new Promise((resolve, reject) => {
    if (!hasApiKey()) { reject(new Error('AI 服务未配置')); return; }

    // 熔断器检查
    const cbCheck = circuitBreaker.canExecute('dashscope_chat');
    if (!cbCheck.allowed) {
      reject(new Error(cbCheck.reason || 'AI 服务熔断中'));
      return;
    }

    const body = JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, stream: false });
    const req = https.request({
      hostname: AI_URL, path: AI_PATH, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (response.statusCode >= 400) {
            circuitBreaker.recordFailure('dashscope_chat', `HTTP ${response.statusCode}`);
            reject(new Error(json.error?.message || `AI 返回 ${response.statusCode}`));
            return;
          }
          const content = json.choices?.[0]?.message?.content;
          const usage = json.usage || {};
          const inputTokens = usage.prompt_tokens || estimateTokens(messages);
          const outputTokens = usage.completion_tokens || 0;

          // 记录成本
          costTracker.recordUsage(MODEL, inputTokens, outputTokens);
          circuitBreaker.recordSuccess('dashscope_chat');

          if (traceContext) {
            aiLogger.endTrace(traceContext, { inputTokens, outputTokens, status: content ? 'success' : 'error' });
          }
          content ? resolve(content.trim()) : reject(new Error('AI 无有效内容'));
        } catch { reject(new Error('解析 AI 响应失败')); }
      });
    });
    req.on('error', e => {
      circuitBreaker.recordFailure('dashscope_chat', e.message);
      if (traceContext) {
        aiLogger.endTrace(traceContext, { status: 'error', error: e.message });
      }
      reject(new Error(`AI 连接失败：${e.message}`));
    });
    req.on('timeout', () => {
      req.destroy();
      circuitBreaker.recordFailure('dashscope_chat', 'timeout');
      if (traceContext) {
        aiLogger.endTrace(traceContext, { status: 'error', error: 'AI 响应超时' });
      }
      reject(new Error('AI 响应超时'));
    });
    req.write(body); req.end();
  });
}

// ===== 流式调用（支持熔断） =====
function callAIStream(messages, res) {
  if (!hasApiKey()) {
    res.write(`data: ${JSON.stringify({ error: 'AI 服务未配置' })}\n\n`);
    res.end();
    return;
  }

  // 熔断器检查
  const cbCheck = circuitBreaker.canExecute('dashscope_chat');
  if (!cbCheck.allowed) {
    res.write(`data: ${JSON.stringify({ error: cbCheck.reason || 'AI 服务熔断中' })}\n\n`);
    res.end();
    return;
  }

  const body = JSON.stringify({ model: MODEL, messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, stream: true });
  const apiReq = https.request({
    hostname: AI_URL, path: AI_PATH, method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
    timeout: 60000
  }, apiRes => {
    let buffer = '';
    apiRes.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); return; }
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          } catch {}
        }
      }
    });
    apiRes.on('end', () => {
      circuitBreaker.recordSuccess('dashscope_chat');
      if (buffer && buffer.startsWith('data: ') && buffer.slice(6).trim() !== '[DONE]') {
        try {
          const json = JSON.parse(buffer.slice(6).trim());
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        } catch {}
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  apiReq.on('error', e => {
    circuitBreaker.recordFailure('dashscope_chat', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  });
  apiReq.on('timeout', () => {
    apiReq.destroy();
    circuitBreaker.recordFailure('dashscope_chat', 'timeout');
    res.write(`data: ${JSON.stringify({ error: 'AI 响应超时' })}\n\n`);
    res.end();
  });
  apiReq.write(body); apiReq.end();
}

function getQuestion(questionId) {
  return db.prepare(`
    SELECT q.*, s.name AS subject_name, c.name AS chapter_name
    FROM questions q LEFT JOIN subjects s ON q.subject_id = s.id LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE q.id = ?
  `).get(questionId);
}

function buildOptions(question) {
  const opts = [];
  if (question.option_a) opts.push(`A. ${question.option_a}`);
  if (question.option_b) opts.push(`B. ${question.option_b}`);
  if (question.option_c) opts.push(`C. ${question.option_c}`);
  if (question.option_d) opts.push(`D. ${question.option_d}`);
  return opts;
}

// ===== 流式聊天（支持 RAG 增强）=====
router.post('/chat/stream', async (req, res) => {
  const message = sanitizeText(req.body.message, 4000);
  if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // RAG 检索：用用户消息检索相关题目作为上下文
  let ragContext = '';
  let ragUsed = false;
  let ragResultsCount = 0;
  try {
    const ragResult = await retriever.retrieve(db, message, { topK: 3, minScore: 0.4 });
    if (ragResult.context) {
      ragContext = ragResult.context;
      ragUsed = true;
      ragResultsCount = ragResult.results.length;
    }
  } catch (err) {
    console.log('[Chat] RAG 检索跳过:', err.message);
  }

  // 使用 Prompt 模板渲染系统消息
  const chatMode = req.body.mode || 'default';
  const rendered = promptRegistry.render('chat_system', {
    user_context: req.body.user_context || '',
    rag_context: ragContext
  }, { variant: chatMode !== 'default' ? chatMode : undefined });

  const messages = rendered
    ? [
        ...rendered.messages,
        ...sanitizeHistory(req.body.history),
        { role: 'user', content: message }
      ]
    : [
        { role: 'system', content: SYSTEM_PROMPT },
        ...sanitizeHistory(req.body.history),
        { role: 'user', content: message }
      ];

  // 启动链路追踪
  const traceCtx = aiLogger.startTrace({
    userId: req.userId || 0,
    templateId: rendered?.metadata?.template_id || 'chat_system_legacy',
    templateVersion: rendered?.metadata?.template_version || '0.0.0',
    requestPath: '/api/ai/chat/stream',
    requestType: 'chat'
  });

  if (!hasApiKey()) {
    aiLogger.endTrace(traceCtx, { status: 'error', error: 'AI 服务未配置', ragUsed, ragResultsCount });
    res.write(`data: ${JSON.stringify({ content: 'AI 服务未配置 API Key，请在环境变量中设置 AI_API_KEY。' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // 收集流式内容用于追踪
  let fullContent = '';
  const origWrite = res.write.bind(res);
  res.write = function(chunk) {
    try {
      const str = chunk.toString();
      if (str.startsWith('data: ') && !str.includes('[DONE]')) {
        const data = JSON.parse(str.slice(6).trim());
        if (data.content) fullContent += data.content;
      }
    } catch {}
    return origWrite(chunk);
  };
  const origEnd = res.end.bind(res);
  res.end = function() {
    const inputTokens = rendered?.estimatedTokens || estimateTokens(messages);
    const outputTokens = Math.ceil(fullContent.length * 0.6);
    costTracker.recordUsage(MODEL, inputTokens, outputTokens);
    aiLogger.endTrace(traceCtx, {
      inputTokens, outputTokens,
      status: fullContent ? 'success' : 'error',
      ragUsed, ragResultsCount
    });
    return origEnd();
  };

  callAIStream(messages, res);
});

// ===== 流式题目解析（使用 Prompt 模板 + RAG + 追踪）=====
router.post('/analyze/stream', async (req, res) => {
  const questionId = Number(req.body.question_id);
  const userAnswer = sanitizeText(req.body.user_answer, 200);
  if (!questionId) return res.status(400).json({ success: false, message: '缺少题目 ID' });

  const question = getQuestion(questionId);
  if (!question) return res.status(404).json({ success: false, message: '题目不存在' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!hasApiKey()) {
    const fallback = localAnalysis(question, userAnswer);
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const options = buildOptions(question).join('\n') || '无选项';

  // 检查缓存
  const cached = db.prepare('SELECT content FROM ai_cache WHERE question_id = ? AND type = ?').get(questionId, 'analyze');
  if (cached) {
    const cacheTrace = aiLogger.startTrace({
      userId: req.userId || 0,
      templateId: 'question_analysis',
      requestPath: '/api/ai/analyze/stream',
      requestType: 'analyze'
    });
    aiLogger.endTrace(cacheTrace, { cacheHit: true, status: 'success' });
    res.write(`data: ${JSON.stringify({ content: cached.content })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // RAG 检索：查找相关题目作为参考
  let ragContext = '';
  let ragUsed = false;
  let ragResultsCount = 0;
  try {
    const ragResult = await retriever.retrieveForQuestion(db, question, { topK: 3 });
    if (ragResult.context) {
      ragContext = ragResult.context;
      ragUsed = true;
      ragResultsCount = ragResult.results.length;
    }
  } catch (err) {
    console.log('[Analyze] RAG 检索跳过:', err.message);
  }

  // 使用 Prompt 模板渲染
  const rendered = promptRegistry.render('question_analysis', {
    subject: question.subject_name || '未分类',
    chapter: question.chapter_name || '未分类',
    question_type: question.type,
    difficulty: question.difficulty || 3,
    content: question.content,
    options: options,
    answer: question.answer,
    analysis: question.analysis || '',
    rag_context: ragContext
  });

  const messages = rendered ? rendered.messages : [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `请深度解析这道题：\n科目：${[question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '未分类'}\n题型：${question.type}\n题干：${question.content}\n选项：${options}\n正确答案：${question.answer}` }
  ];

  // 启动追踪
  const traceCtx = aiLogger.startTrace({
    userId: req.userId || 0,
    templateId: rendered?.metadata?.template_id || 'question_analysis_legacy',
    templateVersion: rendered?.metadata?.template_version || '0.0.0',
    requestPath: '/api/ai/analyze/stream',
    requestType: 'analyze'
  });

  // 收集完整内容用于缓存
  let fullContent = '';
  const originalWrite = res.write.bind(res);
  res.write = function(chunk) {
    try {
      const str = chunk.toString();
      if (str.startsWith('data: ') && !str.includes('[DONE]')) {
        const data = JSON.parse(str.slice(6).trim());
        if (data.content) fullContent += data.content;
      }
    } catch {}
    return originalWrite(chunk);
  };
  const originalEnd = res.end.bind(res);
  res.end = function() {
    if (fullContent) {
      try { db.prepare('INSERT OR REPLACE INTO ai_cache (question_id, type, content) VALUES (?, ?, ?)').run(questionId, 'analyze', fullContent); } catch {}
    }
    aiLogger.endTrace(traceCtx, {
      inputTokens: rendered?.estimatedTokens || estimateTokens(messages),
      outputTokens: Math.ceil(fullContent.length * 0.6),
      status: fullContent ? 'success' : 'error',
      ragUsed,
      ragResultsCount
    });
    return originalEnd();
  };

  callAIStream(messages, res);
});

// ===== 一键解析（非流式，供弹窗使用） =====
router.post('/quick-analyze', (req, res) => {
  try {
    const questionId = Number(req.body.question_id);
    const userAnswer = sanitizeText(req.body.user_answer, 200);
    if (!questionId) return res.status(400).json({ success: false, message: '缺少题目 ID' });

    const question = getQuestion(questionId);
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });

    // 尝试缓存
    const cached = db.prepare('SELECT content FROM ai_cache WHERE question_id = ? AND type = ?').get(questionId, 'analyze');
    if (cached) return res.json({ success: true, data: { content: cached.content, cached: true } });

    if (!hasApiKey()) {
      return res.json({ success: true, data: { content: localAnalysis(question, userAnswer), cached: false } });
    }

    const options = buildOptions(question).join('\n') || '无选项';
    let prompt = `请深度解析这道题：
科目：${[question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '未分类'}
题型：${question.type}
题干：${question.content}
选项：${options}
正确答案：${question.answer}`;
    if (userAnswer) prompt += `\n用户答案：${userAnswer}`;
    prompt += `\n\n请按"考点定位→答案依据→易错陷阱→记忆方法"的结构简洁回答。`;

    callAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]).then(content => {
      try { db.prepare('INSERT OR REPLACE INTO ai_cache (question_id, type, content) VALUES (?, ?, ?)').run(questionId, 'analyze', content); } catch {}
      res.json({ success: true, data: { content, cached: false } });
    }).catch(err => {
      const fallback = localAnalysis(question, userAnswer);
      res.json({ success: true, data: { content: fallback, cached: false } });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

function localAnalysis(question, userAnswer) {
  const options = buildOptions(question);
  const subject = [question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '当前章节';
  const analysis = question.analysis || '题库暂未提供标准解析，建议核对教材对应概念。';
  let result = `**题目定位**：${subject}，题型${question.type || '练习题'}。\n**正确答案**：${question.answer}。`;
  if (userAnswer) result += `\n**你的答案**：${userAnswer}。`;
  result += `\n**基础解析**：${analysis}\n**建议**：定位题干关键词，排除与条件不一致的选项，同章节再练2-3道验证掌握。`;
  return result;
}

// ===== 原有接口（兼容） =====
router.post('/analyze', async (req, res) => {
  try {
    const questionId = Number(req.body.question_id);
    if (!questionId) return res.status(400).json({ success: false, message: '缺少题目 ID' });

    const cached = db.prepare('SELECT content FROM ai_cache WHERE question_id = ? AND type = ?').get(questionId, 'analyze');
    if (cached) return res.json({ success: true, data: { content: cached.content, cached: true } });

    const question = getQuestion(questionId);
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });

    const options = buildOptions(question).join('\n') || '无选项';
    const userMessage = `请深度解析这道题：
科目章节：${[question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '未分类'}
题型：${question.type}
题干：${question.content}
选项：${options}
正确答案：${question.answer}
题库解析：${question.analysis || '无'}
请按"考点定位、答案依据、易错陷阱、记忆/复盘建议"的结构回答。`;

    let content;
    try { content = await callAI([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }]); }
    catch { content = localAnalysis(question, ''); }

    db.prepare('INSERT OR REPLACE INTO ai_cache (question_id, type, content) VALUES (?, ?, ?)').run(questionId, 'analyze', content);
    res.json({ success: true, data: { content, cached: false } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ===== 错题诊断（使用 Prompt 模板 + 追踪）=====
router.post('/diagnose', async (req, res) => {
  try {
    const userId = req.userId || 0;
    const wrongs = db.prepare(`
      SELECT q.type, s.name AS subject_name, c.name AS chapter_name, q.content, wq.wrong_count
      FROM wrong_questions wq JOIN questions q ON wq.question_id = q.id
      LEFT JOIN subjects s ON q.subject_id = s.id LEFT JOIN chapters c ON q.chapter_id = c.id
      WHERE wq.user_id = ? ORDER BY wq.last_wrong_at DESC LIMIT 30
    `).all(userId);

    if (wrongs.length === 0) {
      return res.json({ success: true, data: { content: '暂无错题记录，先做练习吧。' } });
    }

    const countByKey = items => items.reduce((acc, item) => { const k = item || '未分类'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const formatCnt = map => Object.entries(map).sort((a,b) => b[1]-a[1]).map(([n,c]) => `${n} ${c}道`).join('；');

    const typeCount = countByKey(wrongs.map(w => w.type));
    const chapterCount = countByKey(wrongs.map(w => [w.subject_name, w.chapter_name].filter(Boolean).join(' / ')));
    const examples = wrongs.slice(0, 5).map((w, i) => `${i + 1}. ${w.content}`).join('\n');

    // 使用 Prompt 模板
    const rendered = promptRegistry.render('wrong_diagnosis', {
      total_wrong: wrongs.length,
      days: 30,
      subject_distribution: formatCnt(countByKey(wrongs.map(w => w.subject_name))),
      chapter_distribution: formatCnt(chapterCount),
      type_stats: formatCnt(typeCount),
      sample_count: Math.min(5, wrongs.length),
      sample_questions: examples
    });

    // 启动追踪
    const traceCtx = aiLogger.startTrace({
      userId,
      templateId: rendered?.metadata?.template_id || 'wrong_diagnosis_legacy',
      templateVersion: rendered?.metadata?.template_version || '0.0.0',
      requestPath: '/api/ai/diagnose',
      requestType: 'diagnose'
    });

    let content;
    try {
      const messages = rendered ? rendered.messages : [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `错题诊断：${wrongs.length}道错题。题型：${formatCnt(typeCount)}。章节：${formatCnt(chapterCount)}。代表：${examples}\n输出：1.薄弱点 2.错误原因 3.3天复习安排 4.提醒。` }
      ];
      content = await callAI(messages, traceCtx);
    } catch {
      aiLogger.endTrace(traceCtx, { status: 'error', error: 'AI调用失败，使用本地降级' });
      const top = Object.entries(chapterCount).sort((a,b) => b[1]-a[1])[0];
      content = `**错题概览**：${wrongs.length}道，${formatCnt(typeCount)}。\n**薄弱位置**：${top?.[0] || '未分类'} ${top?.[1]||0}道。\n**建议**：重做错题→同章节新题→连续3次答对后移除。`;
    }
    res.json({ success: true, data: { content } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/chat', async (req, res) => {
  try {
    const message = sanitizeText(req.body.message, 4000);
    if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...sanitizeHistory(req.body.history), { role: 'user', content: message }];

    let content;
    try { content = await callAI(messages); }
    catch (e) {
      if (!hasApiKey()) {
        content = 'AI 服务未配置 API Key。\n1. 贴题干+选项+答案，我帮你拆解。\n2. 错因归类：概念不清/审题遗漏/记忆混淆。\n3. 同类题连续对3道才算掌握。';
      } else throw e;
    }
    res.json({ success: true, data: { content } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============ RAG 相关接口 ============

// 获取 RAG 索引状态
router.get('/rag/status', (req, res) => {
  const indexer = require('../ai/rag/indexer');
  const stats = vectorStore.getStats(db);
  const indexState = indexer.getIndexState();
  const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  res.json({
    success: true,
    data: {
      embeddingStats: stats,
      totalQuestions: totalQuestions.count,
      indexProgress: indexState,
      model: 'text-embedding-v3',
      dimensions: 1024
    }
  });
});

// 触发索引重建
router.post('/rag/reindex', async (req, res) => {
  try {
    const indexer = require('../ai/rag/indexer');
    const forceRebuild = req.body.force === true;
    if (indexer.getIndexState().isRunning) {
      return res.json({ success: false, message: '索引正在进行中' });
    }
    // 异步启动，不阻塞响应
    indexer.startIndexing(db, { forceRebuild }).catch(err => {
      console.error('[RAG] 重建索引失败:', err.message);
    });
    res.json({ success: true, message: forceRebuild ? '全量重建已启动' : '增量索引已启动' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 语义搜索题目
router.post('/rag/search', async (req, res) => {
  try {
    const query = sanitizeText(req.body.query, 500);
    if (!query) return res.status(400).json({ success: false, message: '请输入搜索内容' });
    
    const result = await retriever.retrieve(db, query, {
      topK: req.body.limit || 5,
      minScore: req.body.minScore || 0.3,
      subjectId: req.body.subject_id,
      includeFullOptions: true
    });

    res.json({
      success: true,
      data: {
        query,
        results: result.results,
        context: result.context,
        usedEmbedding: !!result.queryEmbedding,
        resultCount: result.results.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ Agent 接口 ============
const orchestrator = require('../ai/agent/orchestrator');

// Agent 流式对话（支持工具调用可视化）
router.post('/agent/chat/stream', (req, res) => {
  const message = sanitizeText(req.body.message, 4000);
  if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  orchestrator.runStream(message, res, {
    db,
    userId: req.userId || 0,
    history: sanitizeHistory(req.body.history)
  });
});

// Agent 非流式对话
router.post('/agent/chat', async (req, res) => {
  try {
    const message = sanitizeText(req.body.message, 4000);
    if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

    const result = await orchestrator.run(message, {
      db,
      userId: req.userId || 0,
      history: sanitizeHistory(req.body.history)
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取可用工具列表
router.get('/agent/tools', (req, res) => {
  const toolRegistry = require('../ai/agent/tool-registry');
  const tools = toolRegistry.getToolDefinitions();
  res.json({
    success: true,
    data: tools.map(t => ({
      name: t.function?.name,
      description: t.function?.description,
      parameters: t.function?.parameters
    }))
  });
});

// ============ 智能学习路径接口 ============
const masteryModule = require('../ai/learning/mastery');
const adaptive = require('../ai/learning/adaptive');
const recommender = require('../ai/learning/recommender');

// 获取掌握度数据
router.get('/learning/mastery', (req, res) => {
  try {
    const userId = req.userId || 0;
    const data = masteryModule.getAllMastery(db, userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取今日推荐
router.get('/learning/recommend', (req, res) => {
  try {
    const userId = req.userId || 0;
    const data = recommender.getDailyRecommendation(db, userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取学习路径
router.get('/learning/path', (req, res) => {
  try {
    const userId = req.userId || 0;
    const data = recommender.getLearningPath(db, userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取自适应出题
router.get('/learning/adaptive', (req, res) => {
  try {
    const userId = req.userId || 0;
    const result = adaptive.getAdaptiveQuestions(db, {
      userId,
      subjectId: req.query.subject_id ? Number(req.query.subject_id) : undefined,
      chapterId: req.query.chapter_id ? Number(req.query.chapter_id) : undefined,
      count: Math.min(Number(req.query.count) || 10, 50)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ 评估与治理接口 ============

// 用户反馈（点赞/点踩）
router.post('/feedback', (req, res) => {
  try {
    const { traceId, rating, comment, messageIndex } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: '评分必须在 1-5 之间' });
    }
    const ok = submitFeedback(db, {
      traceId: traceId || '',
      userId: req.userId || 0,
      rating,
      comment: comment || '',
      messageIndex: messageIndex || -1
    });
    res.json({ success: ok, message: ok ? '感谢反馈' : '提交失败' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取 AI 评估报告
router.get('/evaluation', (req, res) => {
  try {
    const period = req.query.period || '7d';
    const report = getEvaluationReport(db, period);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取 A/B 测试配置
router.get('/ab-tests', (req, res) => {
  try {
    const tests = getABTests();
    res.json({ success: true, data: tests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取 A/B 测试结果
router.get('/ab-test/:promptId', (req, res) => {
  try {
    const { promptId } = req.params;
    const period = req.query.period || '7d';
    const results = getABTestResults(db, promptId, period);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取成本汇总
router.get('/cost-summary', (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 7, 90);
    const summary = costTracker.getCostSummary(days);
    const today = costTracker.getDailyCost();
    res.json({
      success: true,
      data: {
        today,
        history: summary,
        pricing: costTracker.PRICING
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取熔断器状态
router.get('/circuit-status', (req, res) => {
  try {
    const status = circuitBreaker.getAllStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 手动重置熔断器（管理接口）
router.post('/circuit-reset', (req, res) => {
  try {
    const name = req.body.name || 'default';
    circuitBreaker.reset(name);
    res.json({ success: true, message: `熔断器 ${name} 已重置` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取限流状态
router.get('/rate-limit-status', (req, res) => {
  try {
    const userId = req.userId || 0;
    const userCheck = checkLimit(userId);
    res.json({
      success: true,
      data: {
        user: userCheck,
        config: {
          userDailyLimit: require('../ai/governance/rate-limiter').CONFIG.userDailyLimit,
          globalPerMinute: require('../ai/governance/rate-limiter').CONFIG.globalPerMinute
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ 知识图谱接口 ============
const graphBuilder = require('../ai/knowledge/graph-builder');

// 获取知识图谱数据
router.get('/knowledge-graph', (req, res) => {
  try {
    const userId = req.userId || 0;
    const graph = graphBuilder.buildFromDatabase(db, userId);
    const graphStats = graphBuilder.getStats(graph);
    res.json({ success: true, data: { graph, stats: graphStats } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// AI增强知识图谱（消耗token）
router.post('/knowledge-graph/ai', async (req, res) => {
  try {
    const subjectId = Number(req.body.subject_id);
    if (!subjectId) return res.status(400).json({ success: false, message: '请指定科目' });

    const aiGraph = await graphBuilder.buildWithAI(db, callAI, subjectId);
    if (!aiGraph) {
      return res.json({ success: true, data: null, message: 'AI构建失败，已降级为统计模式' });
    }
    res.json({ success: true, data: aiGraph });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============ AI智能组卷接口 ============
const smartExam = require('../ai/exam/smart-exam');

// 生成智能试卷
router.post('/smart-exam', (req, res) => {
  try {
    const userId = req.userId || 0;
    const {
      totalCount = 20,
      subjectIds = [],
      mode = 'balanced',
      timeLimit = 30
    } = req.body;

    const result = smartExam.generateSmartExam(db, {
      userId,
      totalCount: Math.min(totalCount, 100),
      subjectIds,
      mode,
      timeLimit
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取用户画像
router.get('/user-profile', (req, res) => {
  try {
    const userId = req.userId || 0;
    const profile = smartExam.analyzeUserProfile(db, userId);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
