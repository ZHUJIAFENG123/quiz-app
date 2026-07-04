/**
 * 向量存储与检索模块
 * 
 * 核心职责：
 * 1. 将 embedding 向量存储到 SQLite（JSON 数组格式）
 * 2. 实现余弦相似度计算
 * 3. 提供 Top-K 相似检索接口
 * 
 * 技术选型说明（面试核心展示点）：
 * - 为什么选纯 SQLite 而非专用向量数据库（Pinecone/Milvus/Chroma）？
 *   1. 题目规模小（~1000道），全表扫描+余弦计算耗时 <20ms
 *   2. 零新依赖，与现有 sql.js 架构完美兼容
 *   3. Fly.io 部署简单，无需额外服务
 *   4. 体现了"根据规模选型"的工程判断力
 * - 如果题目量超过 10 万，应该迁移到专用向量数据库
 */

/**
 * 初始化向量存储表
 * @param {Object} db - sql.js 数据库实例
 */
function initVectorStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER UNIQUE,
      embedding TEXT NOT NULL,
      content_hash TEXT DEFAULT '',
      subject_id INTEGER DEFAULT 0,
      chapter_id INTEGER DEFAULT 0,
      model TEXT DEFAULT 'text-embedding-v3',
      dimensions INTEGER DEFAULT 1024,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    )
  `);
  
  db.exec(`CREATE INDEX IF NOT EXISTS idx_embeddings_question ON question_embeddings(question_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_embeddings_subject ON question_embeddings(subject_id)`);
  
  console.log('[VectorStore] 向量存储表已初始化');
}

/**
 * 计算两个向量的余弦相似度
 * @param {number[]} a - 向量 A
 * @param {number[]} b - 向量 B
 * @returns {number} 余弦相似度（0~1）
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

/**
 * 保存 embedding 到数据库
 * @param {Object} db - 数据库实例
 * @param {number} questionId - 题目 ID
 * @param {number[]} embedding - 向量数组
 * @param {Object} [meta] - 元数据
 */
function saveEmbedding(db, questionId, embedding, meta = {}) {
  if (!db || !embedding) return false;
  
  try {
    const embeddingJson = JSON.stringify(embedding);
    db.prepare(`
      INSERT OR REPLACE INTO question_embeddings 
      (question_id, embedding, content_hash, subject_id, chapter_id, model, dimensions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      questionId,
      embeddingJson,
      meta.contentHash || '',
      meta.subjectId || 0,
      meta.chapterId || 0,
      meta.model || 'text-embedding-v3',
      meta.dimensions || embedding.length
    );
    return true;
  } catch (err) {
    console.error(`[VectorStore] 保存 embedding 失败 (question_id=${questionId}):`, err.message);
    return false;
  }
}

/**
 * 批量保存 embeddings
 * @param {Object} db - 数据库实例
 * @param {Array} items - [{questionId, embedding, meta}]
 * @returns {number} 成功保存的数量
 */
function saveBatchEmbeddings(db, items) {
  let count = 0;
  for (const item of items) {
    if (saveEmbedding(db, item.questionId, item.embedding, item.meta)) {
      count++;
    }
  }
  return count;
}

/**
 * Top-K 相似检索
 * @param {Object} db - 数据库实例
 * @param {number[]} queryEmbedding - 查询向量
 * @param {Object} [options] - 检索选项
 * @param {number} [options.topK=5] - 返回前 K 个结果
 * @param {number} [options.minScore=0.3] - 最低相似度阈值
 * @param {number} [options.subjectId] - 限定科目（可选）
 * @param {number} [options.excludeQuestionId] - 排除的题目ID
 * @returns {Array<{questionId: number, score: number, subjectId: number, chapterId: number}>}
 */
function searchSimilar(db, queryEmbedding, options = {}) {
  if (!db || !queryEmbedding) return [];
  
  const { topK = 5, minScore = 0.3, subjectId, excludeQuestionId } = options;

  try {
    // 从数据库加载所有 embedding
    let sql = `
      SELECT question_id, embedding, subject_id, chapter_id 
      FROM question_embeddings 
      WHERE 1=1
    `;
    const params = [];

    if (subjectId) {
      sql += ` AND subject_id = ?`;
      params.push(subjectId);
    }
    if (excludeQuestionId) {
      sql += ` AND question_id != ?`;
      params.push(excludeQuestionId);
    }

    const result = db.exec(sql, params);
    if (!result[0] || !result[0].values) return [];

    // 计算每个向量的余弦相似度
    const scored = result[0].values.map(row => {
      const storedEmbedding = JSON.parse(row[1]);
      const score = cosineSimilarity(queryEmbedding, storedEmbedding);
      return {
        questionId: row[0],
        score: Math.round(score * 10000) / 10000, // 保留4位小数
        subjectId: row[2],
        chapterId: row[3]
      };
    });

    // 按相似度降序排列，过滤阈值，取 Top-K
    return scored
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (err) {
    console.error('[VectorStore] 相似检索失败:', err.message);
    return [];
  }
}

/**
 * 获取统计信息
 * @param {Object} db - 数据库实例
 * @returns {Object} 统计信息
 */
function getStats(db) {
  if (!db) return {};
  
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM question_embeddings').get();
    const bySubject = db.exec(`
      SELECT qe.subject_id, s.name, COUNT(*) as count 
      FROM question_embeddings qe 
      LEFT JOIN subjects s ON qe.subject_id = s.id
      GROUP BY qe.subject_id
    `);

    return {
      totalEmbeddings: total.count,
      bySubject: bySubject[0]?.values?.map(row => ({
        subjectId: row[0],
        subjectName: row[1] || '未分类',
        count: row[2]
      })) || []
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 检查题目是否已有 embedding
 * @param {Object} db - 数据库实例
 * @param {number} questionId - 题目 ID
 * @returns {boolean}
 */
function hasEmbedding(db, questionId) {
  if (!db) return false;
  try {
    const result = db.prepare('SELECT 1 FROM question_embeddings WHERE question_id = ?').get(questionId);
    return !!result;
  } catch {
    return false;
  }
}

/**
 * 获取没有 embedding 的题目 ID 列表
 * @param {Object} db - 数据库实例
 * @param {number} [limit=100] - 最大返回数量
 * @returns {number[]} 题目 ID 数组
 */
function getUnindexedQuestionIds(db, limit = 100) {
  if (!db) return [];
  try {
    const result = db.exec(`
      SELECT q.id FROM questions q
      LEFT JOIN question_embeddings qe ON q.id = qe.question_id
      WHERE qe.id IS NULL
      LIMIT ${limit}
    `);
    if (!result[0]) return [];
    return result[0].values.map(row => row[0]);
  } catch {
    return [];
  }
}

module.exports = {
  initVectorStore,
  cosineSimilarity,
  saveEmbedding,
  saveBatchEmbeddings,
  searchSimilar,
  getStats,
  hasEmbedding,
  getUnindexedQuestionIds
};
