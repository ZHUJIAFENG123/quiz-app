const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取练习题目列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, subject_id, chapter_id, type, mode = 'order' } = req.query;
    const userId = req.userId || 0;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    let where = ['1=1'];
    let params = [];
    
    if (subject_id) { where.push('q.subject_id = ?'); params.push(subject_id); }
    if (chapter_id) { where.push('q.chapter_id = ?'); params.push(chapter_id); }
    if (type) { where.push('q.type = ?'); params.push(type); }
    
    const whereClause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as count FROM questions q WHERE ${whereClause}`).get(...params);
    
    let orderBy = 'q.id ASC';
    if (mode === 'random') orderBy = 'RANDOM()';
    
    const questions = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name
      FROM questions q
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    const ids = questions.map(q => q.id);
    let favorites = new Set();
    if (ids.length > 0) {
      const favRows = db.prepare(
        `SELECT question_id FROM favorites WHERE question_id IN (${ids.map(() => '?').join(',')}) AND user_id = ?`
      ).all(...ids, userId);
      favRows.forEach(r => favorites.add(r.question_id));
    }
    
    const list = questions.map(q => ({ ...q, is_favorite: favorites.has(q.id) }));
    
    res.json({
      success: true,
      data: { list, total: total.count, page: parseInt(page), pageSize: limit, totalPages: Math.ceil(total.count / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取练习题目详情
router.get('/:id', (req, res) => {
  try {
    const userId = req.userId || 0;
    const question = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name
      FROM questions q
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE q.id = ?
    `).get(req.params.id);
    
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });
    
    const fav = db.prepare('SELECT 1 FROM favorites WHERE question_id = ? AND user_id = ?').get(question.id, userId);
    question.is_favorite = !!fav;
    
    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 提交答题结果
router.post('/answer', (req, res) => {
  try {
    const { question_id, user_answer, mode = 'practice', exam_session_id } = req.body;
    const userId = req.userId || 0;
    
    if (!question_id) return res.status(400).json({ success: false, message: '题目ID不能为空' });
    if (user_answer === undefined || user_answer === null) return res.status(400).json({ success: false, message: '答案不能为空' });
    
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });
    
    let isCorrect = false;
    if (question.type === '多选') {
      const corrects = question.answer.split(',').map(a => a.trim()).sort().join('');
      const userAnswers = user_answer.split(',').map(a => a.trim()).sort().join('');
      isCorrect = corrects === userAnswers;
    } else {
      isCorrect = question.answer.trim() === user_answer.trim();
    }
    
    db.prepare('INSERT INTO study_records (question_id, user_answer, is_correct, mode, exam_session_id, user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(question_id, user_answer, isCorrect ? 1 : 0, mode, exam_session_id || null, userId);
    
    if (!isCorrect) {
      const existing = db.prepare('SELECT * FROM wrong_questions WHERE question_id = ? AND user_id = ?').get(question_id, userId);
      if (existing) {
        db.prepare('UPDATE wrong_questions SET wrong_count = wrong_count + 1, last_wrong_at = CURRENT_TIMESTAMP WHERE question_id = ? AND user_id = ?')
          .run(question_id, userId);
      } else {
        db.prepare('INSERT INTO wrong_questions (question_id, user_id) VALUES (?, ?)').run(question_id, userId);
      }
    }
    
    res.json({
      success: true,
      data: { is_correct: isCorrect, correct_answer: question.answer, analysis: question.analysis }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 切换收藏
router.post('/:id/toggle-favorite', (req, res) => {
  try {
    const userId = req.userId || 0;
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });
    
    const existing = db.prepare('SELECT * FROM favorites WHERE question_id = ? AND user_id = ?').get(req.params.id, userId);
    if (existing) {
      db.prepare('DELETE FROM favorites WHERE question_id = ? AND user_id = ?').run(req.params.id, userId);
      res.json({ success: true, data: { is_favorite: false }, message: '已取消收藏' });
    } else {
      db.prepare('INSERT INTO favorites (question_id, user_id) VALUES (?, ?)').run(req.params.id, userId);
      res.json({ success: true, data: { is_favorite: true }, message: '已添加收藏' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
