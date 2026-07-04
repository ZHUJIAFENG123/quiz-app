/**
 * 学习计划工具集
 */
function getTools() {
  return [
    {
      definition: {
        type: 'function',
        function: {
          name: 'create_study_plan',
          description: '根据用户数据生成个性化的学习计划',
          parameters: {
            type: 'object',
            properties: {
              days: { type: 'integer', description: '计划天数（1-30）' },
              focus_areas: {
                type: 'array',
                items: { type: 'string' },
                description: '重点关注的章节或知识领域'
              }
            },
            required: ['days']
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const userId = context.userId || 0;
        const days = Math.min(args.days || 7, 30);

        // 获取薄弱章节
        const weakChapters = db.prepare(`
          SELECT c.name, s.name as subject,
                 COUNT(*) as answered,
                 ROUND(SUM(CASE WHEN sr.is_correct = 1 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
          FROM study_records sr
          JOIN questions q ON sr.question_id = q.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          LEFT JOIN subjects s ON q.subject_id = s.id
          WHERE sr.user_id = ?
          GROUP BY q.chapter_id
          HAVING COUNT(*) >= 3
          ORDER BY accuracy ASC
          LIMIT 5
        `).all(userId);

        const wrongCount = db.prepare('SELECT COUNT(*) as count FROM wrong_questions WHERE user_id = ?').get(userId);

        const focusAreas = args.focus_areas || weakChapters.map(w => `${w.subject}/${w.name}`);

        // 生成每日计划
        const dailyPlan = [];
        const perDay = Math.ceil(20 / days); // 每天刷题数

        for (let d = 1; d <= days; d++) {
          const day = { day: d, tasks: [] };

          if (d <= Math.ceil(days * 0.6)) {
            // 前60%天数：主攻薄弱点
            day.tasks.push(`重做错题（当前${wrongCount.count}道）`);
            if (focusAreas.length > 0) {
              const area = focusAreas[(d - 1) % focusAreas.length];
              day.tasks.push(`专项练习：${area}（${perDay}题）`);
            }
          } else if (d <= Math.ceil(days * 0.8)) {
            // 中间20%：综合练习
            day.tasks.push(`模拟考试（${perDay * 2}题，限时）`);
            day.tasks.push('复盘错题，标记已掌握项');
          } else {
            // 最后20%：冲刺
            day.tasks.push('全真模拟测试');
            day.tasks.push('查漏补缺，重点复习标记的考点');
          }
          day.tasks.push('晚间复盘：总结今日收获和明日计划');
          dailyPlan.push(day);
        }

        return {
          planDays: days,
          focusAreas,
          weakChapters: weakChapters.map(w => ({ name: `${w.subject}/${w.name}`, accuracy: `${w.accuracy}%` })),
          dailyPlan,
          totalWrongQuestions: wrongCount.count
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'generate_practice_set',
          description: '生成针对性的练习题集',
          parameters: {
            type: 'object',
            properties: {
              chapter_ids: {
                type: 'array',
                items: { type: 'integer' },
                description: '章节ID列表'
              },
              count: { type: 'integer', description: '题目数量，默认10' },
              difficulty: { type: 'string', description: '难度偏好：easy/medium/hard/all' }
            }
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const count = args.count || 10;
        const difficulty = args.difficulty || 'all';

        let sql = 'SELECT id, type, content, difficulty FROM questions WHERE 1=1';
        const params = [];

        if (args.chapter_ids?.length > 0) {
          sql += ` AND chapter_id IN (${args.chapter_ids.join(',')})`;
        }

        if (difficulty === 'easy') sql += ' AND difficulty <= 2';
        else if (difficulty === 'medium') sql += ' AND difficulty >= 2 AND difficulty <= 4';
        else if (difficulty === 'hard') sql += ' AND difficulty >= 4';

        sql += ' ORDER BY RANDOM() LIMIT ?';
        params.push(count);

        const questions = db.prepare(sql).all(...params);
        return { count: questions.length, questions, difficultyFilter: difficulty };
      }
    }
  ];
}
module.exports = { getTools };
