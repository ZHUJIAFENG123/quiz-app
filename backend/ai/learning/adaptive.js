/**
 * 难度自适应出题模块
 * 
 * 核心思路（简化版 IRT 项目反应理论）：
 * 1. 根据用户近期答题表现估算能力值 theta
 * 2. 选择难度最接近用户能力值的题目
 * 3. 答对→提升难度，答错→降低难度
 * 
 * 面试展示点：
 * - 自适应出题的教育测量学原理
 * - 动态难度调整算法
 */

/**
 * 估算用户当前能力值
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @param {number} [recentN=20] - 基于最近N道题估算
 * @returns {number} 能力值（1~5，对应题目难度范围）
 */
function estimateAbility(db, userId = 0, recentN = 20) {
  if (!db) return 3; // 默认中等

  try {
    const recent = db.prepare(`
      SELECT sr.is_correct, q.difficulty
      FROM study_records sr
      JOIN questions q ON sr.question_id = q.id
      WHERE sr.user_id = ?
      ORDER BY sr.created_at DESC
      LIMIT ?
    `).all(userId, recentN);

    if (recent.length < 3) return 3; // 数据不足，默认中等

    // 加权正确率（近期表现权重更高）
    let weightedCorrect = 0;
    let totalWeight = 0;
    
    recent.forEach((r, i) => {
      const weight = (recent.length - i) / recent.length; // 越近权重越高
      weightedCorrect += (r.is_correct ? 1 : 0) * weight;
      totalWeight += weight;
    });

    const weightedAccuracy = totalWeight > 0 ? weightedCorrect / totalWeight : 0.5;

    // 映射到 1~5 的能力值
    // 正确率 0% → 能力值 1, 100% → 能力值 5
    const ability = 1 + weightedAccuracy * 4;
    return Math.max(1, Math.min(5, ability));
  } catch {
    return 3;
  }
}

/**
 * 自适应选题：根据用户能力值选择合适难度的题目
 * @param {Object} db - 数据库实例
 * @param {Object} options - 选项
 * @param {number} options.userId - 用户 ID
 * @param {number} [options.subjectId] - 科目 ID
 * @param {number} [options.chapterId] - 章节 ID
 * @param {number} [options.count=10] - 题目数量
 * @param {boolean} [options.avoidRepeat=true] - 避免重复做过的题
 * @returns {Object} 题目列表 + 自适应信息
 */
function getAdaptiveQuestions(db, options = {}) {
  const { userId = 0, subjectId, chapterId, count = 10, avoidRepeat = true } = options;

  if (!db) return { questions: [], ability: 3 };

  const ability = estimateAbility(db, userId);
  const targetDifficulty = Math.round(ability);

  // 构建查询条件
  let whereClause = '1=1';
  const params = [];

  if (subjectId) {
    whereClause += ' AND q.subject_id = ?';
    params.push(subjectId);
  }
  if (chapterId) {
    whereClause += ' AND q.chapter_id = ?';
    params.push(chapterId);
  }

  // 避免重复做过的题
  if (avoidRepeat) {
    whereClause += ' AND q.id NOT IN (SELECT question_id FROM study_records WHERE user_id = ?)';
    params.push(userId);
  }

  // 按难度接近度排序（优先选难度=能力值的题）
  // 如果没有足够匹配题，放宽难度范围
  const questions = db.prepare(`
    SELECT q.*, s.name as subject_name, c.name as chapter_name
    FROM questions q
    LEFT JOIN subjects s ON q.subject_id = s.id
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE ${whereClause}
    ORDER BY ABS(q.difficulty - ?) ASC, RANDOM()
    LIMIT ?
  `).all(...params, targetDifficulty, count);

  return {
    questions,
    ability: Math.round(ability * 10) / 10,
    targetDifficulty,
    difficultyDistribution: questions.reduce((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
      return acc;
    }, {})
  };
}

module.exports = {
  estimateAbility,
  getAdaptiveQuestions
};
