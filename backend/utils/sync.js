/**
 * GitHub 数据同步工具
 * 将学习记录/错题/收藏 通过 GitHub API 保存到仓库中
 * 服务器重启后自动恢复数据
 */

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'ZHUJIAFENG123/quiz-app';
const SYNC_FILE = 'backend/data/user_data.json';
const API_HOST = 'api.github.com';
const RAW_HOST = 'raw.githubusercontent.com';

// ===== 导出数据 =====
function exportData(db) {
  const studyRecords = db.prepare('SELECT * FROM study_records ORDER BY id').all();
  const wrongQuestions = db.prepare('SELECT * FROM wrong_questions ORDER BY id').all();
  const favorites = db.prepare('SELECT * FROM favorites ORDER BY id').all();
  
  // 去除非必要字段
  const clean = (arr, skipFields = []) => arr.map(r => {
    const o = {};
    for (const k of Object.keys(r)) {
      if (!skipFields.includes(k)) o[k] = r[k];
    }
    return o;
  });

  return {
    studyRecords: clean(studyRecords),
    wrongQuestions: clean(wrongQuestions),
    favorites: clean(favorites),
    updatedAt: new Date().toISOString(),
    count: {
      studyRecords: studyRecords.length,
      wrongQuestions: wrongQuestions.length,
      favorites: favorites.length
    }
  };
}

// ===== 导入数据 =====
function importData(db, data) {
  if (!data || !data.studyRecords) return { imported: 0 };
  
  let imported = 0;

  // 清空现有数据
  db.prepare('DELETE FROM study_records').run();
  db.prepare('DELETE FROM wrong_questions').run();
  db.prepare('DELETE FROM favorites').run();

  // 导入学习记录
  const insertStudy = db.prepare(
    'INSERT INTO study_records (question_id, is_correct, user_answer, created_at) VALUES (?, ?, ?, ?)'
  );
  for (const r of data.studyRecords) {
    try {
      insertStudy.run(r.question_id, r.is_correct ? 1 : 0, r.user_answer || '', r.created_at);
      imported++;
    } catch (e) { /* skip */ }
  }

  // 导入错题
  const insertWrong = db.prepare(
    'INSERT OR IGNORE INTO wrong_questions (question_id, wrong_count, last_wrong_time) VALUES (?, ?, ?)'
  );
  for (const r of data.wrongQuestions) {
    try {
      insertWrong.run(r.question_id, r.wrong_count, r.last_wrong_time);
    } catch (e) { /* skip */ }
  }

  // 导入收藏
  const insertFav = db.prepare(
    'INSERT OR IGNORE INTO favorites (question_id, created_at) VALUES (?, ?)'
  );
  for (const r of data.favorites) {
    try {
      insertFav.run(r.question_id, r.created_at);
    } catch (e) { /* skip */ }
  }

  return { imported, studyRecords: data.studyRecords.length, wrongQuestions: data.wrongQuestions.length, favorites: data.favorites.length };
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

  const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64');

  // 先获取当前文件的 SHA
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
  } catch (e) {
    // 文件不存在，将创建新文件
  }

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
    message: `同步学习数据 [${new Date().toLocaleString('zh-CN')}]`,
    content: content,
    ...(sha ? { sha } : {})
  });

  return await httpsRequest(putOpts, body);
}

// ===== 从 GitHub 恢复 =====
async function loadFromGitHub() {
  if (!GITHUB_TOKEN) {
    console.log('[同步] 未配置 GITHUB_TOKEN，跳过数据恢复');
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
    console.log('[同步] 未找到云端数据，将使用空数据库');
    return null;
  }
}

module.exports = { exportData, importData, saveToGitHub, loadFromGitHub };
