const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-4bccc715caed408aab0048dde50c44c8';
const DEEPSEEK_URL = 'api.deepseek.com';
const MODEL = 'deepseek-chat';
const MAX_TOKENS = 800;
const TEMPERATURE = 0.7;

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的考试备考助手，帮助用户解答"公共基础知识"和"专业知识"题目。
你的回答风格：
- 简洁清晰，直接给考点
- 解释为什么不选其他选项（一两条关键理由）
- 如果适合，给一个记忆口诀或技巧
- 语言友好，像老师一样
- 回答控制在200字以内`;

// 调用 DeepSeek API
function callDeepSeek(messages, onData) {
  return new Promise((resolve, reject) => {
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
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error(json.error?.message || '无返回内容'));
          }
        } catch (e) {
          reject(new Error('解析AI响应失败'));
        }
      });
    });
    req.on('error', e => reject(new Error('AI服务连接失败: ' + e.message)));
    req.on('timeout', () => { req.destroy(); reject(new Error('AI服务超时')); });
    req.write(body);
    req.end();
  });
}

// ===== 题目深度解析 =====
router.post('/analyze', async (req, res) => {
  try {
    const { question_id } = req.body;
    if (!question_id) return res.status(400).json({ success: false, message: '缺少题目ID' });

    // 查缓存
    const cached = db.prepare('SELECT * FROM ai_cache WHERE question_id = ? AND type = ?').get(question_id, 'analyze');
    if (cached) {
      return res.json({ success: true, data: { content: cached.content, cached: true } });
    }

    // 查询题目
    const q = db.prepare(`
      SELECT q.*, s.name as subject_name, c.name as chapter_name
      FROM questions q
      LEFT JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      WHERE q.id = ?
    `).get(question_id);
    if (!q) return res.status(404).json({ success: false, message: '题目不存在' });

    // 构建选项文本
    const opts = [];
    if (q.option_a) opts.push(`A. ${q.option_a}`);
    if (q.option_b) opts.push(`B. ${q.option_b}`);
    if (q.option_c) opts.push(`C. ${q.option_c}`);
    if (q.option_d) opts.push(`D. ${q.option_d}`);

    const userMessage = `请帮我分析这道${q.subject_name ? q.subject_name + '·' : ''}${q.chapter_name || ''}的${q.type}：

题目：${q.content}

选项：
${opts.join('\n')}

正确答案：${q.answer}
标准解析：${q.analysis || '无'}

请用通俗易懂的方式解释这道题，包括考点分析和易混淆点。`;

    const content = await callDeepSeek([
      { role: 'system', content: '你是专业的公考备考辅导老师，擅长把复杂知识点拆解成通俗易懂的讲解。回答控制在200字以内。' },
      { role: 'user', content: userMessage }
    ]);

    // 缓存结果
    db.prepare('INSERT OR REPLACE INTO ai_cache (question_id, type, content) VALUES (?, ?, ?)').run(question_id, 'analyze', content);

    res.json({ success: true, data: { content, cached: false } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 错题诊断 =====
router.post('/diagnose', async (req, res) => {
  try {
    const userId = req.userId || 0;
    const userId_ = userId;
    
    // 获取最近30道错题
    const wrongs = db.prepare(`
      SELECT q.type, s.name as subject_name, c.name as chapter_name, q.content, wq.wrong_count
      FROM wrong_questions wq
      JOIN questions q ON wq.question_id = q.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      WHERE wq.user_id = ?
      ORDER BY wq.last_wrong_at DESC
      LIMIT 30
    `).all(userId_);

    if (wrongs.length === 0) {
      return res.json({ success: true, data: { content: '你目前还没有错题记录，继续保持！' } });
    }

    // 统计错题分布
    const typeCount = {};
    const chapterCount = {};
    wrongs.forEach(w => {
      typeCount[w.type] = (typeCount[w.type] || 0) + 1;
      const key = `${w.subject_name || ''}·${w.chapter_name || ''}`;
      chapterCount[key] = (chapterCount[key] || 0) + 1;
    });

    const summary = `最近${wrongs.length}道错题分布：
- 题型：${Object.entries(typeCount).map(([k,v]) => `${k}${v}道`).join('，')}
- 章节：${Object.entries(chapterCount).map(([k,v]) => `${k}(${v})`).join('，')}

请根据以上错题分布，帮用户诊断薄弱环节，并给出针对性的复习建议和备考策略。200字以内。`;

    const content = await callDeepSeek([
      { role: 'system', content: '你是专业的考试备考教练，擅长分析学习数据并给出针对性建议。回答简洁实用，200字以内。' },
      { role: 'user', content: summary }
    ]);

    res.json({ success: true, data: { content } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 自由对话 =====
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, message: '请输入问题' });

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-10), // 最近10轮对话
      { role: 'user', content: message }
    ];

    const content = await callDeepSeek(messages);

    res.json({ success: true, data: { content } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
