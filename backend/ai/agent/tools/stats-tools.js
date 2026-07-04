/**
 * 学习统计工具集
 */
function getTools() {
  return [
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_wrong_stats',
          description: '获取用户的错题统计数据（按科目/章节分布、错误次数等）',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'integer', description: '用户ID，不传则使用当前用户' }
            }
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const userId = args.user_id || context.userId || 0;
        
        const totalWrong = db.prepare('SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ?').get(userId);
        
        const bySubject = db.prepare(`
          SELECT s.name as subject, COUNT(*) as count
          FROM wrong_questions wq
          JOIN questions q ON wq.question_id = q.id
          LEFT JOIN subjects s ON q.subject_id = s.id
          WHERE wq.user_id = ?
          GROUP BY q.subject_id
          ORDER BY count DESC
        `).all(userId);

        const byChapter = db.prepare(`
          SELECT c.name as chapter, s.name as subject, COUNT(*) as count
          FROM wrong_questions wq
          JOIN questions q ON wq.question_id = q.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          LEFT JOIN subjects s ON q.subject_id = s.id
          WHERE wq.user_id = ?
          GROUP BY q.chapter_id
          ORDER BY count DESC
          LIMIT 10
        `).all(userId);

        const recentWrongs = db.prepare(`
          SELECT q.content, q.type, s.name as subject, c.name as chapter, wq.wrong_count
          FROM wrong_questions wq
          JOIN questions q ON wq.question_id = q.id
          LEFT JOIN subjects s ON q.subject_id = s.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          WHERE wq.user_id = ?
          ORDER BY wq.last_wrong_at DESC
          LIMIT 5
        `).all(userId);

        return {
          totalWrong: totalWrong.count,
          bySubject,
          byChapter,
          recentWrongQuestions: recentWrongs
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_study_progress',
          description: '获取用户的学习进度（各章节完成度、正确率、学习时长等）',
          parameters: {
            type: 'object',
            properties: {
              user_id: { type: 'integer', description: '用户ID，不传则使用当前用户' },
              subject_id: { type: 'integer', description: '科目ID（可选，不传则查询全部）' }
            }
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const userId = args.user_id || context.userId || 0;

        const totalStudy = db.prepare(`
          SELECT COUNT(*) as total, 
                 SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
          FROM study_records WHERE user_id = ?
        `).get(userId);

        const byChapter = db.prepare(`
          SELECT c.name as chapter, s.name as subject, c.id as chapter_id,
                 COUNT(*) as answered,
                 SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) as correct,
                 ROUND(SUM(CASE WHEN sr.is_correct = 1 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
          FROM study_records sr
          JOIN questions q ON sr.question_id = q.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          LEFT JOIN subjects s ON q.subject_id = s.id
          WHERE sr.user_id = ?
          GROUP BY q.chapter_id
          ORDER BY accuracy ASC
        `).all(userId);

        const chapterTotal = db.prepare(`
          SELECT c.id as chapter_id, c.name as chapter, COUNT(q.id) as total_questions
          FROM chapters c
          LEFT JOIN questions q ON c.id = q.chapter_id
          GROUP BY c.id
        `).all();

        const progress = byChapter.map(ch => {
          const total = chapterTotal.find(t => t.chapter_id === ch.chapter_id);
          return {
            ...ch,
            totalQuestions: total?.total_questions || 0,
            completionRate: total ? Math.round(ch.answered / total.total_questions * 100) : 0
          };
        });

        return {
          summary: {
            totalAnswered: totalStudy.total || 0,
            totalCorrect: totalStudy.correct || 0,
            overallAccuracy: totalStudy.total > 0 
              ? Math.round(totalStudy.correct / totalStudy.total * 100) 
              : 0
          },
          byChapter: progress
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'analyze_exam_readiness',
          description: '评估用户的备考状态，给出预估分数和改进建议',
          parameters: {
            type: 'object',
            properties: {
              subject_id: { type: 'integer', description: '科目ID（可选）' }
            }
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const userId = context.userId || 0;

        const stats = db.prepare(`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
          FROM study_records WHERE user_id = ?
        `).get(userId);

        const wrongCount = db.prepare('SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ?').get(userId);
        const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get();
        
        const coverage = totalQuestions.count > 0 
          ? Math.round((stats.total || 0) / totalQuestions.count * 100) 
          : 0;

        const accuracy = stats.total > 0 
          ? Math.round((stats.correct || 0) / stats.total * 100) 
          : 0;

        // 简单预估分（基于正确率和覆盖度）
        const estimatedScore = Math.round(accuracy * 0.7 + coverage * 0.3);

        return {
          estimatedScore: `${estimatedScore}/100`,
          coverage: `${coverage}%`,
          accuracy: `${accuracy}%`,
          totalStudied: stats.total || 0,
          totalWrong: wrongCount.count,
          totalQuestions: totalQuestions.count,
          readiness: estimatedScore >= 80 ? '准备充分' : 
                     estimatedScore >= 60 ? '基本达标，仍需巩固' : 
                     estimatedScore >= 40 ? '需要加强练习' : '建议系统复习'
        };
      }
    }
  ];
}
module.exports = { getTools };
