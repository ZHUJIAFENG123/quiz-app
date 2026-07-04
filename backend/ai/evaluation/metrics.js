/**
 * AI 效果评估模块
 * 
 * 核心指标体系：
 * - 响应质量：解析满意度、解析覆盖率
 * - 检索质量：RAG命中率、检索相关度
 * - 效率：缓存命中率、P50/P95延迟
 * - 成本：日均token消耗、单用户成本
 */

/**
 * 初始化评估相关表
 * @param {Object} db - 数据库实例
 */
function initEvaluation(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT DEFAULT '',
      user_id INTEGER DEFAULT 0,
      message_index INTEGER DEFAULT -1,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_trace ON ai_feedback(trace_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_user ON ai_feedback(user_id)`);
}

/**
 * 记录用户反馈（有帮助/没帮助）
 * @param {Object} db - 数据库实例
 * @param {Object} data - 反馈数据
 */
function submitFeedback(db, data) {
  if (!db) return false;
  try {
    db.prepare(`
      INSERT INTO ai_feedback (trace_id, user_id, message_index, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.traceId || '', data.userId || 0, data.messageIndex || -1, data.rating, data.comment || '');
    return true;
  } catch (err) {
    console.error('[Evaluation] 提交反馈失败:', err.message);
    return false;
  }
}

/**
 * 获取评估报告
 * @param {Object} db - 数据库实例
 * @param {string} [period='7d'] - 统计周期
 * @returns {Object} 评估报告
 */
function getEvaluationReport(db, period = '7d') {
  if (!db) return {};

  const since = getSinceDate(period);

  try {
    // 反馈统计
    const feedbackStats = db.exec(`
      SELECT 
        COUNT(*) as total,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative
      FROM ai_feedback 
      WHERE created_at >= '${since}'
    `);

    const fb = feedbackStats[0]?.values[0] || [0, 0, 0, 0];

    // AI 调用统计（从 ai_traces）
    const traces = db.exec(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        SUM(CASE WHEN rag_used = 1 THEN 1 ELSE 0 END) as rag_used,
        AVG(CASE WHEN status = 'success' THEN latency_ms END) as avg_latency
      FROM ai_traces 
      WHERE created_at >= '${since}'
    `);

    const tr = traces[0]?.values[0] || [0, 0, 0, 0, 0];

    // P50/P95 延迟
    const latencies = db.exec(`
      SELECT latency_ms FROM ai_traces 
      WHERE created_at >= '${since}' AND status = 'success'
      ORDER BY latency_ms
    `);
    
    let p50 = 0, p95 = 0;
    if (latencies[0]?.values?.length > 0) {
      const vals = latencies[0].values.map(v => v[0]);
      p50 = vals[Math.floor(vals.length * 0.5)] || 0;
      p95 = vals[Math.floor(vals.length * 0.95)] || 0;
    }

    return {
      period,
      feedback: {
        total: fb[0],
        avgRating: fb[1] ? Number(fb[1]).toFixed(2) : 0,
        positive: fb[2],
        negative: fb[3],
        satisfactionRate: fb[0] > 0 ? `${(fb[2] / fb[0] * 100).toFixed(1)}%` : 'N/A'
      },
      aiCalls: {
        total: tr[0],
        successRate: tr[0] > 0 ? `${(tr[1] / tr[0] * 100).toFixed(1)}%` : 'N/A',
        cacheHitRate: tr[0] > 0 ? `${(tr[2] / tr[0] * 100).toFixed(1)}%` : 'N/A',
        ragUsedCount: tr[3],
        avgLatencyMs: Math.round(tr[4] || 0)
      },
      latency: {
        p50: Math.round(p50),
        p95: Math.round(p95)
      }
    };
  } catch (err) {
    return { error: err.message };
  }
}

function getSinceDate(period) {
  const now = new Date();
  switch (period) {
    case '1h': return new Date(now - 3600000).toISOString();
    case '24h': return new Date(now - 86400000).toISOString();
    case '7d': return new Date(now - 604800000).toISOString();
    case '30d': return new Date(now - 2592000000).toISOString();
    default: return new Date(now - 604800000).toISOString();
  }
}

module.exports = { initEvaluation, submitFeedback, getEvaluationReport };
