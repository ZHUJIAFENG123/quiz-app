/**
 * 学习路径推荐模块
 * 
 * 核心职责：
 * 1. 基于掌握度和遗忘曲线，推荐今日学习内容
 * 2. 生成个性化学习路径（优先级排序）
 * 3. 综合错题、覆盖度、记忆衰减等因素
 */

const mastery = require('./mastery');

/**
 * 获取今日推荐学习内容
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Object} 推荐内容
 */
function getDailyRecommendation(db, userId = 0) {
  if (!db) return { recommendations: [] };

  try {
    const weakChapters = mastery.getWeakChapters(db, userId, 5);
    const allMastery = mastery.getAllMastery(db, userId);

    // 找出需要复习的章节（记忆衰减严重的）
    const needReview = [];
    for (const subject of allMastery.subjects) {
      for (const ch of subject.chapters) {
        if (ch.answered > 0 && ch.retention < 60) {
          needReview.push({
            chapterId: ch.id,
            chapterName: ch.name,
            subjectName: subject.name,
            retention: ch.retention,
            score: ch.score,
            reason: `记忆保持率仅${ch.retention}%，建议及时复习`
          });
        }
      }
    }

    // 找出未学习的章节
    const notStarted = [];
    for (const subject of allMastery.subjects) {
      for (const ch of subject.chapters) {
        if (ch.answered === 0 && ch.totalQuestions > 0) {
          notStarted.push({
            chapterId: ch.id,
            chapterName: ch.name,
            subjectName: subject.name,
            totalQuestions: ch.totalQuestions,
            reason: `尚未开始学习，共${ch.totalQuestions}题`
          });
        }
      }
    }

    // 推荐优先级：薄弱 > 需要复习 > 未开始
    const recommendations = [];

    // 1. 薄弱章节（优先突破）
    for (const ch of weakChapters.slice(0, 2)) {
      recommendations.push({
        priority: 'high',
        type: 'weak',
        chapterId: ch.id,
        chapterName: ch.name,
        subjectName: ch.subjectName,
        score: ch.score,
        reason: `掌握度仅${ch.score}%，是当前最薄弱环节`,
        action: '重做错题 + 同章节新题练习'
      });
    }

    // 2. 需要复习的（记忆衰减）
    for (const ch of needReview.sort((a, b) => a.retention - b.retention).slice(0, 2)) {
      if (!recommendations.find(r => r.chapterId === ch.chapterId)) {
        recommendations.push({
          priority: 'medium',
          type: 'review',
          ...ch,
          action: '快速回顾 + 做5道巩固题'
        });
      }
    }

    // 3. 未开始的章节
    for (const ch of notStarted.slice(0, 1)) {
      recommendations.push({
        priority: 'low',
        type: 'new',
        ...ch,
        action: '开始系统学习新章节'
      });
    }

    return {
      recommendations,
      weakCount: weakChapters.length,
      reviewNeeded: needReview.length,
      notStartedCount: notStarted.length,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    return { recommendations: [], error: err.message };
  }
}

/**
 * 生成学习路径（按优先级排序的章节列表）
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户 ID
 * @returns {Object} 学习路径
 */
function getLearningPath(db, userId = 0) {
  if (!db) return { path: [] };

  const allMastery = mastery.getAllMastery(db, userId);
  const allChapters = [];

  for (const subject of allMastery.subjects) {
    for (const ch of subject.chapters) {
      allChapters.push({
        chapterId: ch.id,
        chapterName: ch.name,
        subjectName: subject.name,
        score: ch.score,
        answered: ch.answered,
        totalQuestions: ch.totalQuestions,
        retention: ch.retention
      });
    }
  }

  // 排序策略：
  // 1. 薄弱但有一定基础的（score 20~60）→ 优先突破
  // 2. 记忆衰减严重的 → 及时复习
  // 3. 完全没学的 → 新知识
  // 4. 已掌握的 → 保持
  const path = allChapters.map(ch => {
    let priority = 0;
    let status = 'not_started';

    if (ch.answered === 0) {
      status = 'not_started';
      priority = 30;
    } else if (ch.score < 40) {
      status = 'weak';
      priority = 100;
    } else if (ch.score < 70) {
      status = 'improving';
      priority = 70;
    } else if (ch.retention < 50) {
      status = 'needs_review';
      priority = 60;
    } else {
      status = 'mastered';
      priority = 10;
    }

    return { ...ch, priority, status };
  }).sort((a, b) => b.priority - a.priority);

  return { path };
}

module.exports = {
  getDailyRecommendation,
  getLearningPath
};
