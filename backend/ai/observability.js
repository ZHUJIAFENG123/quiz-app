/**
 * AI 可观测性聚合模块
 * 
 * 核心职责：
 * 1. 聚合 ai_traces 表的追踪数据，生成运营看板数据
 * 2. 提供按时间段、模板、用户维度的分析
 * 3. 计算成本估算（基于 token 消耗）
 * 4. 提供告警阈值检测
 * 
 * 面试展示点：
 * - 完整的 AI 运营可观测体系
 * - 成本可控、质量可量化的数据支撑
 */

const aiLogger = require('./middleware/ai-logger');

// DashScope 定价（元/千token），可配置化
const PRICING = {
  'qwen-turbo': { input: 0.002, output: 0.006 },
  'qwen-plus': { input: 0.004, output: 0.012 },
  'text-embedding-v3': { input: 0.0007, output: 0 }
};

/**
 * 获取 AI 运营数据看板（供管理后台使用）
 * @param {Object} db - 数据库实例
 * @returns {Object} 看板数据
 */
function getDashboard(db) {
  if (!db) return { error: '数据库未初始化' };

  try {
    const stats24h = aiLogger.getStats({ period: '24h' });
    const stats7d = aiLogger.getStats({ period: '7d' });
    const stats30d = aiLogger.getStats({ period: '30d' });

    // 成本估算
    const cost24h = estimateCost(stats24h);
    const cost7d = estimateCost(stats7d);
    const cost30d = estimateCost(stats30d);

    // 今日调用趋势（按小时）
    const hourlyTrend = getHourlyTrend(db);

    // 错误率告警
    const errorRate = stats24h.totalCalls > 0 
      ? (stats24h.errorCount / stats24h.totalCalls * 100).toFixed(1) 
      : 0;

    return {
      overview: {
        today: { ...stats24h, estimatedCost: cost24h },
        week: { ...stats7d, estimatedCost: cost7d },
        month: { ...stats30d, estimatedCost: cost30d }
      },
      alerts: {
        errorRate: `${errorRate}%`,
        isErrorRateHigh: parseFloat(errorRate) > 10,
        isCostHigh: cost30d > 10 // 月成本超过10元告警
      },
      hourlyTrend,
      recentTraces: aiLogger.getRecentTraces(10),
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 估算 token 消耗的成本
 * @param {Object} stats - 统计数据
 * @returns {string} 成本（元），保留4位小数
 */
function estimateCost(stats) {
  if (!stats || !stats.inputTokens) return '0.0000';
  
  const pricing = PRICING['qwen-turbo'];
  const inputCost = (stats.inputTokens / 1000) * pricing.input;
  const outputCost = (stats.outputTokens / 1000) * pricing.output;
  return (inputCost + outputCost).toFixed(4);
}

/**
 * 获取今日按小时的调用趋势
 * @param {Object} db - 数据库实例
 * @returns {Array} 每小时的数据点
 */
function getHourlyTrend(db) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = db.exec(`
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as calls,
        AVG(latency_ms) as avg_latency,
        SUM(total_tokens) as tokens
      FROM ai_traces 
      WHERE DATE(created_at) = '${today}'
      GROUP BY hour
      ORDER BY hour
    `);

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      hour: row[0],
      calls: row[1],
      avgLatency: Math.round(row[2]),
      tokens: row[3]
    }));
  } catch (err) {
    return [];
  }
}

/**
 * 获取按模板维度的性能对比
 * @param {Object} db - 数据库实例
 * @param {string} [period='7d'] - 统计周期
 * @returns {Array} 各模板的性能数据
 */
function getTemplateComparison(db, period = '7d') {
  if (!db) return [];

  const now = new Date();
  let since;
  switch (period) {
    case '1h': since = new Date(now - 3600000); break;
    case '24h': since = new Date(now - 86400000); break;
    case '7d': since = new Date(now - 604800000); break;
    case '30d': since = new Date(now - 2592000000); break;
    default: since = new Date(now - 604800000);
  }

  try {
    const result = db.exec(`
      SELECT 
        prompt_template_id,
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        SUM(CASE WHEN rag_used = 1 THEN 1 ELSE 0 END) as rag_used_count,
        AVG(latency_ms) as avg_latency,
        SUM(total_tokens) as total_tokens
      FROM ai_traces 
      WHERE created_at >= '${since.toISOString()}'
      GROUP BY prompt_template_id
      ORDER BY total_calls DESC
    `);

    if (!result[0]) return [];

    return result[0].values.map(row => ({
      templateId: row[0] || '(未设置)',
      totalCalls: row[1],
      successRate: row[1] > 0 ? `${(row[2] / row[1] * 100).toFixed(1)}%` : '0%',
      cacheHitRate: row[1] > 0 ? `${(row[3] / row[1] * 100).toFixed(1)}%` : '0%',
      ragUsedCount: row[4],
      avgLatencyMs: Math.round(row[5]),
      totalTokens: row[6],
      estimatedCost: estimateCost({ inputTokens: row[6] * 0.6, outputTokens: row[6] * 0.4 })
    }));
  } catch (err) {
    return [];
  }
}

/**
 * 获取用户级别的 AI 使用统计
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Object} 用户 AI 使用数据
 */
function getUserAIStats(db, userId) {
  if (!db) return {};

  try {
    const result = db.exec(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
      FROM ai_traces 
      WHERE user_id = ${userId} AND created_at >= datetime('now', '-30 days')
    `);

    if (!result[0] || !result[0].values[0]) return {};

    const row = result[0].values[0];
    return {
      totalCalls: row[0],
      totalTokens: row[1],
      avgLatencyMs: Math.round(row[2]),
      cacheHits: row[3],
      estimatedCost: estimateCost({ inputTokens: (row[1] || 0) * 0.6, outputTokens: (row[1] || 0) * 0.4 })
    };
  } catch (err) {
    return {};
  }
}

module.exports = {
  getDashboard,
  getTemplateComparison,
  getUserAIStats,
  estimateCost,
  PRICING
};
