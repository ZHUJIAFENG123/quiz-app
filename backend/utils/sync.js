/**
 * GitHub 数据同步工具
 * 将用户账号、学习记录/错题/收藏 通过 GitHub API 保存到仓库中
 * 服务器重启后自动恢复全部数据
 */

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPO || '';
const SYNC_FILE = 'backend/data/user_data.json';
const API_HOST = 'api.github.com';
const RAW_HOST = 'raw.githubusercontent.com';

// ===== 导出数据 =====
function exportData(db) {
  const users = db.prepare('SELECT id, username, nickname, created_at FROM users ORDER BY id').all();
  const studyRecords = db.prepare('SELECT * FROM study_records ORDER BY id').all();
  const wrongQuestions = db.prepare('SELECT * FROM wrong_questions ORDER BY id').all();
  const favorites = db.prepare('SELECT * FROM favorites ORDER BY id').all();

  return {
    users,
    studyRecords,
    wrongQuestions,
    favorites,
    updatedAt: new Date().toISOString(),
    count: {
      users: users.length,
      studyRecords: studyRecords.length,
      wrongQuestions: wrongQuestions.length,
      favorites: favorites.length
    }
  };
}

// ===== 导入数据 =====
function importData(db, data) {
  if (!data) return { imported: 0 };
  
  let imported = 0;

  // 清空现有用户数据（保留题库）
  db.prepare('DELETE FROM study_records').run();
  db.prepare('DELETE FROM wrong_questions').run();
  db.prepare('DELETE FROM favorites').run();
  db.prepare('DELETE FROM users').run();

  // 导入用户（密码不同步，恢复后需重置密码登录）
  if (data.users && data.users.length > 0) {
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, username, nickname, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const u of data.users) {
      try {
        insertUser.run(u.id, u.username, u.nickname || '', u.created_at);
      } catch (e) { /* skip */ }
    }
  }

  // 导入学习记录
  if (data.studyRecords && data.studyRecords.length > 0) {
    const insertStudy = db.prepare(
      'INSERT INTO study_records (id, question_id, user_id, is_correct, user_answer, mode, exam_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const r of data.studyRecords) {
      try {
        insertStudy.run(r.id, r.question_id, r.user_id || 0, r.is_correct ? 1 : 0, r.user_answer || '', r.mode || 'practice', r.exam_session_id || null, r.created_at);
        imported++;
      } catch (e) { /* skip */ }
    }
  }

  // 导入错题
  if (data.wrongQuestions && data.wrongQuestions.length > 0) {
    const insertWrong = db.prepare(
      'INSERT OR IGNORE INTO wrong_questions (id, question_id, user_id, wrong_count, last_wrong_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const r of data.wrongQuestions) {
      try {
        insertWrong.run(r.id, r.question_id, r.user_id || 0, r.wrong_count || 1, r.last_wrong_at, r.created_at);
      } catch (e) { /* skip */ }
    }
  }

  // 导入收藏
  if (data.favorites && data.favorites.length > 0) {
    const insertFav = db.prepare(
      'INSERT OR IGNORE INTO favorites (id, question_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const r of data.favorites) {
      try {
        insertFav.run(r.id, r.question_id, r.user_id || 0, r.created_at);
      } catch (e) { /* skip */ }
    }
  }

  return { 
    imported, 
    users: data.users?.length || 0,
    studyRecords: data.studyRecords?.length || 0, 
    wrongQuestions: data.wrongQuestions?.length || 0, 
    favorites: data.favorites?.length || 0 
  };
}

// ===== HTTP 请求封装 =====
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${json.message || data}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(`GitHub API ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ===== 保存到 GitHub =====
async function saveToGitHub(jsonData) {
  if (!GITHUB_TOKEN) throw new Error('未配置 GITHUB_TOKEN 环境变量');
  if (!REPO) throw new Error('未配置 GITHUB_REPO 环境变量');

  const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64');

  let sha = null;
  try {
    const getOpts = {
      hostname: API_HOST,
      path: `/repos/${REPO}/contents/${SYNC_FILE}`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'quiz-app',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    const result = await httpsRequest(getOpts);
    sha = result.sha;
  } catch (e) { /* 文件不存在 */ }

  const putOpts = {
    hostname: API_HOST,
    path: `/repos/${REPO}/contents/${SYNC_FILE}`,
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'quiz-app',
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  const body = JSON.stringify({
    message: `同步数据 [${new Date().toLocaleString('zh-CN')}]`,
    content: content,
    ...(sha ? { sha } : {})
  });

  return await httpsRequest(putOpts, body);
}

// ===== 从 GitHub 恢复 =====
async function loadFromGitHub() {
  if (!GITHUB_TOKEN || !REPO) {
    console.log('[同步] 未配置 GITHUB_TOKEN 或 GITHUB_REPO，跳过数据恢复');
    return null;
  }

  const options = {
    hostname: RAW_HOST,
    path: `/${REPO}/main/${SYNC_FILE}`,
    method: 'GET',
    headers: { 'User-Agent': 'quiz-app' }
  };

  try {
    const text = await httpsRequest(options);
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    console.log('[同步] 未找到云端数据');
    return null;
  }
}

module.exports = { exportData, importData, saveToGitHub, loadFromGitHub };
