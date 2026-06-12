const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 获取学习统计数据概览
router.get('/stats', (req, res) => {
  try {
    // 总做题数
    const totalStudy = db.prepare('SELECT COUNT(*) as count FROM study_records').get();
    // 正确数
    const correctCount = db.prepare('SELECT COUNT(*) as count FROM study_records WHERE is_correct = 1').get();
    // 总练习数（非考试）
    const practiceCount = db.prepare("SELECT COUNT(*) as count FROM study_records WHERE mode = 'practice'").get();
    // 总考试次数
    const examSessions = db.prepare("SELECT COUNT(DISTINCT exam_session_id) as count FROM study_records WHERE mode = 'exam'").get();
    // 总题目数
    const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
    // 错题数
    const wrongCount = db.prepare('SELECT COUNT(*) as count FROM wrong_questions').get();
    // 收藏数
    const favCount = db.prepare('SELECT COUNT(*) as count FROM favorites').get();
    
    res.json({
      success: true,
      data: {
        total_study: totalStudy.count,
        correct_count: correctCount.count,
        accuracy: totalStudy.count > 0 ? Math.round((correctCount.count / totalStudy.count) * 100) : 0,
        practice_count: practiceCount.count,
        exam_count: examSessions.count,
        total_questions: totalQuestions.count,
        wrong_count: wrongCount.count,
        favorite_count: favCount.count
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 各章节正确率统计
router.get('/stats/chapters', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT c.id, c.name, s.name as subject_name,
             COUNT(sr.id) as total,
             SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM chapters c
      LEFT JOIN questions q ON q.chapter_id = c.id
      LEFT JOIN study_records sr ON sr.question_id = q.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      GROUP BY c.id
      ORDER BY s.name, c.name
    `).all();
    
    const result = stats.map(s => ({
      ...s,
      accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0
    }));
    
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 最近7天学习记录（按天统计）
router.get('/stats/daily', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT DATE(created_at) as date,
             COUNT(*) as total,
             SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM study_records
      WHERE created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();
    
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 清除所有学习数据
router.delete('/clear', (req, res) => {
  try {
    db.exec(`
      DELETE FROM study_records;
      DELETE FROM wrong_questions;
      DELETE FROM favorites;
    `);
    res.json({ success: true, message: '所有学习数据已清除' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
