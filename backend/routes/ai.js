const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.warn('[AI] 未配置 DEEPSEEK_API_KEY 环境变量，AI 功能将使用离线模式');
}
const DEEPSEEK_URL = 'api.deepseek.com';
const MODEL = 'deepseek-chat';
const MAX_TOKENS = 800;
const TEMPERATURE = 0.7;

const SYSTEM_PROMPT = `你是一个专业、耐心、务实的刷题备考助手，服务于“公共基础知识”和“专业知识”题库。

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
    .map(item => ({
      role: item.role,
      content: sanitizeText(item.content, 1200)
    }))
    .filter(item => item.content)
    .slice(-10);
}

function hasApiKey() {
  return Boolean(DEEPSEEK_API_KEY && DEEPSEEK_API_KEY.startsWith('sk-'));
}

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    if (!hasApiKey()) {
      reject(new Error('AI 服务未配置 DEEPSEEK_API_KEY'));
      return;
    }

    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream: false
    });

    const options = {
      hostname: DEEPSEEK_URL,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };

    const req = https.request(options, response => {
      let data = '';
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (response.statusCode >= 400) {
            reject(new Error(json.error?.message || `AI 服务返回 ${response.statusCode}`));
            return;
          }

          const content = json.choices?.[0]?.message?.content;
          if (content) {
            resolve(content.trim());
          } else {
            reject(new Error('AI 服务没有返回有效内容'));
          }
        } catch {
          reject(new Error('解析 AI 响应失败'));
        }
      });
    });

    req.on('error', error => reject(new Error(`AI 服务连接失败：${error.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AI 服务响应超时'));
    });
    req.write(body);
    req.end();
  });
}

function getQuestion(questionId) {
  return db.prepare(`
    SELECT q.*, s.name AS subject_name, c.name AS chapter_name
    FROM questions q
    LEFT JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE q.id = ?
  `).get(questionId);
}

function buildOptions(question) {
  const options = [];
  if (question.option_a) options.push(`A. ${question.option_a}`);
  if (question.option_b) options.push(`B. ${question.option_b}`);
  if (question.option_c) options.push(`C. ${question.option_c}`);
  if (question.option_d) options.push(`D. ${question.option_d}`);
  return options;
}

function localQuestionAnalysis(question) {
  const options = buildOptions(question);
  const subject = [question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '当前章节';
  const analysis = question.analysis || '题库暂未提供标准解析，建议回到教材或课堂笔记核对对应概念。';

  return [
    `**题目定位**：${subject}，题型为${question.type || '练习题'}。`,
    `**正确答案**：${question.answer}。`,
    `**基础解析**：${analysis}`,
    options.length ? `**选项回看**：先把每个选项对应到题干关键词，再排除与题干条件不一致、表述过于绝对或概念混淆的选项。` : '',
    `**复盘建议**：把本题考点写成一句话，再找 2-3 道同章节题验证是否真的掌握。`
  ].filter(Boolean).join('\n');
}

function getWrongQuestions(userId) {
  return db.prepare(`
    SELECT q.type, s.name AS subject_name, c.name AS chapter_name, q.content, wq.wrong_count
    FROM wrong_questions wq
    JOIN questions q ON wq.question_id = q.id
    LEFT JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE wq.user_id = ?
    ORDER BY wq.last_wrong_at DESC
    LIMIT 30
  `).all(userId);
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || '未分类';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatCount(countMap) {
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} ${count} 道`)
    .join('；');
}

function localDiagnosis(wrongs) {
  if (wrongs.length === 0) {
    return '你目前还没有错题记录。先完成一组练习，系统有数据后我可以帮你定位薄弱章节和题型。';
  }

  const typeCount = countBy(wrongs, item => item.type);
  const chapterCount = countBy(wrongs, item => [item.subject_name, item.chapter_name].filter(Boolean).join(' / '));
  const topChapter = Object.entries(chapterCount).sort((a, b) => b[1] - a[1])[0];

  return [
    `**错题概览**：最近 ${wrongs.length} 道错题中，题型分布为：${formatCount(typeCount)}。`,
    `**薄弱位置**：最需要优先复盘的是“${topChapter?.[0] || '未分类章节'}”，出现 ${topChapter?.[1] || 0} 道错题。`,
    `**复盘动作**：今天先重做这些错题，只看题干关键词和答案依据；明天再做同章节新题，检验是否迁移成功。`,
    `**提分建议**：每道错题补一句“我当时错在什么判断”，连续 3 次答对后再从错题本移除。`
  ].join('\n');
}

router.post('/analyze', async (req, res) => {
  try {
    const questionId = Number(req.body.question_id);
    if (!questionId) {
      return res.status(400).json({ success: false, message: '缺少题目 ID' });
    }

    const cached = db.prepare('SELECT content FROM ai_cache WHERE question_id = ? AND type = ?').get(questionId, 'analyze');
    if (cached) {
      return res.json({ success: true, data: { content: cached.content, cached: true } });
    }

    const question = getQuestion(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: '题目不存在' });
    }

    const options = buildOptions(question).join('\n') || '无选项';
    const userMessage = `请深度解析这道题：

科目章节：${[question.subject_name, question.chapter_name].filter(Boolean).join(' / ') || '未分类'}
题型：${question.type}
题干：${question.content}
选项：
${options}
正确答案：${question.answer}
题库解析：${question.analysis || '无'}

请按“考点定位、答案依据、易错陷阱、记忆/复盘建议”的结构回答。`;

    let content;
    try {
      content = await callDeepSeek([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]);
    } catch (error) {
      content = localQuestionAnalysis(question);
    }

    db.prepare('INSERT OR REPLACE INTO ai_cache (question_id, type, content) VALUES (?, ?, ?)').run(questionId, 'analyze', content);
    res.json({ success: true, data: { content, cached: false } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/diagnose', async (req, res) => {
  try {
    const userId = req.userId || 0;
    const wrongs = getWrongQuestions(userId);

    if (wrongs.length === 0) {
      return res.json({ success: true, data: { content: localDiagnosis(wrongs) } });
    }

    const typeCount = countBy(wrongs, item => item.type);
    const chapterCount = countBy(wrongs, item => [item.subject_name, item.chapter_name].filter(Boolean).join(' / '));
    const examples = wrongs.slice(0, 5).map((item, index) => `${index + 1}. ${item.content}`).join('\n');

    const prompt = `请根据用户最近 ${wrongs.length} 道错题做学习诊断。

题型分布：${formatCount(typeCount)}
章节分布：${formatCount(chapterCount)}
代表错题：
${examples}

请输出：1. 主要薄弱点；2. 可能错误原因；3. 未来 3 天复习安排；4. 刷题提醒。`;

    let content;
    try {
      content = await callDeepSeek([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);
    } catch {
      content = localDiagnosis(wrongs);
    }

    res.json({ success: true, data: { content } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const message = sanitizeText(req.body.message, 4000);
    if (!message) {
      return res.status(400).json({ success: false, message: '请输入问题' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizeHistory(req.body.history),
      { role: 'user', content: message }
    ];

    let content;
    try {
      content = await callDeepSeek(messages);
    } catch (error) {
      if (hasApiKey()) throw error;
      content = [
        'AI 模型服务还没有配置 API Key，我先给你一个可执行的离线建议：',
        '',
        '1. 如果你在问某道题，请贴出题干、选项、你的答案和正确答案。',
        '2. 先定位题干关键词，再回到章节概念，判断每个选项与关键词是否匹配。',
        '3. 把错因归成一类：概念不清、审题遗漏、记忆混淆、排除法失误。',
        '4. 同类题连续做对 3 道，才说明这个点基本稳住了。',
        '',
        '配置 `DEEPSEEK_API_KEY` 后，我就可以继续给出更完整的个性化回答。'
      ].join('\n');
    }

    res.json({ success: true, data: { content } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
