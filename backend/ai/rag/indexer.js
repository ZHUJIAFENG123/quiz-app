/**
 * 批量索引器
 * 
 * 核心职责：
 * 1. 启动时自动为所有未索引的题目生成 embedding
 * 2. 支持增量索引（只处理新增/修改的题目）
 * 3. 提供手动触发全量重建的接口
 * 
 * 运行策略：
 * - 首次启动：为所有题目生成 embedding（约需几分钟）
 * - 后续启动：仅索引新增题目
 * - 分批处理：每批20条，间隔100ms，避免API限流
 */

const crypto = require('crypto');
const { generateBatchEmbeddings, buildQuestionEmbeddingText } = require('./embedding');
const vectorStore = require('./vector-store');

// 索引状态
let indexState = {
  isRunning: false,
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  error: null
};

/**
 * 计算题目内容哈希（用于检测内容是否变化）
 * @param {Object} question - 题目对象
 * @returns {string} MD5 哈希
 */
function contentHash(question) {
  const text = buildQuestionEmbeddingText(question);
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * 启动增量索引（只处理未索引的题目）
 * @param {Object} db - 数据库实例
 * @param {Object} [options] - 选项
 * @param {number} [options.batchSize=20] - 每批大小
 * @param {number} [options.delay=100] - 批次间延迟(ms)
 * @param {boolean} [options.forceRebuild=false] - 是否强制重建
 * @returns {Promise<Object>} 索引结果
 */
async function startIndexing(db, options = {}) {
  if (indexState.isRunning) {
    console.log('[Indexer] 索引正在进行中，跳过重复请求');
    return indexState;
  }

  const { batchSize = 20, delay = 100, forceRebuild = false } = options;

  indexState = {
    isRunning: true,
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null
  };

  try {
    // 获取需要索引的题目
    let questions;
    if (forceRebuild) {
      // 全量重建
      questions = db.exec(`
        SELECT q.*, s.name AS subject_name, c.name AS chapter_name
        FROM questions q
        LEFT JOIN subjects s ON q.subject_id = s.id
        LEFT JOIN chapters c ON q.chapter_id = c.id
        ORDER BY q.id
      `);
    } else {
      // 增量索引（只处理未索引的）
      questions = db.exec(`
        SELECT q.*, s.name AS subject_name, c.name AS chapter_name
        FROM questions q
        LEFT JOIN subjects s ON q.subject_id = s.id
        LEFT JOIN chapters c ON q.chapter_id = c.id
        LEFT JOIN question_embeddings qe ON q.id = qe.question_id
        WHERE qe.id IS NULL
        ORDER BY q.id
      `);
    }

    if (!questions[0] || !questions[0].values) {
      console.log('[Indexer] 没有需要索引的题目');
      indexState.isRunning = false;
      indexState.finishedAt = new Date().toISOString();
      return indexState;
    }

    const columns = questions[0].columns;
    const rows = questions[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });

    indexState.total = rows.length;
    console.log(`[Indexer] 开始索引 ${rows.length} 道题目...`);

    // 分批处理
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const texts = batch.map(q => buildQuestionEmbeddingText(q));

      try {
        const embeddings = await generateBatchEmbeddings(texts, { batchSize, delay: 0 });

        // 保存每个 embedding
        for (let j = 0; j < batch.length; j++) {
          const question = batch[j];
          const embedding = embeddings[j];

          if (embedding) {
            vectorStore.saveEmbedding(db, question.id, embedding, {
              contentHash: contentHash(question),
              subjectId: question.subject_id,
              chapterId: question.chapter_id
            });
            indexState.success++;
          } else {
            indexState.failed++;
          }
        }
      } catch (err) {
        console.error(`[Indexer] 批次 ${Math.floor(i/batchSize) + 1} 失败:`, err.message);
        indexState.failed += batch.length;
      }

      indexState.processed = Math.min(i + batchSize, rows.length);
      console.log(`[Indexer] 进度: ${indexState.processed}/${indexState.total} (成功:${indexState.success} 失败:${indexState.failed})`);

      // 批次间延迟
      if (i + batchSize < rows.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    indexState.isRunning = false;
    indexState.finishedAt = new Date().toISOString();

    // 持久化到文件
    try {
      const { saveNow } = require('../../config/database');
      saveNow();
    } catch {}

    console.log(`[Indexer] 索引完成: ${indexState.success} 成功, ${indexState.failed} 失败`);
    return indexState;
  } catch (err) {
    indexState.isRunning = false;
    indexState.error = err.message;
    indexState.finishedAt = new Date().toISOString();
    console.error('[Indexer] 索引失败:', err.message);
    return indexState;
  }
}

/**
 * 获取当前索引状态
 * @returns {Object} 索引状态
 */
function getIndexState() {
  return { ...indexState };
}

/**
 * 延迟启动索引（在服务启动完成后执行，避免阻塞启动）
 * @param {Object} db - 数据库实例
 * @param {number} [delayMs=5000] - 延迟毫秒数
 */
function scheduleIndexing(db, delayMs = 5000) {
  setTimeout(async () => {
    console.log('[Indexer] 开始自动索引检查...');
    try {
      const stats = vectorStore.getStats(db);
      const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
      
      if (stats.totalEmbeddings >= totalQuestions.count) {
        console.log(`[Indexer] 所有题目已索引 (${stats.totalEmbeddings}/${totalQuestions.count})，跳过`);
        return;
      }

      await startIndexing(db);
    } catch (err) {
      console.error('[Indexer] 自动索引失败:', err.message);
    }
  }, delayMs);
}

module.exports = {
  startIndexing,
  getIndexState,
  scheduleIndexing,
  contentHash
};
