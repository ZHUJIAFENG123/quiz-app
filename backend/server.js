const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadDatabase, saveNow } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

async function startServer() {
  // 加载数据库
  const db = await loadDatabase();
  
  // 将 db 实例暴露到全局，供路由使用
  global.db = db;
  
  // 初始化数据库表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('单选', '多选', '判断')),
      content TEXT NOT NULL,
      option_a TEXT DEFAULT '',
      option_b TEXT DEFAULT '',
      option_c TEXT DEFAULT '',
      option_d TEXT DEFAULT '',
      answer TEXT NOT NULL,
      analysis TEXT DEFAULT '',
      difficulty INTEGER DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 5),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS study_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'practice',
      exam_session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wrong_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE,
      wrong_count INTEGER DEFAULT 1,
      last_wrong_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
    CREATE INDEX IF NOT EXISTS idx_study_records_question ON study_records(question_id);
    CREATE INDEX IF NOT EXISTS idx_study_records_created ON study_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_wrong_questions_question ON wrong_questions(question_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_question ON favorites(question_id);
  `);
  
  saveNow();
  console.log('数据库表结构初始化完成');

  const app = express();
  const PORT = process.env.PORT || 8080;

  // 中间件
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 生产环境下提供前端构建产物
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
  }

  // ============ API 路由 ============
  app.use('/api/subjects', require('./routes/subjects'));
  app.use('/api/chapters', require('./routes/chapters'));
  app.use('/api/questions', require('./routes/questions'));
  app.use('/api/practice', require('./routes/practice'));
  app.use('/api/exam', require('./routes/exam'));
  app.use('/api/study', require('./routes/study'));
  app.use('/api/favorites', require('./routes/favorites'));
  app.use('/api/wrong', require('./routes/wrong'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/database', require('./routes/database'));

  // SPA 回退
  if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    });
  }

  // 错误处理
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`后端服务已启动: http://localhost:${PORT}`);
    console.log(`数据库路径: ${path.join(__dirname, 'data', 'quiz.db')}`);
  });

  return app;
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
