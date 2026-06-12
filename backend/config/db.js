// 统一数据库实例 - 由 server.js 在初始化时设置 global.db
// 使用方式: const db = require('../config/db');
module.exports = {
  get prepare() { return global.db.prepare.bind(global.db); },
  get exec() { return global.db.exec.bind(global.db); },
  get transaction() { return global.db.transaction.bind(global.db); },
  get pragma() { return global.db.pragma.bind(global.db); },
  get close() { return global.db.close.bind(global.db); },
};
