/**
 * Prompt 注册中心
 * 
 * 核心职责：
 * 1. 启动时自动加载所有 JSON 模板文件
 * 2. 提供按 ID 获取模板的统一接口
 * 3. 支持模板变体（variants）切换
 * 4. 支持 A/B 测试的流量分配（后续扩展）
 * 5. 提供模板列表和版本信息查询
 * 
 * 面试展示点：
 * - 模板与代码分离的架构设计
 * - 支持版本管理和热更新
 * - 可扩展的变体和 A/B 测试机制
 */

const fs = require('fs');
const path = require('path');
const { renderPrompt, renderTemplate, estimateTokens } = require('./prompt-renderer');

// 模板缓存：{ templateId: { template, loadedAt } }
const templateCache = new Map();

// A/B 测试配置（可扩展）
const AB_CONFIG = {};

/**
 * 加载指定目录下的所有 JSON 模板文件
 * @param {string} [dir] - 模板目录，默认为当前目录
 */
function loadTemplates(dir) {
  const templateDir = dir || __dirname;
  const files = fs.readdirSync(templateDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    try {
      const filePath = path.join(templateDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const template = JSON.parse(content);
      
      if (template.id) {
        templateCache.set(template.id, {
          template,
          filePath,
          loadedAt: new Date().toISOString()
        });
        console.log(`[PromptRegistry] 加载模板: ${template.id} v${template.version} (${file})`);
      }
    } catch (err) {
      console.error(`[PromptRegistry] 加载模板失败: ${file}`, err.message);
    }
  }
  
  console.log(`[PromptRegistry] 共加载 ${templateCache.size} 个模板`);
}

/**
 * 获取指定 ID 的模板
 * @param {string} templateId - 模板 ID
 * @returns {Object|null} 模板对象
 */
function getTemplate(templateId) {
  const entry = templateCache.get(templateId);
  if (!entry) {
    console.warn(`[PromptRegistry] 模板未找到: ${templateId}`);
    return null;
  }
  return entry.template;
}

/**
 * 获取模板并应用变体（如教练模式、应试模式等）
 * @param {string} templateId - 模板 ID
 * @param {string} [variantKey] - 变体 key（如 'coach', 'exam_focus'）
 * @returns {Object|null} 应用变体后的模板对象（深拷贝）
 */
function getTemplateWithVariant(templateId, variantKey) {
  const template = getTemplate(templateId);
  if (!template) return null;
  
  // 深拷贝，避免修改原始模板
  const cloned = JSON.parse(JSON.stringify(template));
  
  if (variantKey && cloned.variants?.[variantKey]) {
    const variant = cloned.variants[variantKey];
    // 将变体的 system_append 追加到 system prompt
    if (variant.system_append) {
      cloned.system = (cloned.system || '') + variant.system_append;
    }
    // 合并变体参数
    if (variant.parameters) {
      cloned.parameters = { ...cloned.parameters, ...variant.parameters };
    }
    cloned._active_variant = variantKey;
  }
  
  return cloned;
}

/**
 * 一键渲染模板并返回 messages（最常用的接口）
 * @param {string} templateId - 模板 ID
 * @param {Object} variables - 变量键值对
 * @param {Object} [options] - 额外选项
 * @param {string} [options.variant] - 变体 key
 * @param {string} [options.userMessage] - 用户消息
 * @param {boolean} [options.includeExamples=true] - 是否注入 few-shot
 * @returns {{ messages: Array, metadata: Object, parameters: Object } | null}
 */
function render(templateId, variables = {}, options = {}) {
  const { variant, userMessage, includeExamples = true } = options;
  
  const template = variant 
    ? getTemplateWithVariant(templateId, variant) 
    : getTemplate(templateId);
  
  if (!template) return null;
  
  const result = renderPrompt(template, variables, { userMessage, includeExamples });
  
  return {
    messages: result.messages,
    metadata: result.metadata,
    parameters: template.parameters || {},
    estimatedTokens: estimateTokens(result.messages)
  };
}

/**
 * 获取所有已加载模板的列表（用于管理后台展示）
 * @returns {Array} 模板摘要列表
 */
function listTemplates() {
  const list = [];
  for (const [id, entry] of templateCache) {
    const t = entry.template;
    list.push({
      id: t.id,
      version: t.version,
      description: t.description,
      tags: t.tags || [],
      hasExamples: (t.few_shot_examples?.length || 0) > 0,
      exampleCount: t.few_shot_examples?.length || 0,
      variants: t.variants ? Object.keys(t.variants) : [],
      loadedAt: entry.loadedAt,
      filePath: entry.filePath
    });
  }
  return list;
}

/**
 * 重新加载指定模板（支持热更新）
 * @param {string} templateId - 模板 ID
 * @returns {boolean} 是否成功
 */
function reloadTemplate(templateId) {
  const entry = templateCache.get(templateId);
  if (!entry) return false;
  
  try {
    const content = fs.readFileSync(entry.filePath, 'utf-8');
    const template = JSON.parse(content);
    templateCache.set(templateId, {
      template,
      filePath: entry.filePath,
      loadedAt: new Date().toISOString()
    });
    console.log(`[PromptRegistry] 重新加载模板: ${templateId}`);
    return true;
  } catch (err) {
    console.error(`[PromptRegistry] 重新加载失败: ${templateId}`, err.message);
    return false;
  }
}

/**
 * 获取 A/B 测试的变体选择
 * @param {string} promptId - Prompt ID
 * @returns {string} 选中的模板 ID（可能是变体）
 */
function getABVariant(promptId) {
  const config = AB_CONFIG[promptId];
  if (!config) return promptId;
  
  const rand = Math.random();
  let cumulative = 0;
  for (const v of config.variants) {
    cumulative += v.weight;
    if (rand < cumulative) return v.id;
  }
  return config.variants[0].id;
}

// 模块初始化：自动加载模板
loadTemplates();

module.exports = {
  loadTemplates,
  getTemplate,
  getTemplateWithVariant,
  render,
  listTemplates,
  reloadTemplate,
  getABVariant,
  AB_CONFIG
};
