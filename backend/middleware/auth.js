/**
 * JWT 认证中间件
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[Auth] 致命错误：未配置 JWT_SECRET 环境变量，服务拒绝启动');
  process.exit(1);
}

// 生成 Token
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

// 验证 Token - 中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    req.userId = 0; // 默认用户
    return next();
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.id;
  } catch (e) {
    req.user = null;
    req.userId = 0;
  }
  next();
}

// 要求登录的中间件
function requireAuth(req, res, next) {
  if (!req.user || !req.userId) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  next();
}

module.exports = { generateToken, authMiddleware, requireAuth, JWT_SECRET };
