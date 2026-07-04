/**
 * API 熔断器（Circuit Breaker）
 * 
 * 三态模型：
 * - CLOSED（闭合）：正常状态，请求正常通过
 * - OPEN（断开）：熔断状态，请求直接快速失败
 * - HALF_OPEN（半开）：探测状态，允许少量请求尝试恢复
 * 
 * 触发条件：连续 N 次失败 或 一段时间内失败率超过阈值
 * 恢复策略：熔断超时后进入半开状态，探测成功则恢复
 */

// 熔断器状态
const STATE = {
  CLOSED: 'CLOSED',       // 正常
  OPEN: 'OPEN',           // 熔断
  HALF_OPEN: 'HALF_OPEN'  // 半开探测
};

// 配置
const CONFIG = {
  failureThreshold: 5,     // 连续失败次数阈值
  resetTimeout: 60000,     // 熔断后60秒进入半开
  halfOpenMaxCalls: 2,     // 半开状态最多尝试次数
  monitorWindow: 60000     // 监控窗口（1分钟）
};

// 熔断器实例
const breakers = new Map();

/**
 * 获取或创建熔断器
 * @param {string} name - 熔断器名称（如 'dashscope_chat', 'dashscope_embedding'）
 * @returns {Object} 熔断器实例
 */
function getBreaker(name = 'default') {
  if (!breakers.has(name)) {
    breakers.set(name, {
      name,
      state: STATE.CLOSED,
      failureCount: 0,
      successCount: 0,
      halfOpenCalls: 0,
      lastFailureTime: 0,
      lastStateChange: Date.now(),
      totalRequests: 0,
      totalFailures: 0
    });
  }
  return breakers.get(name);
}

/**
 * 检查是否允许请求通过
 * @param {string} name - 熔断器名称
 * @returns {{ allowed: boolean, state: string, reason?: string }}
 */
function canExecute(name = 'default') {
  const breaker = getBreaker(name);
  const now = Date.now();

  switch (breaker.state) {
    case STATE.CLOSED:
      return { allowed: true, state: breaker.state };

    case STATE.OPEN:
      // 检查是否到达重置时间
      if (now - breaker.lastFailureTime >= CONFIG.resetTimeout) {
        // 转为半开状态
        breaker.state = STATE.HALF_OPEN;
        breaker.halfOpenCalls = 0;
        breaker.lastStateChange = now;
        console.log(`[CircuitBreaker:${name}] OPEN → HALF_OPEN，开始探测恢复`);
        return { allowed: true, state: STATE.HALF_OPEN };
      }
      return {
        allowed: false,
        state: breaker.state,
        reason: `API 熔断中，${Math.ceil((CONFIG.resetTimeout - (now - breaker.lastFailureTime)) / 1000)}秒后重试`
      };

    case STATE.HALF_OPEN:
      if (breaker.halfOpenCalls < CONFIG.halfOpenMaxCalls) {
        return { allowed: true, state: breaker.state };
      }
      return {
        allowed: false,
        state: breaker.state,
        reason: '半开探测中，请稍后'
      };

    default:
      return { allowed: true, state: STATE.CLOSED };
  }
}

/**
 * 记录请求成功
 * @param {string} name - 熔断器名称
 */
function recordSuccess(name = 'default') {
  const breaker = getBreaker(name);
  breaker.totalRequests++;
  breaker.lastStateChange = Date.now();

  if (breaker.state === STATE.HALF_OPEN) {
    breaker.successCount++;
    // 半开状态成功 → 恢复为闭合
    breaker.state = STATE.CLOSED;
    breaker.failureCount = 0;
    breaker.successCount = 0;
    breaker.halfOpenCalls = 0;
    console.log(`[CircuitBreaker:${name}] HALF_OPEN → CLOSED，服务已恢复`);
  } else if (breaker.state === STATE.CLOSED) {
    // 成功时重置连续失败计数
    breaker.failureCount = 0;
  }
}

/**
 * 记录请求失败
 * @param {string} name - 熔断器名称
 * @param {string} [error] - 错误信息
 */
function recordFailure(name = 'default', error = '') {
  const breaker = getBreaker(name);
  breaker.totalRequests++;
  breaker.totalFailures++;
  breaker.failureCount++;
  breaker.lastFailureTime = Date.now();

  if (breaker.state === STATE.HALF_OPEN) {
    // 半开状态失败 → 重新熔断
    breaker.state = STATE.OPEN;
    breaker.halfOpenCalls = 0;
    console.log(`[CircuitBreaker:${name}] HALF_OPEN → OPEN，探测失败: ${error}`);
  } else if (breaker.state === STATE.CLOSED) {
    if (breaker.failureCount >= CONFIG.failureThreshold) {
      breaker.state = STATE.OPEN;
      breaker.lastStateChange = Date.now();
      console.log(`[CircuitBreaker:${name}] CLOSED → OPEN，连续失败${breaker.failureCount}次，触发熔断`);
    }
  }
}

/**
 * 获取所有熔断器状态
 * @returns {Array} 各熔断器的状态信息
 */
function getAllStatus() {
  const result = [];
  for (const [name, breaker] of breakers) {
    result.push({
      name,
      state: breaker.state,
      failureCount: breaker.failureCount,
      totalRequests: breaker.totalRequests,
      totalFailures: breaker.totalFailures,
      failureRate: breaker.totalRequests > 0
        ? `${(breaker.totalFailures / breaker.totalRequests * 100).toFixed(1)}%`
        : '0%',
      lastFailureTime: breaker.lastFailureTime
        ? new Date(breaker.lastFailureTime).toISOString()
        : null,
      stateChangedAgo: `${Math.round((Date.now() - breaker.lastStateChange) / 1000)}s`
    });
  }
  return result;
}

/**
 * 手动重置熔断器
 * @param {string} name - 熔断器名称
 */
function reset(name = 'default') {
  const breaker = getBreaker(name);
  breaker.state = STATE.CLOSED;
  breaker.failureCount = 0;
  breaker.successCount = 0;
  breaker.halfOpenCalls = 0;
  breaker.lastStateChange = Date.now();
  console.log(`[CircuitBreaker:${name}] 手动重置为 CLOSED`);
}

/**
 * Express 中间件：检查熔断状态
 * @param {string} name - 熔断器名称
 */
function circuitBreakerMiddleware(name = 'default') {
  return (req, res, next) => {
    const check = canExecute(name);
    if (!check.allowed) {
      return res.status(503).json({
        success: false,
        message: check.reason || '服务暂时不可用',
        circuitState: check.state,
        retryAfter: Math.ceil(CONFIG.resetTimeout / 1000)
      });
    }
    // 在 res 上挂载记录方法
    res.recordCircuitSuccess = () => recordSuccess(name);
    res.recordCircuitFailure = (err) => recordFailure(name, err);
    next();
  };
}

module.exports = {
  STATE,
  CONFIG,
  canExecute,
  recordSuccess,
  recordFailure,
  getBreaker,
  getAllStatus,
  reset,
  circuitBreakerMiddleware
};
