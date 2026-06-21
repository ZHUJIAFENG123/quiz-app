const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取某科目下的所有章节
router.get('/', (req, res) => {
  try {
    const { subject_id } = req.query;
    let chapters;
    if (subject_id) {
      chapters = db.prepare('SELECT * FROM chapters WHERE subject_id = ? ORDER BY sort_order ASC, id ASC').all(subject_id);
    } else {
      chapters = db.prepare(`
        SELECT c.*, s.name as subject_name 
        FROM chapters c LEFT JOIN subjects s ON c.subject_id = s.id 
        ORDER BY c.sort_order ASC, c.id ASC
      `).all();
    }
    res.json({ success: true, data: chapters });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取单个章节
router.get('/:id', (req, res) => {
  try {
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
    if (!chapter) return res.status(404).json({ success: false, message: '章节不存在' });
    res.json({ success: true, data: chapter });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建章节
router.post('/', (req, res) => {
  try {
    const { subject_id, name, description, sort_order } = req.body;
    if (!subject_id) return res.status(400).json({ success: false, message: '所属科目不能为空' });
    if (!name) return res.status(400).json({ success: false, message: '章节名称不能为空' });
    
    const stmt = db.prepare('INSERT INTO chapters (subject_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const result = stmt.run(subject_id, name, description || '', sort_order || 0);
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新章节
router.put('/:id', (req, res) => {
  try {
    const { name, description, sort_order, subject_id } = req.body;
    const existing = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '章节不存在' });
    
    db.prepare('UPDATE chapters SET name=?, description=?, sort_order=?, subject_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(name || existing.name, description !== undefined ? description : existing.description, sort_order !== undefined ? sort_order : existing.sort_order, subject_id || existing.subject_id, req.params.id);
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除章节
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '章节不存在' });
    
    db.prepare('DELETE FROM chapters WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取章节下的题目数量
router.get('/:id/question-count', (req, res) => {
  try {
    const counts = db.prepare(`
      SELECT type, COUNT(*) as count FROM questions 
      WHERE chapter_id = ? GROUP BY type
    `).all(req.params.id);
    
    const total = db.prepare('SELECT COUNT(*) as count FROM questions WHERE chapter_id = ?').get(req.params.id);
    const result = { total: total.count };
    for (const row of counts) {
      if (row.type === '单选') result.single_count = row.count;
      if (row.type === '多选') result.multi_count = row.count;
      if (row.type === '判断') result.judge_count = row.count;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
