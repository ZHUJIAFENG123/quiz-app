/**
 * Embedding 生成模块
 * 
 * 核心职责：
 * 1. 封装 DashScope text-embedding-v3 API 调用
 * 2. 将文本转换为高维向量表示
 * 3. 支持批量处理和缓存
 * 
 * 技术选型说明（面试可讲）：
 * - 选择 DashScope text-embedding-v3 而非开源模型的原因：
 *   1. 与千问同平台，零额外配置
 *   2. 1024维向量，语义质量高于开源小模型（如bge-small-zh 512维）
 *   3. 免费额度充足（每日数千次调用）
 *   4. 无需本地部署模型文件，Docker镜像更小
 */

const https = require('https');

const EMBEDDING_API_KEY = process.env.AI_API_KEY || '';
const EMBEDDING_URL = 'dashscope.aliyuncs.com';
const EMBEDDING_PATH = '/compatible-mode/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSIONS = 1024;

// 单次API请求的最大文本数量
const MAX_BATCH_SIZE = 25;

/**
 * 为单条文本生成 embedding 向量
 * @param {string} text - 输入文本
 * @returns {Promise<number[]>} 1024维浮点数数组
 */
async function generateEmbedding(text) {
  if (!text || !text.trim()) return null;
  if (!EMBEDDING_API_KEY) {
    console.warn('[Embedding] API Key 未配置，跳过 embedding 生成');
    return null;
  }

  // 截断过长文本（DashScope限制约8192 tokens）
  const truncated = text.length > 6000 ? text.slice(0, 6000) : text;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [truncated],
      dimensions: EMBEDDING_DIMENSIONS
    });

    const req = https.request({
      hostname: EMBEDDING_URL,
      path: EMBEDDING_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (response.statusCode >= 400) {
            reject(new Error(json.error?.message || `Embedding API 返回 ${response.statusCode}`));
            return;
          }
          const embedding = json.data?.[0]?.embedding;
          if (embedding && embedding.length > 0) {
            resolve(embedding);
          } else {
            reject(new Error('Embedding API 返回空向量'));
          }
        } catch (err) {
          reject(new Error(`解析 Embedding 响应失败: ${err.message}`));
        }
      });
    });

    req.on('error', e => reject(new Error(`Embedding 连接失败: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Embedding 响应超时')); });
    req.write(body);
    req.end();
  });
}

/**
 * 批量生成 embedding（自动分批处理）
 * @param {string[]} texts - 文本数组
 * @param {Object} [options] - 选项
 * @param {number} [options.batchSize=20] - 每批大小
 * @param {number} [options.delay=100] - 批次间延迟(ms)，避免限流
 * @returns {Promise<(number[]|null)[]>} 对应的向量数组
 */
async function generateBatchEmbeddings(texts, options = {}) {
  const { batchSize = 20, delay = 100 } = options;
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const batchResults = await generateEmbeddingBatch(batch);
      results.push(...batchResults);
      console.log(`[Embedding] 批次 ${Math.floor(i/batchSize) + 1}: ${batchResults.length} 个向量生成成功`);
    } catch (err) {
      console.error(`[Embedding] 批次 ${Math.floor(i/batchSize) + 1} 失败:`, err.message);
      // 失败的批次用 null 填充
      results.push(...batch.map(() => null));
    }

    // 批次间延迟
    if (i + batchSize < texts.length && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * 单次批量请求（最多 MAX_BATCH_SIZE 条文本）
 * @param {string[]} texts - 文本数组（不超过25条）
 * @returns {Promise<(number[]|null)[]>} 向量数组
 */
async function generateEmbeddingBatch(texts) {
  if (!texts.length || !EMBEDDING_API_KEY) return texts.map(() => null);

  const truncatedTexts = texts.map(t => {
    if (!t) return '';
    return t.length > 6000 ? t.slice(0, 6000) : t;
  });

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncatedTexts,
      dimensions: EMBEDDING_DIMENSIONS
    });

    const req = https.request({
      hostname: EMBEDDING_URL,
      path: EMBEDDING_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (response.statusCode >= 400) {
            reject(new Error(json.error?.message || `Batch embedding 返回 ${response.statusCode}`));
            return;
          }
          
          // 按 index 排序恢复顺序
          const embeddings = new Array(texts.length).fill(null);
          if (json.data && Array.isArray(json.data)) {
            for (const item of json.data) {
              if (item.index !== undefined && item.embedding) {
                embeddings[item.index] = item.embedding;
              }
            }
          }
          resolve(embeddings);
        } catch (err) {
          reject(new Error(`解析 batch embedding 失败: ${err.message}`));
        }
      });
    });

    req.on('error', e => reject(new Error(`Batch embedding 连接失败: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Batch embedding 超时')); });
    req.write(body);
    req.end();
  });
}

/**
 * 为题目生成 embedding 文本（拼接题干+答案+解析）
 * @param {Object} question - 题目对象
 * @returns {string} 用于 embedding 的组合文本
 */
function buildQuestionEmbeddingText(question) {
  const parts = [];
  
  // 题干
  if (question.content) parts.push(question.content);
  
  // 选项（拼接有效选项）
  const opts = [question.option_a, question.option_b, question.option_c, question.option_d]
    .filter(Boolean);
  if (opts.length > 0) parts.push(opts.join('；'));
  
  // 答案
  if (question.answer) parts.push(`正确答案：${question.answer}`);
  
  // 解析
  if (question.analysis) parts.push(question.analysis);
  
  // 科目章节（增加语义上下文）
  if (question.subject_name) parts.push(`科目：${question.subject_name}`);
  if (question.chapter_name) parts.push(`章节：${question.chapter_name}`);
  
  return parts.join('\n');
}

module.exports = {
  generateEmbedding,
  generateBatchEmbeddings,
  generateEmbeddingBatch,
  buildQuestionEmbeddingText,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};
