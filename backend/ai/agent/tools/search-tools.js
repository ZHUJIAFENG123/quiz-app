/**
 * 语义搜索工具集（依赖 RAG）
 */
const retriever = require('../../rag/retriever');

function getTools() {
  return [
    {
      definition: {
        type: 'function',
        function: {
          name: 'search_questions',
          description: '语义搜索题库，找到与查询相关的题目（支持自然语言查询）',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词或问题描述' },
              subject_id: { type: 'integer', description: '科目ID（可选，不传则搜索全部科目）' },
              limit: { type: 'integer', description: '返回结果数量，默认5' }
            },
            required: ['query']
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        const result = await retriever.retrieve(db, args.query, {
          topK: args.limit || 5,
          minScore: 0.3,
          subjectId: args.subject_id,
          includeFullOptions: true
        });

        return {
          query: args.query,
          resultCount: result.results.length,
          usedEmbedding: !!result.queryEmbedding,
          questions: result.results.map(r => ({
            id: r.questionId,
            score: r.score,
            content: r.content,
            subject: r.subjectName,
            chapter: r.chapterName,
            answer: r.answer,
            analysis: r.analysis
          }))
        };
      }
    },
    {
      definition: {
        type: 'function',
        function: {
          name: 'get_chapter_knowledge',
          description: '获取指定章节的知识点概要（基于该章节的题目内容）',
          parameters: {
            type: 'object',
            properties: {
              chapter_id: { type: 'integer', description: '章节ID' }
            },
            required: ['chapter_id']
          }
        }
      },
      handler: (context) => async (args) => {
        const { db } = context;
        
        const chapter = db.prepare(`
          SELECT c.*, s.name as subject_name
          FROM chapters c
          LEFT JOIN subjects s ON c.subject_id = s.id
          WHERE c.id = ?
        `).get(args.chapter_id);

        if (!chapter) return { error: '章节不存在' };

        const questions = db.prepare(`
          SELECT id, type, content, answer, analysis, difficulty
          FROM questions
          WHERE chapter_id = ?
          ORDER BY id
        `).all(args.chapter_id);

        // 提取关键词作为知识点概要
        const keyPoints = [];
        for (const q of questions.slice(0, 20)) {
          if (q.analysis) {
            keyPoints.push(q.analysis.slice(0, 100));
          }
        }

        return {
          chapter: chapter.name,
          subject: chapter.subject_name,
          totalQuestions: questions.length,
          typeDistribution: questions.reduce((acc, q) => {
            acc[q.type] = (acc[q.type] || 0) + 1;
            return acc;
          }, {}),
          keyPoints: keyPoints.slice(0, 5),
          avgDifficulty: questions.length > 0 
            ? (questions.reduce((s, q) => s + q.difficulty, 0) / questions.length).toFixed(1)
            : 0
        };
      }
    }
  ];
}
module.exports = { getTools };
