const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken, authMiddleware } = require('../middleware/auth');

// 注册
router.post('/register', (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ success: false, message: '用户名长度3-20个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少6位' });
    }
    
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)')
      .run(username, hashedPassword, nickname || username);
    
    const user = { id: result.lastInsertRowid, username, nickname: nickname || username };
    const token = generateToken(user);
    
    res.status(201).json({ success: true, data: { user, token } });
    // 后台同步到 GitHub
    syncIfToken();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    const token = generateToken(user);
    
    res.json({
      success: true,
      data: {
        user: { id: user.id, username: user.username, nickname: user.nickname },
        token
      }
    });
    // 后台同步到 GitHub
    syncIfToken();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  if (!req.user || !req.userId) {
    return res.json({ success: true, data: null });
  }
  
  const user = db.prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.json({ success: true, data: null });
  
  res.json({ success: true, data: user });
});

module.exports = router;

// 后台同步（不阻塞响应）
function syncIfToken() {
  if (!process.env.GITHUB_TOKEN) return;
  try {
    const { exportData, saveToGitHub } = require('../utils/sync');
    const data = exportData(global.db);
    saveToGitHub(data).catch(() => {});
  } catch {}
}
