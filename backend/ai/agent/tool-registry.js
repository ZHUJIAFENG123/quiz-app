/**
 * Agent 工具注册中心
 * 
 * 核心职责：
 * 1. 集中管理所有可用工具的定义和实现
 * 2. 提供工具查找和调用的统一接口
 * 3. 生成 OpenAI function calling 格式的工具定义
 * 
 * 面试展示点：
 * - 插件式架构，新增工具只需注册即可
 * - 工具定义与实现分离
 */

// 工具注册表：{ toolName: { definition, handler } }
const toolRegistry = new Map();

/**
 * 注册一个工具
 * @param {Object} definition - OpenAI function calling 格式的工具定义
 * @param {Function} handler - 工具执行函数 async (args, context) => result
 */
function registerTool(definition, handler) {
  const name = definition.function?.name || definition.name;
  if (!name) {
    console.error('[ToolRegistry] 工具必须有 name 字段');
    return;
  }
  toolRegistry.set(name, { definition, handler });
  console.log(`[ToolRegistry] 注册工具: ${name}`);
}

/**
 * 获取所有已注册工具的定义（传给 LLM）
 * @returns {Array} OpenAI tools 格式
 */
function getToolDefinitions() {
  const tools = [];
  for (const [name, { definition }] of toolRegistry) {
    tools.push(definition);
  }
  return tools;
}

/**
 * 执行指定工具
 * @param {string} name - 工具名称
 * @param {Object} args - 工具参数
 * @param {Object} context - 上下文（db, userId 等）
 * @returns {Promise<Object>} 工具执行结果
 */
async function executeTool(name, args, context = {}) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { error: `工具 "${name}" 不存在`, available: [...toolRegistry.keys()] };
  }

  try {
    const result = await tool.handler(args, context);
    return result;
  } catch (err) {
    console.error(`[ToolRegistry] 工具 "${name}" 执行失败:`, err.message);
    return { error: err.message };
  }
}

/**
 * 检查工具是否存在
 * @param {string} name - 工具名称
 * @returns {boolean}
 */
function hasTool(name) {
  return toolRegistry.has(name);
}

/**
 * 获取所有工具名称
 * @returns {string[]}
 */
function getToolNames() {
  return [...toolRegistry.keys()];
}

/**
 * 加载所有内置工具
 * @param {Object} context - 全局上下文（db 等）
 */
function loadBuiltinTools(context) {
  const questionTools = require('./tools/question-tools');
  const statsTools = require('./tools/stats-tools');
  const planTools = require('./tools/plan-tools');
  const searchTools = require('./tools/search-tools');

  // 注册题目相关工具
  for (const tool of questionTools.getTools()) {
    registerTool(tool.definition, tool.handler(context));
  }

  // 注册统计相关工具
  for (const tool of statsTools.getTools()) {
    registerTool(tool.definition, tool.handler(context));
  }

  // 注册计划相关工具
  for (const tool of planTools.getTools()) {
    registerTool(tool.definition, tool.handler(context));
  }

  // 注册搜索相关工具
  for (const tool of searchTools.getTools()) {
    registerTool(tool.definition, tool.handler(context));
  }

  console.log(`[ToolRegistry] 已加载 ${toolRegistry.size} 个内置工具`);
}

module.exports = {
  registerTool,
  getToolDefinitions,
  executeTool,
  hasTool,
  getToolNames,
  loadBuiltinTools
};
