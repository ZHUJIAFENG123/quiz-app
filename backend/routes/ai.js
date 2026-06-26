const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');

const AI_API_KEY = process.env.AI_API_KEY || '';
if (!AI_API_KEY) {
  console.warn('[AI] ⚠️ 未配置 AI_API_KEY 环境变量，AI 功能将使用本地降级分析。请在 .env 中设置 AI_API_KEY。');
}
const AI_URL = 'dashscope.aliyuncs.com';
const AI_PATH = '/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-turbo';
const MAX_TOKENS = 1200;
const TEMPERATURE = 0.7;

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

// ===== 非流式调用 =====
function callAI(messages) {
  return new Promise((resolve, reject) => {
    if (!hasApiKey()) { reject(new Error('AI 服务未配置')); return; }
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
          if (response.statusCode >= 400) { reject(new Error(json.error?.message || `AI 返回 ${response.statusCode}`)); return; }
          const content = json.choices?.[0]?.message?.content;
          content ? resolve(content.trim()) : reject(new Error('AI 无有效内容'));
        } catch { reject(new Error('解析 AI 响应失败')); }
      });
    });
    req.on('error', e => reject(new Error(`AI 连接失败：${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('AI 响应超时')); });
    req.write(body); req.end();
  });
}

// ===== 流式调用 =====
function callAIStream(messages, res) {
  if (!hasApiKey()) {
    res.write(`data: ${JSON.stringify({ error: 'AI 服务未配置' })}\n\n`);
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
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  });
  apiReq.on('timeout', () => {
    apiReq.destroy();
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

// ===== 流式聊天 =====
router.post('/chat/stream', (req, res) => {
  const message = sanitizeText(req.body.message, 4000);
  if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeHistory(req.body.history),
    { role: 'user', content: message }
  ];

  if (!hasApiKey()) {
    res.write(`data: ${JSON.stringify({ content: 'AI 服务未配置 API Key，请在环境变量中设置 AI_API_KEY。' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  callAIStream(messages, res);
});

// ===== 流式题目解析 =====
router.post('/analyze/stream', (req, res) => {
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
  let prompt = `请深度解析这道题：
科目：${[question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '未分类'}
题型：${question.type}
题干：${question.content}
选项：${options}
正确答案：${question.answer}`;

  if (userAnswer) prompt += `\n用户答案：${userAnswer}`;
  prompt += `\n\n请按"考点定位→答案依据→易错陷阱→记忆方法"的结构简洁回答。`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  const cached = db.prepare('SELECT content FROM ai_cache WHERE question_id = ? AND type = ?').get(questionId, 'analyze');
  if (cached) {
    res.write(`data: ${JSON.stringify({ content: cached.content })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

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
    const prompt = `错题诊断：${wrongs.length}道错题。题型：${formatCnt(typeCount)}。章节：${formatCnt(chapterCount)}。代表：${examples}\n输出：1.薄弱点 2.错误原因 3.3天复习安排 4.提醒。`;

    let content;
    try { content = await callAI([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }]); }
    catch {
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

module.exports = router;
