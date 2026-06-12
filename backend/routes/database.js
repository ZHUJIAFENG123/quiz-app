const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../config/db');
const { saveNow } = require('../config/database');

const DB_PATH = path.join(__dirname, '..', 'data', 'quiz.db');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 备份数据库
router.post('/backup', (req, res) => {
  try {
    // 先保存当前数据库到文件
    saveNow();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `quiz_backup_${timestamp}.db`);
    
    fs.copyFileSync(DB_PATH, backupPath);
    
    res.json({ success: true, data: { path: backupPath, name: path.basename(backupPath) }, message: '备份成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '备份失败: ' + err.message });
  }
});

// 恢复数据库
router.post('/restore', (req, res) => {
  try {
    const { backupFile } = req.body;
    if (!backupFile) return res.status(400).json({ success: false, message: '请指定备份文件' });
    
    const backupPath = path.join(BACKUP_DIR, backupFile);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, message: '备份文件不存在' });
    }
    
    // 先备份当前数据库
    saveNow();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const currentBackup = path.join(BACKUP_DIR, `quiz_before_restore_${timestamp}.db`);
    fs.copyFileSync(DB_PATH, currentBackup);
    
    // 恢复：用备份文件覆盖当前数据库
    fs.copyFileSync(backupPath, DB_PATH);
    
    res.json({ success: true, message: '数据库已恢复，请重启服务以加载新数据' });
  } catch (err) {
    res.status(500).json({ success: false, message: '恢复失败: ' + err.message });
  }
});

// 获取备份列表
router.get('/backups', (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stats.size, created_at: stats.birthtime };
      })
      .sort((a, b) => b.created_at - a.created_at);
    
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 数据库统计信息
router.get('/info', (req, res) => {
  try {
    const subjects = db.prepare('SELECT COUNT(*) as count FROM subjects').get();
    const chapters = db.prepare('SELECT COUNT(*) as count FROM chapters').get();
    const questions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
    const studyRecords = db.prepare('SELECT COUNT(*) as count FROM study_records').get();
    const wrongQuestions = db.prepare('SELECT COUNT(*) as count FROM wrong_questions').get();
    const favorites = db.prepare('SELECT COUNT(*) as count FROM favorites').get();
    
    const stats = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH) : { size: 0 };
    
    res.json({
      success: true,
      data: {
        db_size_mb: (stats.size / 1024 / 1024).toFixed(2),
        tables: {
          subjects: subjects.count,
          chapters: chapters.count,
          questions: questions.count,
          study_records: studyRecords.count,
          wrong_questions: wrongQuestions.count,
          favorites: favorites.count
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
