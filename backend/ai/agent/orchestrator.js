/**
 * Agent 编排器 - ReAct 模式核心循环
 * 
 * 核心职责：
 * 1. 实现 ReAct 循环：Reasoning → Acting → Observing
 * 2. 管理 LLM 对话上下文（含工具调用历史）
 * 3. 支持流式输出 + 工具调用事件的 SSE 推送
 * 4. 安全限制（最大循环次数、超时保护）
 * 
 * 面试展示点：
 * - 完整的 ReAct 模式实现
 * - 与通义千问 function calling 的原生集成
 * - 工具调用过程可视化（前端展示"正在查询..."）
 * - 错误处理和降级策略
 */

const https = require('https');
const toolRegistry = require('./tool-registry');
const aiLogger = require('../middleware/ai-logger');

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_URL = 'dashscope.aliyuncs.com';
const AI_PATH = '/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-turbo';
const MAX_ITERATIONS = 5; // 最大工具调用循环次数

/**
 * 执行 Agent 对话（非流式）
 * @param {string} userMessage - 用户消息
 * @param {Object} context - 上下文
 * @param {Object} context.db - 数据库实例
 * @param {number} context.userId - 用户 ID
 * @param {Array} [context.history] - 对话历史
 * @returns {Promise<{content: string, toolCalls: Array}>}
 */
async function run(userMessage, context = {}) {
  const { db, userId = 0, history = [] } = context;
  
  const tools = toolRegistry.getToolDefinitions();
  const agentTemplate = require('../prompts').getTemplate('agent_system');
  const systemPrompt = agentTemplate?.system || '你是一个AI助手，可以调用工具获取数据来回答用户问题。';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.filter(h => h && ['user', 'assistant'].includes(h.role)).slice(-10),
    { role: 'user', content: userMessage }
  ];

  const toolCallLog = [];
  let iterations = 0;

  // 启动追踪
  const traceCtx = aiLogger.startTrace({
    userId,
    templateId: 'agent_system',
    templateVersion: agentTemplate?.version || '1.0.0',
    requestPath: '/api/ai/agent/chat',
    requestType: 'agent'
  });

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // 调用 LLM
    const response = await callLLM(messages, tools);
    
    if (!response) {
      aiLogger.endTrace(traceCtx, { status: 'error', error: 'LLM 调用失败' });
      return { content: '抱歉，AI 服务暂时不可用，请稍后重试。', toolCalls: toolCallLog };
    }

    // 检查是否有工具调用
    const toolCalls = response.choices?.[0]?.message?.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      // 没有工具调用 → 返回最终回答
      const content = response.choices?.[0]?.message?.content || '抱歉，无法生成回答。';
      aiLogger.endTrace(traceCtx, { status: 'success', outputTokens: content.length });
      return { content, toolCalls: toolCallLog };
    }

    // 有工具调用 → 执行工具并继续循环
    messages.push(response.choices[0].message); // 将 assistant 的 tool_calls 消息加入历史

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let toolArgs = {};
      
      try {
        toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch {
        toolArgs = {};
      }

      // 执行工具
      const toolResult = await toolRegistry.executeTool(toolName, toolArgs, { db, userId });
      
      toolCallLog.push({
        name: toolName,
        args: toolArgs,
        result: toolResult,
        timestamp: new Date().toISOString()
      });

      // 将工具结果加入对话历史
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult, null, 2).slice(0, 4000) // 截断过长的结果
      });
    }
  }

  // 超过最大循环次数，强制结束
  const finalResponse = await callLLM(messages, []); // 不再提供工具，强制输出
  const content = finalResponse?.choices?.[0]?.message?.content || '抱歉，处理过程超时，请简化问题重试。';
  aiLogger.endTrace(traceCtx, { status: 'success' });
  return { content, toolCalls: toolCallLog };
}

/**
 * 执行 Agent 对话（流式，通过 SSE 推送工具调用事件）
 * @param {string} userMessage - 用户消息
 * @param {Object} res - Express response 对象
 * @param {Object} context - 上下文
 */
async function runStream(userMessage, res, context = {}) {
  const { db, userId = 0, history = [] } = context;

  const tools = toolRegistry.getToolDefinitions();
  const agentTemplate = require('../prompts').getTemplate('agent_system');
  const systemPrompt = agentTemplate?.system || '你是一个AI助手，可以调用工具获取数据来回答用户问题。';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.filter(h => h && ['user', 'assistant'].includes(h.role)).slice(-10),
    { role: 'user', content: userMessage }
  ];

  let iterations = 0;

  // 启动追踪
  const traceCtx = aiLogger.startTrace({
    userId,
    templateId: 'agent_system',
    templateVersion: agentTemplate?.version || '1.0.0',
    requestPath: '/api/ai/agent/chat/stream',
    requestType: 'agent_stream'
  });

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // 非流式调用 LLM（因为需要解析 tool_calls）
    const response = await callLLM(messages, tools);

    if (!response) {
      sendSSE(res, { type: 'error', content: 'AI 服务暂时不可用' });
      sendSSE(res, { type: 'done' });
      aiLogger.endTrace(traceCtx, { status: 'error' });
      return;
    }

    const toolCalls = response.choices?.[0]?.message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // 最终回答 → 流式输出
      const content = response.choices?.[0]?.message?.content || '';
      
      // 流式推送最终内容（逐字模拟流式效果）
      const words = content.split('');
      for (let i = 0; i < words.length; i += 3) {
        const chunk = words.slice(i, i + 3).join('');
        sendSSE(res, { type: 'content', content: chunk });
      }
      
      sendSSE(res, { type: 'done' });
      aiLogger.endTrace(traceCtx, { status: 'success' });
      res.end();
      return;
    }

    // 工具调用 → 推送事件并执行
    messages.push(response.choices[0].message);

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      let toolArgs = {};
      try { toolArgs = JSON.parse(toolCall.function?.arguments || '{}'); } catch {}

      // 推送"正在调用工具"事件
      sendSSE(res, { type: 'tool_call', tool: toolName, args: toolArgs });

      const toolResult = await toolRegistry.executeTool(toolName, toolArgs, { db, userId });

      // 推送工具结果事件
      sendSSE(res, { type: 'tool_result', tool: toolName, result: summarizeToolResult(toolResult) });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult, null, 2).slice(0, 4000)
      });
    }
  }

  // 超过最大循环
  const finalResponse = await callLLM(messages, []);
  const content = finalResponse?.choices?.[0]?.message?.content || '处理超时，请简化问题。';
  sendSSE(res, { type: 'content', content });
  sendSSE(res, { type: 'done' });
  aiLogger.endTrace(traceCtx, { status: 'success' });
  res.end();
}

/**
 * 调用 LLM（非流式，用于 Agent 循环中解析 tool_calls）
 * @param {Array} messages - 对话历史
 * @param {Array} tools - 工具定义
 * @returns {Promise<Object|null>}
 */
function callLLM(messages, tools = []) {
  return new Promise((resolve) => {
    if (!AI_API_KEY) { resolve(null); return; }

    const body = JSON.stringify({
      model: MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 2000,
      temperature: 0.5,
      stream: false
    });

    const req = https.request({
      hostname: AI_URL, path: AI_PATH, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

/**
 * 发送 SSE 事件
 * @param {Object} res - Express response
 * @param {Object} data - 事件数据
 */
function sendSSE(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {}
}

/**
 * 精简工具结果（避免推送过多数据到前端）
 * @param {Object} result - 工具执行结果
 * @returns {Object} 精简后的结果
 */
function summarizeToolResult(result) {
  if (!result) return { summary: '无数据' };
  
  const str = JSON.stringify(result);
  if (str.length < 500) return result;

  // 精简：只保留关键摘要
  if (result.questions) {
    return { count: result.questions.length, questions: result.questions.slice(0, 3) };
  }
  if (result.stats) {
    return result.stats;
  }
  return { summary: str.slice(0, 300) + '...' };
}

module.exports = { run, runStream };
