const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// 生成考试题目
router.post('/generate', (req, res) => {
  try {
    const { subject_id, chapter_id, type, count = 50, duration = 45 } = req.body;
    const userId = req.userId || 0;
    
    let where = ['1=1'];
    let params = [];
    
    if (subject_id) { where.push('subject_id = ?'); params.push(subject_id); }
    if (chapter_id) { where.push('chapter_id = ?'); params.push(chapter_id); }
    if (type) { where.push('type = ?'); params.push(type); }
    
    const whereClause = where.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as count FROM questions WHERE ${whereClause}`).get(...params);
    
    if (total.count === 0) {
      return res.status(400).json({ success: false, message: '没有符合条件的题目' });
    }
    
    const examCount = Math.min(parseInt(count), total.count);
    const sessionId = uuidv4();
    
    const questions = db.prepare(`
      SELECT id, type, content, option_a, option_b, option_c, option_d, chapter_id, subject_id, difficulty
      FROM questions WHERE ${whereClause}
      ORDER BY RANDOM() LIMIT ?
    `).all(...params, examCount);
    
    res.json({
      success: true,
      data: {
        session_id: sessionId,
        questions: questions.map(q => ({
          ...q,
          answer: undefined,
          analysis: undefined
        })),
        total: examCount,
        duration: parseInt(duration)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 提交考试答案
router.post('/:sessionId/answer', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { question_id, user_answer } = req.body;
    const userId = req.userId || 0;
    
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
      .run(question_id, user_answer, isCorrect ? 1 : 0, 'exam', sessionId, userId);
    
    if (!isCorrect) {
      const existing = db.prepare('SELECT * FROM wrong_questions WHERE question_id = ? AND user_id = ?').get(question_id, userId);
      if (existing) {
        db.prepare('UPDATE wrong_questions SET wrong_count = wrong_count + 1, last_wrong_at = CURRENT_TIMESTAMP WHERE question_id = ? AND user_id = ?')
          .run(question_id, userId);
      } else {
        db.prepare('INSERT INTO wrong_questions (question_id, user_id) VALUES (?, ?)').run(question_id, userId);
      }
    }
    
    res.json({ success: true, data: { is_correct: isCorrect } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取考试结果
router.get('/:sessionId/result', (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId || 0;
    
    const records = db.prepare(`
      SELECT sr.*, q.content, q.answer as correct_answer, q.analysis, q.type, q.option_a, q.option_b, q.option_c, q.option_d,
             c.name as chapter_name, s.name as subject_name
      FROM study_records sr
      LEFT JOIN questions q ON sr.question_id = q.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      LEFT JOIN subjects s ON q.subject_id = s.id
      WHERE sr.exam_session_id = ? AND sr.mode = 'exam' AND sr.user_id = ?
      ORDER BY sr.id ASC
    `).all(sessionId, userId);
    
    const total = records.length;
    const correct = records.filter(r => r.is_correct).length;
    const wrong = total - correct;
    
    const chapterStatsMap = {};
    records.forEach(r => {
      const key = r.chapter_name || '未知';
      if (!chapterStatsMap[key]) chapterStatsMap[key] = { name: key, total: 0, correct: 0, wrong: 0 };
      chapterStatsMap[key].total++;
      if (r.is_correct) chapterStatsMap[key].correct++; else chapterStatsMap[key].wrong++;
    });
    const chapterStats = Object.values(chapterStatsMap);
    
    res.json({
      success: true,
      data: {
        session_id: sessionId,
        total,
        correct,
        wrong,
        score: total > 0 ? Math.round((correct / total) * 100) : 0,
        chapter_stats: chapterStats,
        records: records.map(r => ({
          id: r.id,
          question_id: r.question_id,
          content: r.content,
          type: r.type,
          option_a: r.option_a,
          option_b: r.option_b,
          option_c: r.option_c,
          option_d: r.option_d,
          user_answer: r.user_answer,
          correct_answer: r.correct_answer,
          analysis: r.analysis,
          is_correct: !!r.is_correct,
          chapter_name: r.chapter_name,
          subject_name: r.subject_name
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
