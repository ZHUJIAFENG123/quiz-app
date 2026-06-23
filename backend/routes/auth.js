const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken, authMiddleware } = require('../middleware/auth');

// ===== 速率限制中间件 =====
const rateLimitMap = new Map();
function rateLimit(maxAttempts = 10, windowMs = 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
    const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);
    if (timestamps.length >= maxAttempts) {
      return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    }
    timestamps.push(now);
    rateLimitMap.set(ip, timestamps);
    next();
  };
}
// 每60秒自动清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, valid);
  }
}, 60000);

// 注册
router.post('/register', rateLimit(5, 60000), (req, res) => {
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
router.post('/login', rateLimit(10, 60000), (req, res) => {
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
