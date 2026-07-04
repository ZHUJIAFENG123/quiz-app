/**
 * AI 调用链路追踪中间件
 * 
 * 核心职责：
 * 1. 为每次 AI 调用生成唯一 trace_id
 * 2. 记录调用元数据（模型、token数、延迟、缓存命中等）
 * 3. 持久化到 ai_traces 表（SQLite）
 * 4. 提供追踪数据的查询接口
 * 
 * 面试展示点：
 * - 完整的可观测性体系（trace + metrics + logging）
 * - 无侵入式设计，不影响主业务流程
 * - 支持异步写入，不阻塞响应
 */

const crypto = require('crypto');

// 内存缓冲区，批量写入减少 SQLite I/O
let traceBuffer = [];
const FLUSH_INTERVAL = 10000; // 每10秒刷新一次
const MAX_BUFFER_SIZE = 100;  // 缓冲区满时立即刷新

let db = null;
let flushTimer = null;

/**
 * 初始化追踪模块
 * @param {Object} database - sql.js 数据库实例
 */
function init(database) {
  db = database;
  
  // 创建追踪表
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT UNIQUE,
      user_id INTEGER DEFAULT 0,
      prompt_template_id TEXT DEFAULT '',
      prompt_version TEXT DEFAULT '',
      model TEXT DEFAULT 'qwen-turbo',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      cache_hit INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_message TEXT DEFAULT '',
      request_path TEXT DEFAULT '',
      request_type TEXT DEFAULT '',
      rag_used INTEGER DEFAULT 0,
      rag_results_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引优化查询性能
  db.run(`CREATE INDEX IF NOT EXISTS idx_traces_user ON ai_traces(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_traces_template ON ai_traces(prompt_template_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_traces_status ON ai_traces(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_traces_created ON ai_traces(created_at)`);

  // 启动定时刷新
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL);
  
  console.log('[AITracer] 链路追踪模块已初始化');
}

/**
 * 生成唯一追踪 ID
 * @returns {string} UUID v4 格式
 */
function generateTraceId() {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

/**
 * 创建一个新的追踪记录（在 AI 调用前调用）
 * @param {Object} options - 追踪选项
 * @param {number} [options.userId=0] - 用户 ID
 * @param {string} [options.templateId] - Prompt 模板 ID
 * @param {string} [options.templateVersion] - 模板版本
 * @param {string} [options.model] - 使用的模型
 * @param {string} [options.requestPath] - 请求路径
 * @param {string} [options.requestType] - 请求类型（chat/analyze/diagnose等）
 * @returns {{ traceId: string, startTime: number, record: Object }} 追踪上下文
 */
function startTrace(options = {}) {
  const traceId = generateTraceId();
  const startTime = Date.now();
  
  const record = {
    trace_id: traceId,
    user_id: options.userId || 0,
    prompt_template_id: options.templateId || '',
    prompt_version: options.templateVersion || '',
    model: options.model || 'qwen-turbo',
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    latency_ms: 0,
    cache_hit: 0,
    status: 'pending',
    error_message: '',
    request_path: options.requestPath || '',
    request_type: options.requestType || '',
    rag_used: 0,
    rag_results_count: 0,
    created_at: new Date().toISOString()
  };

  return { traceId, startTime, record };
}

/**
 * 完成追踪记录（在 AI 调用后调用）
 * @param {Object} context - startTrace 返回的追踪上下文
 * @param {Object} result - AI 调用结果
 * @param {number} [result.inputTokens] - 输入 token 数
 * @param {number} [result.outputTokens] - 输出 token 数
 * @param {boolean} [result.cacheHit=false] - 是否命中缓存
 * @param {boolean} [result.ragUsed=false] - 是否使用了 RAG
 * @param {number} [result.ragResultsCount=0] - RAG 检索结果数
 * @param {string} [result.status='success'] - 调用状态
 * @param {string} [result.error] - 错误信息
 */
function endTrace(context, result = {}) {
  if (!context) return;
  
  const { startTime, record } = context;
  
  record.latency_ms = Date.now() - startTime;
  record.input_tokens = result.inputTokens || 0;
  record.output_tokens = result.outputTokens || 0;
  record.total_tokens = record.input_tokens + record.output_tokens;
  record.cache_hit = result.cacheHit ? 1 : 0;
  record.rag_used = result.ragUsed ? 1 : 0;
  record.rag_results_count = result.ragResultsCount || 0;
  record.status = result.status || 'success';
  record.error_message = result.error || '';

  // 加入缓冲区
  traceBuffer.push({ ...record });

  // 缓冲区满时立即刷新
  if (traceBuffer.length >= MAX_BUFFER_SIZE) {
    flushBuffer();
  }

  return record;
}

/**
 * 将缓冲区中的追踪记录批量写入数据库
 */
function flushBuffer() {
  if (!db || traceBuffer.length === 0) return;

  const records = [...traceBuffer];
  traceBuffer = [];

  for (const r of records) {
    try {
      db.run(`
        INSERT OR REPLACE INTO ai_traces 
        (trace_id, user_id, prompt_template_id, prompt_version, model,
         input_tokens, output_tokens, total_tokens, latency_ms, cache_hit,
         status, error_message, request_path, request_type, rag_used,
         rag_results_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        r.trace_id, r.user_id, r.prompt_template_id, r.prompt_version, r.model,
        r.input_tokens, r.output_tokens, r.total_tokens, r.latency_ms, r.cache_hit,
        r.status, r.error_message, r.request_path, r.request_type, r.rag_used,
        r.rag_results_count, r.created_at
      ]);
    } catch (err) {
      console.error('[AITracer] 写入追踪记录失败:', err.message);
    }
  }

  // 持久化到文件
  try {
    if (db.export) {
      const data = db.export();
      const fs = require('fs');
      const path = require('path');
      const dbPath = path.join(__dirname, '..', '..', 'data', 'quiz.db');
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
  } catch (err) {
    // 静默失败，不影响主流程
  }
}

/**
 * 查询追踪统计（用于管理后台展示）
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.period='24h'] - 统计周期（1h/24h/7d/30d）
 * @param {number} [filters.userId] - 用户 ID
 * @returns {Object} 统计数据
 */
function getStats(filters = {}) {
  if (!db) return {};

  const { period = '24h', userId } = filters;

  // 计算时间范围
  const now = new Date();
  let since;
  switch (period) {
    case '1h': since = new Date(now - 3600000); break;
    case '24h': since = new Date(now - 86400000); break;
    case '7d': since = new Date(now - 604800000); break;
    case '30d': since = new Date(now - 2592000000); break;
    default: since = new Date(now - 86400000);
  }
  const sinceStr = since.toISOString();

  const userFilter = userId ? `AND user_id = ${userId}` : '';

  try {
    // 总调用次数
    const totalResult = db.exec(`
      SELECT COUNT(*) as total FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
    `);
    const total = totalResult[0]?.values[0]?.[0] || 0;

    // 成功/失败次数
    const statusResult = db.exec(`
      SELECT status, COUNT(*) as count FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
      GROUP BY status
    `);
    const statusMap = {};
    if (statusResult[0]) {
      for (const row of statusResult[0].values) {
        statusMap[row[0]] = row[1];
      }
    }

    // 延迟统计
    const latencyResult = db.exec(`
      SELECT 
        AVG(latency_ms) as avg_latency,
        MIN(latency_ms) as min_latency,
        MAX(latency_ms) as max_latency
      FROM ai_traces 
      WHERE created_at >= '${sinceStr}' AND status = 'success' ${userFilter}
    `);
    const avgLatency = latencyResult[0]?.values[0]?.[0] || 0;
    const minLatency = latencyResult[0]?.values[0]?.[1] || 0;
    const maxLatency = latencyResult[0]?.values[0]?.[2] || 0;

    // Token 消耗
    const tokenResult = db.exec(`
      SELECT 
        SUM(input_tokens) as input_total,
        SUM(output_tokens) as output_total,
        SUM(total_tokens) as all_total
      FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
    `);
    const inputTokens = tokenResult[0]?.values[0]?.[0] || 0;
    const outputTokens = tokenResult[0]?.values[0]?.[1] || 0;
    const totalTokens = tokenResult[0]?.values[0]?.[2] || 0;

    // 缓存命中率
    const cacheResult = db.exec(`
      SELECT 
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as hits,
        COUNT(*) as total
      FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
    `);
    const cacheHits = cacheResult[0]?.values[0]?.[0] || 0;
    const cacheTotal = cacheResult[0]?.values[0]?.[1] || 0;
    const cacheHitRate = cacheTotal > 0 ? (cacheHits / cacheTotal * 100).toFixed(1) : 0;

    // RAG 使用率
    const ragResult = db.exec(`
      SELECT 
        SUM(CASE WHEN rag_used = 1 THEN 1 ELSE 0 END) as hits,
        COUNT(*) as total
      FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
    `);
    const ragHits = ragResult[0]?.values[0]?.[0] || 0;

    // 按模板统计
    const templateResult = db.exec(`
      SELECT prompt_template_id, COUNT(*) as count, AVG(latency_ms) as avg_latency
      FROM ai_traces 
      WHERE created_at >= '${sinceStr}' ${userFilter}
      GROUP BY prompt_template_id
      ORDER BY count DESC
    `);
    const templateStats = templateResult[0]?.values?.map(row => ({
      templateId: row[0],
      count: row[1],
      avgLatency: Math.round(row[2])
    })) || [];

    return {
      period,
      totalCalls: total,
      successCount: statusMap['success'] || 0,
      errorCount: statusMap['error'] || 0,
      cacheHitRate: `${cacheHitRate}%`,
      avgLatencyMs: Math.round(avgLatency),
      minLatencyMs: Math.round(minLatency),
      maxLatencyMs: Math.round(maxLatency),
      totalTokens,
      inputTokens,
      outputTokens,
      ragUsedCount: ragHits,
      templateStats
    };
  } catch (err) {
    console.error('[AITracer] 查询统计失败:', err.message);
    return { error: err.message };
  }
}

/**
 * 查询最近的追踪记录（用于调试）
 * @param {number} [limit=20] - 返回数量
 * @returns {Array} 追踪记录列表
 */
function getRecentTraces(limit = 20) {
  if (!db) return [];

  try {
    const result = db.exec(`
      SELECT * FROM ai_traces 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `);
    
    if (!result[0]) return [];
    
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  } catch (err) {
    console.error('[AITracer] 查询追踪记录失败:', err.message);
    return [];
  }
}

/**
 * 清理中间件资源
 */
function shutdown() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushBuffer();
  console.log('[AITracer] 追踪模块已关闭');
}

module.exports = {
  init,
  startTrace,
  endTrace,
  flushBuffer,
  getStats,
  getRecentTraces,
  shutdown,
  generateTraceId
};
