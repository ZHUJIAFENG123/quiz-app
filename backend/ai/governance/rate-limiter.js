/**
 * AI 调用限流器
 * 
 * 策略：
 * 1. 用户级限流：每用户每天最多 N 次 AI 调用
 * 2. 全局限流：每分钟最多 M 次 AI API 调用
 * 3. 基于内存计数器（单实例部署足够）
 */

// 配置
const CONFIG = {
  userDailyLimit: 50,      // 每用户每天最多50次
  globalPerMinute: 30,     // 全局每分钟最多30次
  cleanupInterval: 3600000 // 每小时清理过期记录
};

// 内存计数器
const userCounters = new Map(); // { `${userId}_${date}`: count }
const globalCounter = { count: 0, resetAt: Date.now() + 60000 };

// 定时清理
setInterval(() => {
  const today = new Date().toISOString().split('T')[0];
  for (const [key] of userCounters) {
    if (!key.endsWith(today)) userCounters.delete(key);
  }
}, CONFIG.cleanupInterval);

/**
 * 检查用户是否可以调用 AI
 * @param {number} userId - 用户 ID
 * @returns {{ allowed: boolean, reason?: string, remaining?: number }}
 */
function checkUserLimit(userId = 0) {
  const today = new Date().toISOString().split('T')[0];
  const key = `${userId}_${today}`;
  const count = userCounters.get(key) || 0;

  if (count >= CONFIG.userDailyLimit) {
    return { allowed: false, reason: `今日 AI 调用已达上限(${CONFIG.userDailyLimit}次)`, remaining: 0 };
  }

  return { allowed: true, remaining: CONFIG.userDailyLimit - count - 1 };
}

/**
 * 检查全局限流
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkGlobalLimit() {
  const now = Date.now();
  if (now > globalCounter.resetAt) {
    globalCounter.count = 0;
    globalCounter.resetAt = now + 60000;
  }

  if (globalCounter.count >= CONFIG.globalPerMinute) {
    return { allowed: false, reason: '系统繁忙，请稍后重试' };
  }

  return { allowed: true };
}

/**
 * 记录一次 AI 调用
 * @param {number} userId - 用户 ID
 */
function recordCall(userId = 0) {
  const today = new Date().toISOString().split('T')[0];
  const key = `${userId}_${today}`;
  userCounters.set(key, (userCounters.get(key) || 0) + 1);
  globalCounter.count++;
}

/**
 * 综合检查（用户+全局）
 * @param {number} userId - 用户 ID
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkLimit(userId = 0) {
  const userCheck = checkUserLimit(userId);
  if (!userCheck.allowed) return userCheck;

  const globalCheck = checkGlobalLimit();
  if (!globalCheck.allowed) return globalCheck;

  return { allowed: true, remaining: userCheck.remaining };
}

/**
 * Express 中间件：自动检查限流
 */
function rateLimitMiddleware(req, res, next) {
  const userId = req.userId || 0;
  const check = checkLimit(userId);
  
  if (!check.allowed) {
    return res.status(429).json({
      success: false,
      message: check.reason,
      retryAfter: 60
    });
  }

  recordCall(userId);
  next();
}

module.exports = {
  checkLimit,
  checkUserLimit,
  checkGlobalLimit,
  recordCall,
  rateLimitMiddleware,
  CONFIG
};
