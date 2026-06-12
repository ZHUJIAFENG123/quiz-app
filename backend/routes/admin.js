const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../config/db');
const { parseQuestionsFromExcel, exportQuestionsToExcel } = require('../utils/excel');

// 配置文件上传
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx, .xls, .csv 格式文件'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 批量导入题目
router.post('/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    
    const { questions, errors } = parseQuestionsFromExcel(req.file.path);
    
    if (questions.length === 0) {
      // 清理上传的文件
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: '未解析到有效题目数据', errors });
    }
    
    let imported = 0;
    const importErrors = [...errors];
    
    const insertStmt = db.prepare(`
      INSERT INTO questions (subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const q of questions) {
        // 查找或创建科目
        let subject = db.prepare('SELECT id FROM subjects WHERE name = ?').get(q.subjectName);
        if (!subject) {
          subject = db.prepare('INSERT INTO subjects (name) VALUES (?)').run(q.subjectName);
          subject = { id: subject.lastInsertRowid };
        }
        
        // 查找或创建章节
        let chapter = db.prepare('SELECT id FROM chapters WHERE name = ? AND subject_id = ?').get(q.chapterName, subject.id);
        if (!chapter) {
          chapter = db.prepare('INSERT INTO chapters (subject_id, name) VALUES (?, ?)').run(subject.id, q.chapterName);
          chapter = { id: chapter.lastInsertRowid };
        }
        
        insertStmt.run(subject.id, chapter.id, q.type, q.content, 
          q.optionA, q.optionB, q.optionC, q.optionD, q.answer, q.analysis, 1);
        imported++;
      }
    });
    
    transaction();
    
    // 清理上传的文件
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      data: { imported, total: questions.length },
      message: `成功导入 ${imported} 道题目`,
      errors: importErrors
    });
  } catch (err) {
    // 尝试清理文件
    try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量导出题目
router.get('/export', (req, res) => {
  try {
    const { subject_id, chapter_id, type } = req.query;
    
    let where = ['1=1'];
    let params = [];
    if (subject_id) { where.push('q.subject_id = ?'); params.push(subject_id); }
    if (chapter_id) { where.push('q.chapter_id = ?'); params.push(chapter_id); }
    if (type) { where.push('q.type = ?'); params.push(type); }
    
    const questions = db.prepare(`
      SELECT q.*, c.name as chapter_name, s.name as subject_name
      FROM questions q
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE ${where.join(' AND ')}
      ORDER BY s.name, c.name, q.id
    `).all(...params);
    
    const buffer = exportQuestionsToExcel(questions);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="题库导出_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取统计分析
router.get('/stats', (req, res) => {
  try {
    const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
    const byType = db.prepare('SELECT type, COUNT(*) as count FROM questions GROUP BY type').all();
    const bySubject = db.prepare(`
      SELECT s.name, COUNT(q.id) as count 
      FROM subjects s LEFT JOIN questions q ON s.id = q.subject_id 
      GROUP BY s.id ORDER BY count DESC
    `).all();
    
    res.json({
      success: true,
      data: {
        total_questions: totalQuestions.count,
        by_type: byType,
        by_subject: bySubject
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
