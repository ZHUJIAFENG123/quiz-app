/**
 * AI 智能组卷模块
 * 
 * 核心策略：
 * 1. 根据用户画像（薄弱章节、错题分布、能力值）智能分配题目
 * 2. 覆盖度优先：确保每个科目/章节都有覆盖
 * 3. 难度梯度：从易到难排列
 * 4. 避免重复：近期做过的题目权重降低
 * 
 * 不依赖LLM生成题目（节省token），而是用AI分析用户画像后智能选题
 */

const masteryModule = require('../learning/mastery');
const adaptive = require('../learning/adaptive');

/**
 * 生成智能试卷
 * @param {Object} db - 数据库实例
 * @param {Object} options - 组卷选项
 * @returns {Object} 试卷数据
 */
function generateSmartExam(db, options = {}) {
  const {
    userId = 0,
    totalCount = 20,         // 题目总数
    subjectIds = [],         // 指定科目（空则全部）
    mode = 'balanced',       // balanced(均衡) / weakness(薄弱攻克) / simulation(模拟考试)
    timeLimit = 30           // 限时（分钟）
  } = options;

  // 1. 分析用户画像
  const profile = analyzeUserProfile(db, userId);

  // 2. 根据模式制定选题策略
  let allocation;
  switch (mode) {
    case 'weakness':
      allocation = weaknessAllocation(db, profile, totalCount, subjectIds);
      break;
    case 'simulation':
      allocation = simulationAllocation(db, profile, totalCount, subjectIds);
      break;
    default:
      allocation = balancedAllocation(db, profile, totalCount, subjectIds);
  }

  // 3. 按分配方案选题
  const questions = selectQuestions(db, allocation, userId);

  // 4. 难度排序（从易到难）
  questions.sort((a, b) => (a.difficulty || 1) - (b.difficulty || 1));

  return {
    sessionId: generateSessionId(),
    mode,
    totalCount: questions.length,
    timeLimit,
    questions: questions.map((q, idx) => ({
      index: idx + 1,
      id: q.id,
      type: q.type,
      content: q.content,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      difficulty: q.difficulty,
      subject_name: q.subject_name,
      chapter_name: q.chapter_name,
      // 不暴露答案
      answer: null,
      analysis: null
    })),
    // 答案单独存储（提交后对比）
    _answers: questions.map(q => ({ id: q.id, answer: q.answer, analysis: q.analysis })),
    profile,
    strategy: getStrategyDescription(mode, allocation)
  };
}

/**
 * 分析用户画像
 */
function analyzeUserProfile(db, userId) {
  const profile = {
    totalStudied: 0,
    overallAccuracy: 0,
    abilityLevel: 3,
    weakChapters: [],
    strongChapters: [],
    recentWrongIds: [],
    typeAccuracy: {}
  };

  if (!userId) return profile;

  // 总体统计
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as accuracy
    FROM study_records WHERE user_id = ?
  `).get(userId);
  profile.totalStudied = stats?.total || 0;
  profile.overallAccuracy = stats?.accuracy || 0;

  // 能力值
  try {
    profile.abilityLevel = adaptive.estimateAbility(db, userId);
  } catch {}

  // 各章节正确率
  const chapterStats = db.prepare(`
    SELECT 
      q.chapter_id,
      c.name as chapter_name,
      s.name as subject_name,
      COUNT(DISTINCT sr.question_id) as studied,
      SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as accuracy
    FROM study_records sr
    JOIN questions q ON sr.question_id = q.id
    JOIN chapters c ON q.chapter_id = c.id
    LEFT JOIN subjects s ON q.subject_id = s.id
    WHERE sr.user_id = ?
    GROUP BY q.chapter_id
    HAVING studied >= 3
    ORDER BY accuracy ASC
  `).all(userId);

  profile.weakChapters = chapterStats.filter(c => c.accuracy < 0.5);
  profile.strongChapters = chapterStats.filter(c => c.accuracy >= 0.8);

  // 最近错题ID
  profile.recentWrongIds = db.prepare(`
    SELECT DISTINCT sr.question_id 
    FROM study_records sr 
    WHERE sr.user_id = ? AND sr.is_correct = 0 
    ORDER BY sr.created_at DESC LIMIT 50
  `).all(userId).map(r => r.question_id);

  // 各题型正确率
  const typeStats = db.prepare(`
    SELECT q.type, 
      COUNT(*) as total,
      SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as accuracy
    FROM study_records sr JOIN questions q ON sr.question_id = q.id
    WHERE sr.user_id = ?
    GROUP BY q.type
  `).all(userId);
  for (const ts of typeStats) {
    profile.typeAccuracy[ts.type] = ts.accuracy;
  }

  return profile;
}

/**
 * 均衡模式：按章节题目比例均匀分配
 */
function balancedAllocation(db, profile, totalCount, subjectIds) {
  const chapters = getAvailableChapters(db, subjectIds);
  const totalQuestions = chapters.reduce((sum, c) => sum + c.question_count, 0);
  
  return chapters.map(ch => ({
    chapterId: ch.id,
    chapterName: ch.name,
    subjectName: ch.subject_name,
    target: Math.max(1, Math.round(ch.question_count / totalQuestions * totalCount)),
    difficulty: profile.abilityLevel
  }));
}

/**
 * 薄弱攻克模式：70%来自薄弱章节
 */
function weaknessAllocation(db, profile, totalCount, subjectIds) {
  const chapters = getAvailableChapters(db, subjectIds);
  const weakIds = new Set(profile.weakChapters.map(c => c.chapter_id));
  
  const weakChapters = chapters.filter(c => weakIds.has(c.id));
  const otherChapters = chapters.filter(c => !weakIds.has(c.id));

  const weakCount = Math.round(totalCount * 0.7);
  const otherCount = totalCount - weakCount;

  const allocation = [];
  
  if (weakChapters.length > 0) {
    const perWeak = Math.ceil(weakCount / weakChapters.length);
    for (const ch of weakChapters) {
      allocation.push({
        chapterId: ch.id,
        chapterName: ch.name,
        subjectName: ch.subject_name,
        target: perWeak,
        difficulty: Math.max(1, profile.abilityLevel - 1), // 略低于能力值
        priority: 'weak'
      });
    }
  }

  if (otherChapters.length > 0) {
    const perOther = Math.ceil(otherCount / otherChapters.length);
    for (const ch of otherChapters) {
      allocation.push({
        chapterId: ch.id,
        chapterName: ch.name,
        subjectName: ch.subject_name,
        target: perOther,
        difficulty: profile.abilityLevel
      });
    }
  }

  return allocation;
}

/**
 * 模拟考试模式：按真题分布模拟
 */
function simulationAllocation(db, profile, totalCount, subjectIds) {
  const chapters = getAvailableChapters(db, subjectIds);
  const totalQuestions = chapters.reduce((sum, c) => sum + c.question_count, 0);

  return chapters.map(ch => ({
    chapterId: ch.id,
    chapterName: ch.name,
    subjectName: ch.subject_name,
    target: Math.max(2, Math.round(ch.question_count / totalQuestions * totalCount)),
    difficulty: 3, // 模拟考固定中等难度为主
    mixed: true // 混合难度
  }));
}

/**
 * 获取可用章节
 */
function getAvailableChapters(db, subjectIds = []) {
  let query = `
    SELECT c.id, c.name, c.subject_id, s.name as subject_name,
      COUNT(q.id) as question_count
    FROM chapters c
    LEFT JOIN subjects s ON c.subject_id = s.id
    LEFT JOIN questions q ON q.chapter_id = c.id
  `;
  const params = [];

  if (subjectIds.length > 0) {
    query += ` WHERE c.subject_id IN (${subjectIds.map(() => '?').join(',')})`;
    params.push(...subjectIds);
  }

  query += ` GROUP BY c.id HAVING question_count > 0`;
  return db.prepare(query).all(...params);
}

/**
 * 按分配方案选题
 */
function selectQuestions(db, allocation, userId) {
  const selected = [];
  const usedIds = new Set();

  // 获取近期做过的题目（降低权重）
  const recentIds = new Set();
  if (userId) {
    const recent = db.prepare(`
      SELECT DISTINCT question_id FROM study_records 
      WHERE user_id = ? AND created_at > datetime('now', '-3 days')
    `).all(userId);
    for (const r of recent) recentIds.add(r.question_id);
  }

  for (const alloc of allocation) {
    const difficulty = alloc.difficulty || 3;
    const mixed = alloc.mixed || false;

    let query, params;
    if (mixed) {
      query = `SELECT * FROM questions WHERE chapter_id = ? ORDER BY RANDOM() LIMIT ?`;
      params = [alloc.chapterId, alloc.target * 2];
    } else {
      // 优先选接近目标难度的题目
      query = `
        SELECT *, ABS(difficulty - ?) as diff_gap 
        FROM questions 
        WHERE chapter_id = ? 
        ORDER BY diff_gap ASC, RANDOM() 
        LIMIT ?
      `;
      params = [difficulty, alloc.chapterId, alloc.target * 2];
    }

    const candidates = db.prepare(query).all(...params);

    let count = 0;
    for (const q of candidates) {
      if (count >= alloc.target) break;
      if (usedIds.has(q.id)) continue;

      // 近期做过的题目有50%概率跳过
      if (recentIds.has(q.id) && Math.random() < 0.5) continue;

      selected.push(q);
      usedIds.add(q.id);
      count++;
    }

    // 如果候选不够，补充该章节其他题目
    if (count < alloc.target) {
      const extras = db.prepare(
        'SELECT * FROM questions WHERE chapter_id = ? ORDER BY RANDOM() LIMIT ?'
      ).all(alloc.chapterId, alloc.target - count + 5);

      for (const q of extras) {
        if (count >= alloc.target) break;
        if (usedIds.has(q.id)) continue;
        selected.push(q);
        usedIds.add(q.id);
        count++;
      }
    }
  }

  return selected;
}

/**
 * 获取策略描述
 */
function getStrategyDescription(mode, allocation) {
  const chapterNames = allocation.map(a => `${a.chapterName}(${a.target}题)`).join('、');
  
  switch (mode) {
    case 'weakness':
      return `薄弱攻克模式：重点覆盖薄弱章节（70%），其余章节巩固。分配：${chapterNames}`;
    case 'simulation':
      return `模拟考试模式：按各章节题目比例分配，模拟真实考试。分配：${chapterNames}`;
    default:
      return `均衡模式：各章节按比例均匀分配。分配：${chapterNames}`;
  }
}

function generateSessionId() {
  return 'smart_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { generateSmartExam, analyzeUserProfile };
