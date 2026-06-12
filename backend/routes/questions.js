const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取题目列表（分页+筛选）
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, subject_id, chapter_id, type, keyword } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    
    let where = ['1=1'];
    let params = [];
    
    if (subject_id) { where.push('q.subject_id = ?'); params.push(subject_id); }
    if (chapter_id) { where.push('q.chapter_id = ?'); params.push(chapter_id); }
    if (type) { where.push('q.type = ?'); params.push(type); }
    if (keyword) { where.push('q.content LIKE ?'); params.push(`%${keyword}%`); }
    
    const whereClause = where.join(' AND ');
    
    const total = db.prepare(`SELECT COUNT(*) as count FROM questions q WHERE ${whereClause}`).get(...params);
    
    const questions = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name
      FROM questions q
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE ${whereClause}
      ORDER BY q.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    
    res.json({
      success: true,
      data: {
        list: questions,
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

// 获取单个题目
router.get('/:id', (req, res) => {
  try {
    const question = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name
      FROM questions q
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE q.id = ?
    `).get(req.params.id);
    
    if (!question) return res.status(404).json({ success: false, message: '题目不存在' });
    
    // 检查是否已收藏
    const fav = db.prepare('SELECT 1 FROM favorites WHERE question_id = ?').get(question.id);
    question.is_favorite = !!fav;
    
    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建题目
router.post('/', (req, res) => {
  try {
    const { subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty } = req.body;
    
    if (!subject_id || !chapter_id) return res.status(400).json({ success: false, message: '科目和章节不能为空' });
    if (!type || !['单选', '多选', '判断'].includes(type)) return res.status(400).json({ success: false, message: '题型无效' });
    if (!content) return res.status(400).json({ success: false, message: '题目内容不能为空' });
    if (!answer) return res.status(400).json({ success: false, message: '正确答案不能为空' });
    
    const stmt = db.prepare(`
      INSERT INTO questions (subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(subject_id, chapter_id, type, content, option_a || '', option_b || '', option_c || '', option_d || '', answer, analysis || '', difficulty || 1);
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新题目
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '题目不存在' });
    
    const { subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty } = req.body;
    
    db.prepare(`
      UPDATE questions SET subject_id=?, chapter_id=?, type=?, content=?, option_a=?, option_b=?, option_c=?, option_d=?, answer=?, analysis=?, difficulty=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      subject_id || existing.subject_id,
      chapter_id || existing.chapter_id,
      type || existing.type,
      content || existing.content,
      option_a !== undefined ? option_a : existing.option_a,
      option_b !== undefined ? option_b : existing.option_b,
      option_c !== undefined ? option_c : existing.option_c,
      option_d !== undefined ? option_d : existing.option_d,
      answer || existing.answer,
      analysis !== undefined ? analysis : existing.analysis,
      difficulty || existing.difficulty,
      req.params.id
    );
    res.json({ success: true, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除题目
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '题目不存在' });
    
    db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量删除题目
router.post('/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请提供要删除的题目ID列表' });
    }
    
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM questions WHERE id IN (${placeholders})`).run(...ids);
    res.json({ success: true, message: `成功删除${result.changes}道题目` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
