// SQLite 数据库配置 - 使用 sql.js (纯JS实现，无需编译)
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'quiz.db');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db = null;
let _ready = false;

// 格式化绑定参数
function formatParams(params) {
  return params.map(p => {
    if (p === null || p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number') return p;
    return String(p);
  });
}

function createWrapper(db) {
  return {
    raw: db,
    
    // 执行SQL，无返回值
    exec(sql) {
      db.run(sql);
    },

    // 准备语句
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        get(...params) {
          try {
            stmt.reset();
            stmt.bind(formatParams(params));
            if (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((col, i) => {
                row[col] = vals[i] !== null ? vals[i] : null;
              });
              return row;
            }
            return undefined;
          } catch (e) {
            throw e;
          }
        },
        all(...params) {
          try {
            stmt.reset();
            stmt.bind(formatParams(params));
            const rows = [];
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((col, i) => {
                row[col] = vals[i] !== null ? vals[i] : null;
              });
              rows.push(row);
            }
            return rows;
          } catch (e) {
            throw e;
          }
        },
        run(...params) {
          try {
            stmt.reset();
            stmt.bind(formatParams(params));
            stmt.step();
            const lastId = db.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0] || 0;
            const changes = db.getRowsModified();
            return { lastInsertRowid: lastId, changes };
          } catch (e) {
            throw e;
          }
        },
        free() {
          try { stmt.free(); } catch (_) {}
        }
      };
    },

    // 事务
    transaction(fn) {
      return (...args) => {
        db.run('BEGIN');
        try {
          fn(...args);
          db.run('COMMIT');
        } catch (e) {
          db.run('ROLLBACK');
          throw e;
        }
      };
    },

    // pragma
    pragma(sql) {
      db.run(sql);
    },

    // 关闭数据库
    close() {
      _save();
      db.close();
      _ready = false;
    }
  };
}

function _save() {
  if (!_db) return;
  try {
    const data = _db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (e) {
    console.error('数据库保存失败:', e.message);
  }
}

// 加载或创建数据库
async function loadDatabase() {
  try {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(fileBuffer);
    } else {
      _db = new SQL.Database();
    }
    
    _db.run('PRAGMA journal_mode=WAL');
    _db.run('PRAGMA foreign_keys=ON');
    
    _ready = true;
    console.log('数据库加载成功:', DB_PATH);
    
    // 定期保存数据库
    setInterval(_save, 30000); // 每30秒保存一次
    
    // 进程退出时保存
    process.on('exit', _save);
    process.on('SIGINT', () => { _save(); process.exit(); });
    process.on('SIGTERM', () => { _save(); process.exit(); });
    
    return createWrapper(_db);
  } catch (e) {
    console.error('数据库加载失败:', e.message);
    throw e;
  }
}

// 同步保存
function saveNow() {
  _save();
}

module.exports = { loadDatabase, saveNow };
