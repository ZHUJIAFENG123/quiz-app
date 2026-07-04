/**
 * RAG 检索器
 * 
 * 核心职责：
 * 1. 接收用户查询，生成查询向量
 * 2. 在向量存储中检索最相关的题目
 * 3. 组装 RAG 上下文（供 Prompt 注入使用）
 * 4. 提供关键词检索 + 向量检索的混合模式
 * 
 * RAG 管线流程（面试核心展示点）：
 * Query → Embedding → Vector Search → Re-rank → Context Assembly → LLM
 */

const { generateEmbedding } = require('./embedding');
const vectorStore = require('./vector-store');

/**
 * 执行 RAG 检索，返回格式化的上下文文本
 * 
 * @param {Object} db - 数据库实例
 * @param {string} query - 用户查询或题目内容
 * @param {Object} [options] - 检索选项
 * @param {number} [options.topK=5] - 返回数量
 * @param {number} [options.minScore=0.35] - 最低相似度
 * @param {number} [options.subjectId] - 限定科目
 * @param {number} [options.excludeQuestionId] - 排除的题目ID
 * @param {boolean} [options.includeFullOptions=false] - 是否包含选项详情
 * @returns {Promise<{context: string, results: Array, queryEmbedding: number[]|null}>}
 */
async function retrieve(db, query, options = {}) {
  const {
    topK = 5,
    minScore = 0.35,
    subjectId,
    excludeQuestionId,
    includeFullOptions = false
  } = options;

  if (!query || !db) {
    return { context: '', results: [], queryEmbedding: null };
  }

  try {
    // Step 1: 生成查询向量
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      console.log('[Retriever] Embedding 生成失败，尝试关键词降级检索');
      const fallbackResults = keywordSearch(db, query, { topK, excludeQuestionId, subjectId });
      return {
        context: formatResults(fallbackResults, db, includeFullOptions),
        results: fallbackResults,
        queryEmbedding: null
      };
    }

    // Step 2: 向量检索
    const similarResults = vectorStore.searchSimilar(db, queryEmbedding, {
      topK,
      minScore,
      subjectId,
      excludeQuestionId
    });

    if (similarResults.length === 0) {
      return { context: '', results: [], queryEmbedding };
    }

    // Step 3: 组装上下文
    const context = formatResults(similarResults, db, includeFullOptions);

    return {
      context,
      results: similarResults,
      queryEmbedding
    };
  } catch (err) {
    console.error('[Retriever] 检索失败:', err.message);
    // 降级到关键词检索
    const fallbackResults = keywordSearch(db, query, { topK, excludeQuestionId, subjectId });
    return {
      context: formatResults(fallbackResults, db, includeFullOptions),
      results: fallbackResults,
      queryEmbedding: null
    };
  }
}

/**
 * 为题目解析场景检索相关题目
 * @param {Object} db - 数据库实例
 * @param {Object} question - 当前题目对象
 * @param {Object} [options] - 选项
 * @returns {Promise<{context: string, results: Array}>}
 */
async function retrieveForQuestion(db, question, options = {}) {
  if (!question) return { context: '', results: [] };

  // 用题干+科目+章节构建查询
  const queryText = [
    question.content,
    question.subject_name || '',
    question.chapter_name || ''
  ].filter(Boolean).join(' ');

  return retrieve(db, queryText, {
    topK: 3,
    minScore: 0.4,
    subjectId: question.subject_id,
    excludeQuestionId: question.id,
    ...options
  });
}

/**
 * 关键词降级检索（当 embedding API 不可用时使用）
 * @param {Object} db - 数据库实例
 * @param {string} query - 查询文本
 * @param {Object} [options] - 选项
 * @returns {Array} 检索结果
 */
function keywordSearch(db, query, options = {}) {
  const { topK = 5, excludeQuestionId, subjectId } = options;

  if (!db || !query) return [];

  try {
    // 提取关键词（简单的分词：按空格和标点拆分，取前3个有效词）
    const keywords = query
      .replace(/[？?！!。，,、]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 3);

    if (keywords.length === 0) return [];

    // 构建 LIKE 查询
    let sql = `
      SELECT q.id as question_id, q.subject_id, q.chapter_id, q.content,
             s.name as subject_name, c.name as chapter_name
      FROM questions q
      LEFT JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN chapters c ON q.chapter_id = c.id
      WHERE 1=1
    `;
    const params = [];

    for (const keyword of keywords) {
      sql += ` AND q.content LIKE ?`;
      params.push(`%${keyword}%`);
    }

    if (subjectId) {
      sql += ` AND q.subject_id = ?`;
      params.push(subjectId);
    }
    if (excludeQuestionId) {
      sql += ` AND q.id != ?`;
      params.push(excludeQuestionId);
    }

    sql += ` LIMIT ${topK}`;

    const result = db.exec(sql, params);
    if (!result[0] || !result[0].values) return [];

    return result[0].values.map(row => ({
      questionId: row[0],
      subjectId: row[1],
      chapterId: row[2],
      content: row[3],
      subjectName: row[4],
      chapterName: row[5],
      score: 0.5 // 关键词匹配给一个固定分数
    }));
  } catch (err) {
    console.error('[Retriever] 关键词检索失败:', err.message);
    return [];
  }
}

/**
 * 将检索结果格式化为 RAG 上下文文本
 * @param {Array} results - 检索结果
 * @param {Object} db - 数据库实例
 * @param {boolean} [includeOptions=false] - 是否包含选项
 * @returns {string} 格式化的上下文文本
 */
function formatResults(results, db, includeOptions = false) {
  if (!results.length) return '';

  const lines = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const scoreStr = r.score ? `[相似度:${(r.score * 100).toFixed(0)}%]` : '';
    
    // 获取完整题目信息
    let question = r;
    if (db && r.questionId) {
      try {
        const fullQ = db.prepare(`
          SELECT q.*, s.name as subject_name, c.name as chapter_name
          FROM questions q
          LEFT JOIN subjects s ON q.subject_id = s.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          WHERE q.id = ?
        `).get(r.questionId);
        if (fullQ) question = { ...fullQ, score: r.score };
      } catch {}
    }

    let entry = `${i + 1}. ${scoreStr} **${question.subject_name || '未分类'}** / ${question.chapter_name || '未分类'}`;
    entry += `\n   题目：${question.content || ''}`;
    
    if (includeOptions && question.option_a) {
      const opts = [question.option_a, question.option_b, question.option_c, question.option_d]
        .filter(Boolean)
        .map((o, idx) => `   ${String.fromCharCode(65 + idx)}. ${o}`)
        .join('\n');
      if (opts) entry += `\n${opts}`;
    }
    
    if (question.answer) entry += `\n   答案：${question.answer}`;
    if (question.analysis) entry += `\n   解析：${question.analysis.slice(0, 150)}${question.analysis.length > 150 ? '...' : ''}`;

    lines.push(entry);
  }

  return lines.join('\n\n');
}

module.exports = {
  retrieve,
  retrieveForQuestion,
  keywordSearch,
  formatResults
};
