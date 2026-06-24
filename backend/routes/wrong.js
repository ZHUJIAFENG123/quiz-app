const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取错题列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, subject_id } = req.query;
    const userId = req.userId || 0;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    let where = ['wq.user_id = ?'];
    let params = [userId];
    if (subject_id) { where.push('q.subject_id = ?'); params.push(subject_id); }
    
    const whereClause = 'WHERE ' + where.join(' AND ');
    
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM wrong_questions wq
      JOIN questions q ON wq.question_id = q.id
      ${whereClause}
    `).get(...params);
    
    const list = db.prepare(`
      SELECT q.*, wq.id as wrong_id, wq.question_id, c.name as chapter_name, s.name as subject_name, wq.wrong_count, wq.last_wrong_at
      FROM wrong_questions wq
      JOIN questions q ON wq.question_id = q.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      ${whereClause}
      ORDER BY wq.last_wrong_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    const ids = list.map(q => q.id);
    let favorites = new Set();
    let lastAnswers = {};
    if (ids.length > 0) {
      const favRows = db.prepare(
        `SELECT question_id FROM favorites WHERE question_id IN (${ids.map(() => '?').join(',')}) AND user_id = ?`
      ).all(...ids, userId);
      favRows.forEach(r => favorites.add(r.question_id));

      const answerRows = db.prepare(`
        SELECT question_id, user_answer FROM study_records 
        WHERE question_id IN (${ids.map(() => '?').join(',')}) AND is_correct = 0 AND user_id = ?
        ORDER BY id DESC
      `).all(...ids, userId);
      answerRows.forEach(r => {
        if (!lastAnswers[r.question_id]) lastAnswers[r.question_id] = r.user_answer;
      });
    }
    
    res.json({
      success: true,
      data: {
        list: list.map(q => ({ ...q, is_favorite: favorites.has(q.id), user_answer: lastAnswers[q.id] || '' })),
        total: total.count,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 移除错题
router.delete('/:questionId', (req, res) => {
  try {
    const userId = req.userId || 0;
    db.prepare('DELETE FROM wrong_questions WHERE question_id = ? AND user_id = ?').run(req.params.questionId, userId);
    res.json({ success: true, message: '已从错题本移除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量移除错题
router.post('/batch-remove', (req, res) => {
  try {
    const userId = req.userId || 0;
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请提供要移除的题目ID列表' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM wrong_questions WHERE question_id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
    res.json({ success: true, message: '批量移除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
