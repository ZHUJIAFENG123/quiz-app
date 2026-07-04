/**
 * Prompt A/B 测试分流模块
 * 
 * 核心逻辑：
 * - 按权重分配流量到不同 prompt 版本
 * - 记录每次使用的版本（通过 ai_traces）
 * - 结合 ai_feedback 对比效果
 */

// A/B 测试配置
const AB_TESTS = {
  // 示例：题目解析的两个版本
  question_analysis: {
    enabled: false, // 默认关闭，需要时手动开启
    variants: [
      { id: 'question_analysis', weight: 0.5 },      // 原版
      { id: 'question_analysis_v2', weight: 0.5 }     // 新版（需要先创建对应JSON模板）
    ]
  }
};

/**
 * 根据 A/B 测试配置选择 prompt 版本
 * @param {string} promptId - 原始 prompt ID
 * @returns {string} 选中的 prompt ID
 */
function selectVariant(promptId) {
  const config = AB_TESTS[promptId];
  if (!config || !config.enabled) return promptId;

  const rand = Math.random();
  let cumulative = 0;
  for (const variant of config.variants) {
    cumulative += variant.weight;
    if (rand < cumulative) return variant.id;
  }
  return config.variants[0].id;
}

/**
 * 获取所有 A/B 测试配置
 * @returns {Object}
 */
function getABTests() {
  return AB_TESTS;
}

/**
 * 获取 A/B 测试效果对比
 * @param {Object} db - 数据库实例
 * @param {string} promptId - prompt ID
 * @param {string} [period='7d'] - 统计周期
 * @returns {Object} 各版本的效果对比
 */
function getABTestResults(db, promptId, period = '7d') {
  if (!db) return {};

  const config = AB_TESTS[promptId];
  if (!config) return { error: '未找到该 A/B 测试' };

  const since = new Date(Date.now() - (period === '7d' ? 604800000 : 2592000000)).toISOString();

  try {
    const results = [];
    for (const variant of config.variants) {
      const stats = db.exec(`
        SELECT 
          COUNT(*) as total,
          AVG(latency_ms) as avg_latency,
          SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits
        FROM ai_traces 
        WHERE prompt_template_id = '${variant.id}' AND created_at >= '${since}'
      `);

      const row = stats[0]?.values[0] || [0, 0, 0];
      
      // 获取该版本的反馈
      const feedback = db.exec(`
        SELECT COUNT(*) as total, AVG(rating) as avg_rating
        FROM ai_feedback f
        JOIN ai_traces t ON f.trace_id = t.trace_id
        WHERE t.prompt_template_id = '${variant.id}' AND f.created_at >= '${since}'
      `);
      const fbRow = feedback[0]?.values[0] || [0, 0];

      results.push({
        variant: variant.id,
        weight: variant.weight,
        totalCalls: row[0],
        avgLatencyMs: Math.round(row[1] || 0),
        cacheHitRate: row[0] > 0 ? `${(row[2] / row[0] * 100).toFixed(1)}%` : 'N/A',
        feedbackCount: fbRow[0],
        avgRating: fbRow[1] ? Number(fbRow[1]).toFixed(2) : 'N/A'
      });
    }

    return { promptId, enabled: config.enabled, period, results };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { selectVariant, getABTests, getABTestResults, AB_TESTS };
