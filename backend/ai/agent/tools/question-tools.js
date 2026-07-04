/**
 * 题目查询工具集
 */
function getTools() {
  return [
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_question_detail',
          description: '获取指定题目的详细信息（含选项、答案、解析）',
          parameters: {
            type: 'object',
            properties: {
              question_id: { type: 'integer', description: '题目ID' }
            },
            required: ['question_id']
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const q = db.prepare(`
          SELECT q.*, s.name as subject_name, c.name as chapter_name
          FROM questions q
          LEFT JOIN subjects s ON q.subject_id = s.id
          LEFT JOIN chapters c ON q.chapter_id = c.id
          WHERE q.id = ?
        `).get(args.question_id);
        if (!q) return { error: '题目不存在' };
        return {
          id: q.id, type: q.type, content: q.content,
          options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
          answer: q.answer, analysis: q.analysis || '暂无解析',
          difficulty: q.difficulty, subject: q.subject_name, chapter: q.chapter_name
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'list_questions_by_chapter',
          description: '列出指定章节的题目概要',
          parameters: {
            type: 'object',
            properties: {
              chapter_id: { type: 'integer', description: '章节ID' },
              limit: { type: 'integer', description: '返回数量，默认10' }
            },
            required: ['chapter_id']
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const limit = args.limit || 10;
        const questions = db.prepare(`
          SELECT id, type, content, answer, difficulty FROM questions
          WHERE chapter_id = ? LIMIT ?
        `).all(args.chapter_id, limit);
        return { count: questions.length, questions };
      }
    }
  ];
}
module.exports = { getTools };
