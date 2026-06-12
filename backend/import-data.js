// 独立题库导入脚本 - 支持直接运行
const { parseQuestionsFromExcel } = require('./utils/excel');
const { loadDatabase, saveNow } = require('./config/database');
const path = require('path');

async function main() {
  const db = await loadDatabase();
  
  // 初始化表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL, subject_id INTEGER NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, option_a TEXT DEFAULT '', option_b TEXT DEFAULT '', option_c TEXT DEFAULT '', option_d TEXT DEFAULT '', answer TEXT NOT NULL, analysis TEXT DEFAULT '', difficulty INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS study_records (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL, user_answer TEXT NOT NULL, is_correct INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT 'practice', exam_session_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS wrong_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL UNIQUE, wrong_count INTEGER DEFAULT 1, last_wrong_at DATETIME DEFAULT CURRENT_TIMESTAMP, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  async function importFile(fileName, label) {
    const filePath = path.join(__dirname, '..', fileName);
    console.log('正在导入:', label, '(' + filePath + ')');
    
    const { questions, errors } = parseQuestionsFromExcel(filePath);
    console.log('  解析到', questions.length, '道题目,', errors.length, '个错误');
    
    if (errors.length > 0) {
      console.log('  错误列表:');
      errors.forEach(e => console.log('    -', e));
    }

    if (questions.length === 0) return 0;

    let imported = 0;
    const insertQ = db.prepare(
      'INSERT INTO questions (subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    for (const q of questions) {
      try {
        let subject = db.prepare('SELECT id FROM subjects WHERE name = ?').get(q.subjectName);
        if (!subject) {
          const r = db.prepare('INSERT INTO subjects (name) VALUES (?)').run(q.subjectName);
          subject = { id: r.lastInsertRowid };
        }

        let chapter = db.prepare('SELECT id FROM chapters WHERE name = ? AND subject_id = ?').get(q.chapterName, subject.id);
        if (!chapter) {
          const r = db.prepare('INSERT INTO chapters (subject_id, name) VALUES (?, ?)').run(subject.id, q.chapterName);
          chapter = { id: r.lastInsertRowid };
        }

        insertQ.run(subject.id, chapter.id, q.type, q.content,
          q.optionA, q.optionB, q.optionC, q.optionD, q.answer, q.analysis || '', 1);
        imported++;
      } catch (e) {
        console.log('  导入失败:', String(e));
      }
    }

    console.log('  成功导入:', imported, '道');
    return imported;
  }

  // 导入两个题库
  const count1 = await importFile('专业知识题库_已修复.xlsx', '专业知识题库');
  const count2 = await importFile('公共知识题库_已修复.xlsx', '公共知识题库');

  saveNow();

  // 验证
  const total = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  const subjectStats = db.prepare('SELECT s.name, COUNT(q.id) as cnt FROM subjects s LEFT JOIN questions q ON s.id = q.subject_id GROUP BY s.id').all();
  
  console.log('\n========== 导入完成 ==========');
  console.log('题目总数:', total.count);
  subjectStats.forEach(s => console.log('  ' + s.name + ':', s.cnt, '道'));

  const typeStats = db.prepare('SELECT type, COUNT(*) as cnt FROM questions GROUP BY type').all();
  typeStats.forEach(t => console.log('  ' + t.type + ':', t.cnt, '道'));

  const chapterCount = db.prepare('SELECT COUNT(*) as cnt FROM chapters').get();
  console.log('章节总数:', chapterCount.cnt);

  process.exit(0);
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
