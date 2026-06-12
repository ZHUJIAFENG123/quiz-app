const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取所有科目
router.get('/', (req, res) => {
  try {
    const subjects = db.prepare('SELECT * FROM subjects ORDER BY sort_order ASC, id ASC').all();
    res.json({ success: true, data: subjects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取单个科目
router.get('/:id', (req, res) => {
  try {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
    if (!subject) return res.status(404).json({ success: false, message: '科目不存在' });
    res.json({ success: true, data: subject });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建科目
router.post('/', (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '科目名称不能为空' });
    
    const stmt = db.prepare('INSERT INTO subjects (name, description, sort_order) VALUES (?, ?, ?)');
    const result = stmt.run(name, description || '', sort_order || 0);
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, message: '科目名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新科目
router.put('/:id', (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    const existing = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '科目不存在' });
    
    db.prepare('UPDATE subjects SET name=?, description=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(name || existing.name, description !== undefined ? description : existing.description, sort_order !== undefined ? sort_order : existing.sort_order, req.params.id);
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除科目
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM subjects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '科目不存在' });
    
    db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
