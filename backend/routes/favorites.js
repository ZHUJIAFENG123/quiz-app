const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取收藏列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    const total = db.prepare('SELECT COUNT(*) as count FROM favorites').get();
    
    const list = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name, f.created_at as favorited_at
      FROM favorites f
      JOIN questions q ON f.question_id = q.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    res.json({
      success: true,
      data: {
        list: list.map(q => ({ ...q, is_favorite: true })),
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

// 添加收藏
router.post('/:questionId', (req, res) => {
  try {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.questionId);
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });
    
    const existing = db.prepare('SELECT * FROM favorites WHERE question_id = ?').get(req.params.questionId);
    if (existing) return res.json({ success: true, message: '已收藏' });
    
    db.prepare('INSERT INTO favorites (question_id) VALUES (?)').run(req.params.questionId);
    res.status(201).json({ success: true, message: '收藏成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 取消收藏
router.delete('/:questionId', (req, res) => {
  try {
    db.prepare('DELETE FROM favorites WHERE question_id = ?').run(req.params.questionId);
    res.json({ success: true, message: '已取消收藏' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量取消收藏
router.post('/batch-remove', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请提供要取消收藏的题目ID列表' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM favorites WHERE question_id IN (${placeholders})`).run(...ids);
    res.json({ success: true, message: '批量取消收藏成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
