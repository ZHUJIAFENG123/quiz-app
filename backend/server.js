﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadDatabase, saveNow } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const aiLogger = require('./ai/middleware/ai-logger');
const observability = require('./ai/observability');
const vectorStore = require('./ai/rag/vector-store');
const indexer = require('./ai/rag/indexer');
const { initEvaluation } = require('./ai/evaluation/metrics');
const { rateLimitMiddleware } = require('./ai/governance/rate-limiter');

async function startServer() {
  // 加载数据库
  const db = await loadDatabase();
  
  // 将 db 实例暴露到全局，供路由使用
  global.db = db;
  
  // 初始化数据库表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

  // 迁移：为旧表添加 user_id 列
  const addColumn = (table) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER DEFAULT 0`); } catch {}
  };
  addColumn('study_records');
  addColumn('wrong_questions');
  addColumn('favorites');
  // 补充索引（在确保列存在后创建）
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_study_records_user ON study_records(user_id)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_wrong_questions_user ON wrong_questions(user_id)'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)'); } catch {}

  // AI 缓存表（避免重复调用API）
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      type TEXT NOT NULL DEFAULT 'analyze',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, type)
    );
  `);

  // 初始化 AI 链路追踪模块
  aiLogger.init(db);
  console.log('[AI] 链路追踪模块已启动');

  // 初始化评估模块（ai_feedback 表）
  initEvaluation(db);
  console.log('[AI] 评估模块已初始化');

  // 初始化向量存储
  vectorStore.initVectorStore(db);
  console.log('[AI] 向量存储已初始化');

  // 加载 Agent 工具
  const toolRegistry = require('./ai/agent/tool-registry');
  toolRegistry.loadBuiltinTools({ db });
  console.log('[AI] Agent 工具已加载');

  saveNow();
  console.log('数据库表结构初始化完成');

  // ======== 自动导入题库 ========
  try {
    const { parseQuestionsFromExcel } = require("./utils/excel");
    const excelFiles = [
      { name: "01.专业基础知识2026年_已解析.xlsx", label: "专业基础", subjectName: "专业知识" },
      { name: "02.公共基础知识2026年_已解析.xlsx", label: "公共基础", subjectName: "公共知识" },
      { name: "03.辅警管理办法2026年_已解析.xlsx", label: "辅警管理", subjectName: "辅警管理" }
    ];

    const totalQuestions = db.prepare("SELECT COUNT(*) as count FROM questions").get();
    const forceReset = process.env.RESET_DB === "true";
    // 检查是否选项数据缺失
    const emptyOpts = totalQuestions.count > 0 
      ? db.prepare("SELECT COUNT(*) as count FROM questions WHERE type IN ('单选','多选') AND (option_a IS NULL OR option_a = '')").get()
      : { count: 0 };

    if (totalQuestions.count === 0 || forceReset || emptyOpts.count > 0) {
      if (totalQuestions.count > 0) {
        const reason = forceReset ? 'RESET_DB=true' : '选项数据缺失';
        console.log("[导入] " + reason + "，清空旧数据重新导入...");
        db.exec("DELETE FROM study_records; DELETE FROM wrong_questions; DELETE FROM favorites; DELETE FROM questions; DELETE FROM chapters; DELETE FROM subjects;");
        saveNow();
      }
      console.log("[导入] 开始导入题库...");

      for (const file of excelFiles) {
        const filePath = path.join(__dirname, "..", file.name);
        const fs = require("fs");
        if (!fs.existsSync(filePath)) {
          console.log("[导入] ❌ 文件不存在: " + filePath);
          continue;
        }

        console.log("[导入] 正在解析 " + file.label + " ...");
        const { questions, errors } = parseQuestionsFromExcel(filePath);
        // 用文件名覆盖科目名，确保大题分类正确
        for (const q of questions) {
          q.subjectName = file.label;
          if (!q.chapterName) q.chapterName = file.label;
        }
        console.log(`  导入 ${file.label}: ${questions.length} 题, ${errors.length} 个错误`);

        if (questions.length === 0) {
          console.log("[导入] ⚠️ " + file.label + " 解析为空！");
          if (errors.length > 0) console.log("[导入] 错误详情: " + errors.slice(0,3).join("; "));
          continue;
        }

        let imported = 0;
        const insertQ = db.prepare(
          "INSERT INTO questions (subject_id, chapter_id, type, content, option_a, option_b, option_c, option_d, answer, analysis, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );

        for (const q of questions) {
          try {
            let subject = db.prepare("SELECT id FROM subjects WHERE name = ?").get(q.subjectName);
            if (!subject) {
              const r = db.prepare("INSERT INTO subjects (name) VALUES (?)").run(q.subjectName);
              subject = { id: r.lastInsertRowid };
            }
            const chapterName = q.chapterName || q.subjectName || "默认章节";
            let chapter = db.prepare("SELECT id FROM chapters WHERE name = ? AND subject_id = ?").get(chapterName, subject.id);
            if (!chapter) {
              const r = db.prepare("INSERT INTO chapters (subject_id, name) VALUES (?, ?)").run(subject.id, chapterName);
              chapter = { id: r.lastInsertRowid };
            }
            insertQ.run(subject.id, chapter.id, q.type, q.content,
              q.optionA, q.optionB, q.optionC, q.optionD, q.answer, q.analysis || "", 1);
            imported++;
          } catch (e) {
            if (imported < 3) console.log("[导入] 失败: " + String(e).substring(0, 80));
          }
        }
        console.log("[导入] ✅ " + file.label + ": " + imported + " 题");
      }

      const newCount = db.prepare("SELECT COUNT(*) as count FROM questions").get();
      const newSubjectCount = db.prepare("SELECT COUNT(*) as count FROM subjects").get();
      console.log(`[\u5bfc\u5165] \u2705 \u5b8c\u6210\uff01` + newSubjectCount.count + ` \u79d1\u76ee, ` + newCount.count + ` \u9898`);
      saveNow();
    
      // 导入完成后调度 embedding 索引
      indexer.scheduleIndexing(db, 8000);
    } else {
      console.log("[\u5bfc\u5165] \u6570\u636e\u5e93\u5df2\u6709 " + totalQuestions.count + " \u9898\uff0c\u8df3\u8fc7");
      // 即使跳过导入，也要检查索引是否完整
      indexer.scheduleIndexing(db, 8000);
    }
  } catch (err) {
    console.error("[导入] ❗ 导入失败: " + err.message);
    console.error(err.stack);
  }

  // 尝试从 GitHub 恢复学习数据
  try {
    const { loadFromGitHub, importData } = require('./utils/sync');
    const cloudData = await loadFromGitHub();
    if (cloudData) {
      const result = importData(db, cloudData);
      console.log(`[同步] 已恢复学习数据: ${result.studyRecords}条记录, ${result.wrongQuestions}道错题, ${result.favorites}个收藏`);
      saveNow();
    }
  } catch (e) {
    console.log('[同步] 数据恢复跳过:', e.message);
  }

  const app = express();
  const PORT = process.env.PORT || 8080;

  // 中间件
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.CORS_ORIGIN || 'http://localhost:3000']
    : ['http://localhost:5173', 'http://localhost:8080'];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // 公网部署时可改为拒绝
      }
    },
    credentials: true
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // JWT 认证中间件（自动解析 token 到 req.userId）
  const { authMiddleware } = require('./middleware/auth');
  app.use('/api', authMiddleware);

  // 生产环境下提供前端构建产物
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
  }

  // ============ API 路由 ============
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/subjects', require('./routes/subjects'));
  app.use('/api/chapters', require('./routes/chapters'));
  app.use('/api/questions', require('./routes/questions'));
  app.use('/api/practice', require('./routes/practice'));
  app.use('/api/exam', require('./routes/exam'));
  app.use('/api/study', require('./routes/study'));
  app.use('/api/favorites', require('./routes/favorites'));
  app.use('/api/wrong', require('./routes/wrong'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/ai', require('./routes/ai'));

  // ============ AI 可观测性接口 ============
  app.get('/api/ai-observability/dashboard', (req, res) => {
    const dashboard = observability.getDashboard(db);
    res.json({ success: true, data: dashboard });
  });

  app.get('/api/ai-observability/templates', (req, res) => {
    const templateStats = observability.getTemplateComparison(db, req.query.period || '7d');
    const templateList = require('./ai/prompts').listTemplates();
    res.json({ success: true, data: { stats: templateStats, templates: templateList } });
  });

  app.get('/api/ai-observability/traces', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const traces = aiLogger.getRecentTraces(limit);
    res.json({ success: true, data: traces });
  });
  app.use('/api/database', require('./routes/database'));
  app.use('/api/cases', require('./routes/cases').router);

  // ============ 数据同步路由 ============
  const { exportData, importData, saveToGitHub } = require('./utils/sync');

  app.post('/api/sync', async (req, res) => {
    try {
      const data = exportData(db);
      await saveToGitHub(data);
      res.json({ success: true, message: '同步成功', count: data.count });
    } catch (e) {
      res.json({ success: false, message: e.message });
    }
  });

  app.get('/api/sync/status', (req, res) => {
    try {
      const data = exportData(db);
      res.json({ success: true, data: { count: data.count, updatedAt: data.updatedAt } });
    } catch (e) {
      res.json({ success: false, message: e.message });
    }
  });


  // 诊断接口：查看数据库状态
  app.get("/api/health", (req, res) => {
    try {
      const subjects = db.prepare("SELECT COUNT(*) as count FROM subjects").get();
      const questions = db.prepare("SELECT COUNT(*) as count FROM questions").get();
      const chapters = db.prepare("SELECT COUNT(*) as count FROM chapters").get();
      res.json({
        success: true,
        data: {
          subjects: subjects.count,
          questions: questions.count,
          chapters: chapters.count,
          uptime: process.uptime()
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // SPA 回退
  if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    });
  }

  // 错误处理
  app.use(notFoundHandler);
  app.use(errorHandler);

  // 优雅关闭
  const server = app.listen(PORT, () => {
    console.log(`后端服务已启动: http://localhost:${PORT}`);
    console.log(`数据库路径: ${path.join(__dirname, 'data', 'quiz.db')}`);
  });

  process.on('SIGTERM', () => {
    console.log('[Server] 收到 SIGTERM，正在关闭...');
    aiLogger.shutdown();
    server.close();
  });

  return app;
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});
