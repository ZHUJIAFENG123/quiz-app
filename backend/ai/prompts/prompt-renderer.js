/**
 * Prompt 模板渲染引擎
 * 
 * 核心职责：
 * 1. 从 JSON 模板文件加载 Prompt 配置
 * 2. 使用 {{variable}} 语法进行变量替换
 * 3. 注入 few-shot 示例到 messages 数组
 * 4. 返回标准 OpenAI / DashScope 格式的 messages
 * 
 * 面试展示点：
 * - 模板与代码分离，便于迭代优化
 * - 支持版本号管理，可追溯历史效果
 * - 支持条件渲染（if/else 块）
 */

const fs = require('fs');
const path = require('path');

/**
 * 将模板字符串中的 {{variable}} 占位符替换为实际值
 * @param {string} template - 含占位符的模板字符串
 * @param {Object} variables - 变量键值对
 * @returns {string} 替换后的字符串
 * 
 * @example
 * renderTemplate('科目：{{subject}}，章节：{{chapter}}', { subject: '专业知识', chapter: '法律基础' })
 * // => '科目：专业知识，章节：法律基础'
 */
function renderTemplate(template, variables = {}) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return match; // 保留未匹配的占位符
    if (Array.isArray(value)) return value.join('\n');
    return String(value);
  });
}

/**
 * 处理模板中的条件块 {{#if variable}}...{{/if}}
 * @param {string} template - 含条件块的模板
 * @param {Object} variables - 变量键值对
 * @returns {string} 处理后的字符串
 */
function renderConditionals(template, variables = {}) {
  // {{#if variable}}content{{/if}} - 当 variable 为真值时保留 content
  return template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, key, content) => {
      return variables[key] ? content : '';
    }
  );
}

/**
 * 将 few-shot 示例转换为 messages 数组
 * @param {Array} examples - few-shot 示例数组，每项包含 {user, assistant}
 * @returns {Array} OpenAI 格式的 messages 数组
 */
function examplesToMessages(examples = []) {
  const messages = [];
  for (const example of examples) {
    if (example.user) {
      messages.push({ role: 'user', content: example.user });
    }
    if (example.assistant) {
      messages.push({ role: 'assistant', content: example.assistant });
    }
  }
  return messages;
}

/**
 * 从 JSON 文件加载并渲染 Prompt 模板，返回完整的 messages 数组
 * 
 * @param {Object} template - 模板对象（从 JSON 文件加载）
 * @param {Object} variables - 变量键值对
 * @param {Object} options - 额外选项
 * @param {string} [options.userMessage] - 用户消息（追加到末尾）
 * @param {boolean} [options.includeExamples=true] - 是否注入 few-shot 示例
 * @returns {{ messages: Array, metadata: Object }} 标准 messages 数组 + 元数据
 */
function renderPrompt(template, variables = {}, options = {}) {
  const { userMessage, includeExamples = true } = options;

  // 1. 渲染 system prompt（变量替换 + 条件块）
  let systemContent = template.system || '';
  systemContent = renderConditionals(systemContent, variables);
  systemContent = renderTemplate(systemContent, variables);

  // 2. 构建 messages 数组
  const messages = [
    { role: 'system', content: systemContent }
  ];

  // 3. 注入 few-shot 示例
  if (includeExamples && template.few_shot_examples?.length > 0) {
    const exampleMessages = examplesToMessages(template.few_shot_examples);
    messages.push(...exampleMessages);
  }

  // 4. 渲染并追加 user message
  if (template.user_template) {
    let userContent = renderConditionals(template.user_template, variables);
    userContent = renderTemplate(userContent, variables);
    messages.push({ role: 'user', content: userContent });
  } else if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  }

  // 5. 如果额外提供了 userMessage 且有 user_template，则追加为第二轮用户消息
  if (userMessage && template.user_template) {
    messages.push({ role: 'user', content: userMessage });
  }

  // 6. 返回 messages + 元数据（用于链路追踪）
  return {
    messages,
    metadata: {
      template_id: template.id,
      template_version: template.version,
      parameters: template.parameters || {},
      variable_keys: Object.keys(variables),
      few_shot_count: includeExamples ? (template.few_shot_examples?.length || 0) : 0
    }
  };
}

/**
 * 估算 messages 的 token 数量（粗略估算）
 * 中文字符约 1.5 token/字，英文约 0.75 token/word
 * @param {Array} messages - messages 数组
 * @returns {number} 估算的 token 数量
 */
function estimateTokens(messages) {
  let totalChars = 0;
  for (const msg of messages) {
    const content = msg.content || '';
    // 中文字符占比
    const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = content.length - chineseChars;
    totalChars += chineseChars * 1.5 + otherChars * 0.4;
  }
  return Math.ceil(totalChars);
}

module.exports = {
  renderTemplate,
  renderConditionals,
  examplesToMessages,
  renderPrompt,
  estimateTokens
};
