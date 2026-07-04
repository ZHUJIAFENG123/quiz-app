/**
 * 知识图谱构建器
 * 
 * 两种模式：
 * 1. 自动模式（基于题目统计）：从题目的科目-章节-关键词关系自动构建图谱
 * 2. AI模式（可选）：调用LLM提取考点关联关系
 * 
 * 图谱数据结构：
 * - nodes: [{ id, label, type, group, size, mastery }]
 * - edges: [{ from, to, label, weight, type }]
 */

/**
 * 从数据库自动构建知识图谱（基于统计）
 * @param {Object} db - 数据库实例
 * @param {number} [userId=0] - 用户ID
 * @returns {{ nodes: Array, edges: Array }} 图谱数据
 */
function buildFromDatabase(db, userId = 0) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  // 1. 获取所有科目作为根节点
  const subjects = db.prepare('SELECT id, name FROM subjects').all();
  for (const s of subjects) {
    nodes.push({
      id: `subject_${s.id}`,
      label: s.name,
      type: 'subject',
      group: 'subject',
      size: 40,
      color: '#6366f1'
    });
    nodeIds.add(`subject_${s.id}`);
  }

  // 2. 获取所有章节作为中间节点
  const chapters = db.prepare(`
    SELECT c.id, c.name, c.subject_id, COUNT(q.id) as question_count
    FROM chapters c
    LEFT JOIN questions q ON q.chapter_id = c.id
    GROUP BY c.id
    HAVING question_count > 0
  `).all();

  for (const ch of chapters) {
    nodes.push({
      id: `chapter_${ch.id}`,
      label: ch.name,
      type: 'chapter',
      group: 'chapter',
      size: Math.min(25 + ch.question_count * 0.5, 50),
      questionCount: ch.question_count,
      color: '#8b5cf6'
    });
    nodeIds.add(`chapter_${ch.id}`);

    // 科目 → 章节 的层级关系
    edges.push({
      from: `subject_${ch.subject_id}`,
      to: `chapter_${ch.id}`,
      type: 'hierarchy',
      weight: 1,
      color: '#d1d5db'
    });
  }

  // 3. 获取用户在各章节的掌握度
  if (userId) {
    const chapterMastery = db.prepare(`
      SELECT 
        q.chapter_id,
        COUNT(DISTINCT sr.question_id) as studied,
        SUM(CASE WHEN sr.is_correct = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as accuracy
      FROM study_records sr
      JOIN questions q ON sr.question_id = q.id
      WHERE sr.user_id = ?
      GROUP BY q.chapter_id
    `).all(userId);

    for (const m of chapterMastery) {
      const node = nodes.find(n => n.id === `chapter_${m.chapter_id}`);
      if (node) {
        node.mastery = {
          studied: m.studied,
          accuracy: m.accuracy ? `${(m.accuracy * 100).toFixed(0)}%` : 'N/A',
          level: m.accuracy >= 0.8 ? 'mastered' : m.accuracy >= 0.5 ? 'learning' : 'weak'
        };
        // 根据掌握度调整颜色
        if (m.accuracy >= 0.8) node.color = '#22c55e';
        else if (m.accuracy >= 0.5) node.color = '#eab308';
        else node.color = '#ef4444';
      }
    }
  }

  // 4. 提取高频考点关键词作为叶子节点
  const keywords = extractKeywords(db);
  for (const kw of keywords) {
    if (kw.count < 2) continue; // 只保留出现2次以上的关键词
    const nodeId = `keyword_${kw.word}`;
    if (!nodeIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        label: kw.word,
        type: 'keyword',
        group: 'keyword',
        size: Math.min(12 + kw.count * 2, 30),
        count: kw.count,
        color: '#06b6d4'
      });
      nodeIds.add(nodeId);

      // 关键词关联到章节
      for (const chId of kw.chapterIds) {
        if (nodeIds.has(`chapter_${chId}`)) {
          edges.push({
            from: `chapter_${chId}`,
            to: nodeId,
            type: 'contains',
            weight: kw.count,
            label: `${kw.count}题`,
            color: '#e5e7eb'
          });
        }
      }
    }
  }

  // 5. 建立跨章节的关联边（共同关键词≥2时建立弱关联）
  const chapterKeywords = new Map();
  for (const kw of keywords) {
    for (const chId of kw.chapterIds) {
      if (!chapterKeywords.has(chId)) chapterKeywords.set(chId, []);
      chapterKeywords.get(chId).push(kw.word);
    }
  }

  const chapterIds = [...chapterKeywords.keys()];
  for (let i = 0; i < chapterIds.length; i++) {
    for (let j = i + 1; j < chapterIds.length; j++) {
      const kws1 = new Set(chapterKeywords.get(chapterIds[i]) || []);
      const kws2 = chapterKeywords.get(chapterIds[j]) || [];
      const shared = kws2.filter(k => kws1.has(k));
      if (shared.length >= 2) {
        edges.push({
          from: `chapter_${chapterIds[i]}`,
          to: `chapter_${chapterIds[j]}`,
          type: 'related',
          weight: shared.length,
          label: `关联: ${shared.slice(0, 3).join(', ')}`,
          color: '#fbbf24',
          dashes: true
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * 从题目内容和解析中提取高频关键词
 * @param {Object} db - 数据库实例
 * @returns {Array<{word: string, count: number, chapterIds: number[]}>}
 */
function extractKeywords(db) {
  // 停用词列表
  const stopWords = new Set([
    '的', '了', '在', '是', '有', '和', '与', '或', '不', '为', '对',
    '可以', '应当', '进行', '属于', '包括', '根据', '以下', '下列',
    '正确', '错误', '说法', '哪些', '什么', '如何', '下列', '哪项',
    '规定', '法律', '条例', '管理', '机关', '部门', '人员', '行为',
    'A', 'B', 'C', 'D', '以上', '以下', '不是', '不属于'
  ]);

  // 从题目内容和解析中提取关键词
  const questions = db.prepare(`
    SELECT id, chapter_id, content, analysis FROM questions
  `).all();

  const wordMap = new Map(); // { word: { count, chapterIds: Set } }

  for (const q of questions) {
    // 简单的中文关键词提取：提取2-6字的词组（通过正则匹配关键术语）
    const text = `${q.content} ${q.analysis || ''}`;

    // 提取括号中的术语（常见考点标记方式）
    const bracketMatches = text.match(/[《「『]([^》」』]{2,10})[》」』]/g) || [];
    for (const match of bracketMatches) {
      const word = match.slice(1, -1).trim();
      if (word.length >= 2 && word.length <= 10 && !stopWords.has(word)) {
        addWord(wordMap, word, q.chapter_id);
      }
    }

    // 提取法律术语风格的关键词（X法、X制度、X原则等）
    const termMatches = text.match(/[\u4e00-\u9fa5]{2,6}(?:法|制度|原则|权|义务|责任|程序|规定|处罚|处分|管理|监督)/g) || [];
    for (const word of termMatches) {
      if (!stopWords.has(word)) {
        addWord(wordMap, word, q.chapter_id);
      }
    }

    // 提取"的"前面的修饰词（核心概念）
    const modifierMatches = text.match(/([\u4e00-\u9fa5]{2,6})的/g) || [];
    for (const match of modifierMatches) {
      const word = match.replace('的', '');
      if (word.length >= 2 && !stopWords.has(word)) {
        addWord(wordMap, word, q.chapter_id);
      }
    }
  }

  // 转为数组，按出现次数排序
  return [...wordMap.entries()]
    .map(([word, data]) => ({
      word,
      count: data.count,
      chapterIds: [...data.chapterIds]
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100); // 最多100个关键词
}

function addWord(wordMap, word, chapterId) {
  if (!wordMap.has(word)) {
    wordMap.set(word, { count: 0, chapterIds: new Set() });
  }
  const entry = wordMap.get(word);
  entry.count++;
  entry.chapterIds.add(chapterId);
}

/**
 * 使用AI提取考点关联关系（可选，消耗token）
 * @param {Object} db - 数据库实例
 * @param {Function} callAI - AI调用函数
 * @param {number} subjectId - 科目ID
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
async function buildWithAI(db, callAI, subjectId) {
  // 获取该科目下的章节和题目统计
  const chapters = db.prepare(`
    SELECT c.id, c.name, COUNT(q.id) as count
    FROM chapters c LEFT JOIN questions q ON q.chapter_id = c.id
    WHERE c.subject_id = ? GROUP BY c.id
  `).all(subjectId);

  const sampleQuestions = db.prepare(`
    SELECT c.name as chapter_name, q.content, q.analysis
    FROM questions q JOIN chapters c ON q.chapter_id = c.id
    WHERE q.subject_id = ?
    ORDER BY RANDOM() LIMIT 10
  `).all(subjectId);

  const prompt = `你是一个教育学专家。请分析以下考试科目的知识点关系。

科目章节：${chapters.map(c => c.name).join('、')}
代表题目：
${sampleQuestions.map((q, i) => `${i + 1}. [${q.chapter_name}] ${q.content}`).join('\n')}

请输出JSON格式的知识图谱：
{
  "concepts": [
    { "name": "概念名", "category": "所属章节", "importance": "high/medium/low" }
  ],
  "relations": [
    { "from": "概念A", "to": "概念B", "type": "prerequisite/related/part_of", "description": "关系说明" }
  ]
}

只输出JSON，不要其他内容。`;

  try {
    const response = await callAI([
      { role: 'system', content: '你是教育知识图谱专家，只输出有效JSON。' },
      { role: 'user', content: prompt }
    ]);

    const json = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    return transformAIGraph(json, chapters);
  } catch (err) {
    console.log('[KnowledgeGraph] AI构建失败，降级为统计模式:', err.message);
    return null;
  }
}

/**
 * 将AI输出的图谱转换为前端格式
 */
function transformAIGraph(aiGraph, chapters) {
  const nodes = [];
  const edges = [];

  // 章节节点
  for (const ch of chapters) {
    nodes.push({ id: `ch_${ch.id}`, label: ch.name, type: 'chapter', group: 'chapter', size: 30 });
  }

  // 概念节点
  const importanceMap = { high: { size: 25, color: '#ef4444' }, medium: { size: 18, color: '#eab308' }, low: { size: 12, color: '#22c55e' } };
  if (aiGraph.concepts) {
    for (const concept of aiGraph.concepts) {
      const style = importanceMap[concept.importance] || importanceMap.medium;
      nodes.push({
        id: `concept_${concept.name}`,
        label: concept.name,
        type: 'concept',
        group: 'concept',
        size: style.size,
        color: style.color
      });

      // 关联到章节
      const ch = chapters.find(c => c.name === concept.category);
      if (ch) {
        edges.push({
          from: `ch_${ch.id}`,
          to: `concept_${concept.name}`,
          type: 'contains'
        });
      }
    }
  }

  // 概念间关系
  if (aiGraph.relations) {
    for (const rel of aiGraph.relations) {
      if (nodes.find(n => n.id === `concept_${rel.from}`) && nodes.find(n => n.id === `concept_${rel.to}`)) {
        edges.push({
          from: `concept_${rel.from}`,
          to: `concept_${rel.to}`,
          type: rel.type,
          label: rel.description || rel.type
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * 获取图谱统计信息
 * @param {Object} graph - 图谱数据
 * @returns {Object}
 */
function getStats(graph) {
  const subjectCount = graph.nodes.filter(n => n.type === 'subject').length;
  const chapterCount = graph.nodes.filter(n => n.type === 'chapter').length;
  const keywordCount = graph.nodes.filter(n => n.type === 'keyword').length;
  const conceptCount = graph.nodes.filter(n => n.type === 'concept').length;

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    subjects: subjectCount,
    chapters: chapterCount,
    keywords: keywordCount,
    concepts: conceptCount,
    relationTypes: {
      hierarchy: graph.edges.filter(e => e.type === 'hierarchy').length,
      contains: graph.edges.filter(e => e.type === 'contains').length,
      related: graph.edges.filter(e => e.type === 'related').length
    }
  };
}

module.exports = { buildFromDatabase, buildWithAI, getStats };
