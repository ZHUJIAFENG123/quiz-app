/**
 * Token 成本追踪器
 */
const PRICING = {
  'qwen-turbo': { input: 0.002, output: 0.006 },
  'text-embedding-v3': { input: 0.0007, output: 0 }
};

// 内存中的成本追踪
const dailyCosts = new Map(); // { 'YYYY-MM-DD': { inputTokens, outputTokens, cost } }

function recordUsage(model, inputTokens, outputTokens) {
  const today = new Date().toISOString().split('T')[0];
  if (!dailyCosts.has(today)) {
    dailyCosts.set(today, { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 });
  }
  const entry = dailyCosts.get(today);
  entry.inputTokens += inputTokens;
  entry.outputTokens += outputTokens;
  entry.calls++;

  const pricing = PRICING[model] || PRICING['qwen-turbo'];
  entry.cost += (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

function getDailyCost(date) {
  const key = date || new Date().toISOString().split('T')[0];
  return dailyCosts.get(key) || { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
}

function getCostSummary(days = 7) {
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const cost = dailyCosts.get(d);
    if (cost) result.push({ date: d, ...cost, cost: cost.cost.toFixed(4) });
  }
  return result;
}

module.exports = { recordUsage, getDailyCost, getCostSummary, PRICING };
