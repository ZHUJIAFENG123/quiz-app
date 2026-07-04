/**
 * 知识掌握度计算模块
 * 
 * 核心算法：
 * 掌握度 = 正确率 * 0.6 + 记忆保持率 * 0.2 + 覆盖度 * 0.2
 * 
 * 面试展示点：
 * - 基于艾宾浩斯遗忘曲线的记忆保持率模型
 * - 多维度加权评估（不仅看正确率）
 * - 动态更新，实时反映学习状态
 */

/**
 * 艾宾浩斯遗忘衰减函数
 * @param {Date|string} lastStudyDate - 最后学习时间
 * @param {Date} [now] - 当前时间
 * @returns {number} 记忆保持率（0~1）
 */
function retentionRate(lastStudyDate, now = new Date()) {
  if (!lastStudyDate) return 0;
  const last = new Date(lastStudyDate);
  const daysSince = Math.max(0, (now - last) / (1000 * 60 * 60 * 24));
  // 简化版遗忘曲线：R = e^(-k*t)
  // k=0.1 意味着1天后保持约90%，7天后约50%，30天后约5%
  return Math.exp(-0.1 * daysSince);
}

/**
 * 计算单个章节的掌握度
 * @param {Object} db - 数据库实例
 * @param {number} chapterId - 章节 ID
 * @param {number} userId - 用户 ID
 * @returns {Object} 掌握度详情
 */
function chapterMastery(db, chapterId, userId = 0) {
  if (!db) return { score: 0 };

  try {
    // 获取该章节的题目总数
    const totalQ = db.prepare('SELECT COUNT(*) as count FROM questions WHERE chapter_id = ?').get(chapterId);
    const totalQuestions = totalQ?.count || 0;
    if (totalQuestions === 0) return { score: 0, totalQuestions: 0 };

    // 获取答题记录
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as answered,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
        COUNT(DISTINCT question_id) as unique_questions
      FROM study_records 
      WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = ?)
      AND user_id = ?
    `).get(chapterId, userId);

    if (!stats || stats.answered === 0) {
      return { score: 0, totalQuestions, answered: 0, accuracy: 0, coverage: 0, retention: 0 };
    }

    // 正确率
    const accuracy = stats.correct / stats.answered;

    // 记忆保持率（基于最后一次答题时间）
    const lastStudy = db.prepare(`
      SELECT MAX(created_at) as last_at FROM study_records 
      WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = ?)
      AND user_id = ?
    `).get(chapterId, userId);
    const retention = retentionRate(lastStudy?.last_at);

    // 覆盖度（做过的不同题目 / 章节总题目数）
    const coverage = stats.unique_questions / totalQuestions;

    // 综合掌握度
    const score = Math.round((accuracy * 0.6 + retention * 0.2 + coverage * 0.2) * 100);

    return {
      score: Math.min(100, score),
      totalQuestions,
      answered: stats.answered,
      uniqueQuestions: stats.unique_questions,
      accuracy: Math.round(accuracy * 100),
      coverage: Math.round(coverage * 100),
      retention: Math.round(retention * 100),
      lastStudyAt: lastStudy?.last_at
    };
  } catch (err) {
    return { score: 0, error: err.message };
  }
}

/**
 * 获取所有科目的掌握度概览
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Object} 按科目/章节分组的掌握度数据
 */
function getAllMastery(db, userId = 0) {
  if (!db) return { subjects: [] };

  try {
    const subjects = db.prepare('SELECT * FROM subjects ORDER BY sort_order').all();
    const result = [];

    for (const subject of subjects) {
      const chapters = db.prepare('SELECT * FROM chapters WHERE subject_id = ? ORDER BY sort_order').all(subject.id);
      const chapterMasteryList = [];
      let totalScore = 0;
      let chapterCount = 0;

      for (const chapter of chapters) {
        const mastery = chapterMastery(db, chapter.id, userId);
        chapterMasteryList.push({
          id: chapter.id,
          name: chapter.name,
          ...mastery
        });
        if (mastery.answered > 0) {
          totalScore += mastery.score;
          chapterCount++;
        }
      }

      const subjectScore = chapterCount > 0 ? Math.round(totalScore / chapterCount) : 0;

      result.push({
        id: subject.id,
        name: subject.name,
        score: subjectScore,
        chapters: chapterMasteryList
      });
    }

    return { subjects: result };
  } catch (err) {
    return { subjects: [], error: err.message };
  }
}

/**
 * 获取薄弱章节列表（按掌握度升序）
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @param {number} [topN=5] - 返回数量
 * @returns {Array} 薄弱章节列表
 */
function getWeakChapters(db, userId = 0, topN = 5) {
  if (!db) return [];

  const mastery = getAllMastery(db, userId);
  const allChapters = [];

  for (const subject of mastery.subjects) {
    for (const chapter of subject.chapters) {
      if (chapter.answered > 0) {
        allChapters.push({
          ...chapter,
          subjectName: subject.name,
          subjectId: subject.id
        });
      }
    }
  }

  return allChapters
    .sort((a, b) => a.score - b.score)
    .slice(0, topN);
}

module.exports = {
  retentionRate,
  chapterMastery,
  getAllMastery,
  getWeakChapters
};
