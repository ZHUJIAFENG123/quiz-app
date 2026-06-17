<template>
  <div class="ai-page">
    <section class="ai-shell">
      <header class="ai-header">
        <div>
          <p class="ai-kicker">AI Study Coach</p>
          <h1>AI 学习助手</h1>
          <p class="ai-subtitle">围绕刷题、错题和考点复盘，帮你把问题拆成能执行的下一步。</p>
        </div>
        <div class="ai-status" :class="{ 'is-busy': aiLoading }">
          <span></span>
          {{ aiLoading ? '思考中' : '已就绪' }}
        </div>
      </header>

      <div class="ai-layout">
        <aside class="ai-panel">
          <div class="panel-block">
            <p class="panel-title">快捷任务</p>
            <button
              v-for="action in quickActions"
              :key="action.title"
              type="button"
              class="quick-action"
              :disabled="aiLoading"
              @click="action.handler"
            >
              <font-awesome-icon :icon="action.icon" />
              <span>
                <strong>{{ action.title }}</strong>
                <small>{{ action.desc }}</small>
              </span>
            </button>
          </div>

          <div class="panel-block">
            <p class="panel-title">回答模式</p>
            <div class="mode-list">
              <button
                v-for="mode in modes"
                :key="mode.key"
                type="button"
                :class="['mode-btn', { active: activeMode === mode.key }]"
                @click="activeMode = mode.key"
              >
                {{ mode.label }}
              </button>
            </div>
          </div>

          <div class="panel-block">
            <p class="panel-title">学习提醒</p>
            <div class="coach-note">
              <font-awesome-icon icon="circle-info" />
              <p>问得越具体，答案越有用。可以带上题干、选项、你的犹豫点，AI 会优先解释“为什么错”。</p>
            </div>
          </div>
        </aside>

        <main class="chat-card">
          <div class="chat-toolbar">
            <div>
              <p class="toolbar-title">学习对话</p>
              <p class="toolbar-subtitle">已保留最近 {{ savedLimit }} 条消息</p>
            </div>
            <div class="toolbar-actions">
              <button type="button" class="icon-btn" title="重新生成上一条回答" :disabled="!canRetry || aiLoading" @click="retryLast">
                <font-awesome-icon icon="rotate-left" />
              </button>
              <button type="button" class="icon-btn" title="清空对话" :disabled="messages.length === 0 || aiLoading" @click="clearHistory">
                <font-awesome-icon icon="broom" />
              </button>
            </div>
          </div>

          <div ref="chatContainer" class="chat-scroll">
            <div v-if="messages.length === 0" class="empty-state">
              <img src="/mascot.png" alt="AI assistant" />
              <h2>今天想突破哪一类题？</h2>
              <p>可以直接提问，也可以点左侧快捷任务开始。适合问：题目解析、易错点、考点框架、复习计划。</p>
              <div class="starter-grid">
                <button v-for="starter in starters" :key="starter" type="button" :disabled="aiLoading" @click="sendPreset(starter)">
                  {{ starter }}
                </button>
              </div>
            </div>

            <div v-for="(msg, i) in messages" :key="`${msg.role}-${i}`" :class="['message-row', msg.role]">
              <div v-if="msg.role === 'assistant'" class="avatar">
                <font-awesome-icon icon="lightbulb" />
              </div>
              <div class="message-bubble">
                <div class="message-meta">{{ msg.role === 'user' ? '你' : 'AI 学习助手' }}</div>
                <div class="message-content" v-html="formatContent(msg.content)"></div>
              </div>
            </div>

            <div v-if="aiLoading" class="message-row assistant">
              <div class="avatar">
                <font-awesome-icon icon="lightbulb" />
              </div>
              <div class="message-bubble loading-bubble">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>

          <form class="composer" @submit.prevent="sendMessage">
            <textarea
              ref="inputBox"
              v-model="inputText"
              :disabled="aiLoading"
              rows="1"
              placeholder="输入你的问题，Shift + Enter 换行"
              @input="resizeInput"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
            <button type="submit" class="send-btn" :disabled="aiLoading || !inputText.trim()" title="发送">
              <font-awesome-icon icon="paper-plane" />
            </button>
          </form>
          <p class="disclaimer">AI 回答仅供学习参考，请以教材、题库解析和考试大纲为准。</p>
        </main>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import API from '../api'

const savedLimit = 30
const messages = ref([])
const inputText = ref('')
const aiLoading = ref(false)
const activeMode = ref('coach')
const lastUserMessage = ref('')
const chatContainer = ref(null)
const inputBox = ref(null)

const modes = [
  { key: 'coach', label: '教练式' },
  { key: 'exam', label: '应试提分' },
  { key: 'simple', label: '简明解释' }
]

const starters = [
  '帮我梳理公共基础知识的高频考点',
  '我总在多选题丢分，应该怎么练？',
  '给我制定一个 7 天错题复盘计划',
  '怎样判断一道题真正考的知识点？'
]

const quickActions = computed(() => [
  {
    title: '错题诊断',
    desc: '根据最近错题找薄弱点',
    icon: 'chart-pie',
    handler: runDiagnose
  },
  {
    title: '考点梳理',
    desc: '生成科目知识框架',
    icon: 'tags',
    handler: () => sendPreset('请按“核心考点 - 常见陷阱 - 记忆方法”的结构，帮我梳理当前题库的重要考点。')
  },
  {
    title: '复习计划',
    desc: '给出可执行安排',
    icon: 'calendar-day',
    handler: () => sendPreset('请根据刷题备考场景，给我制定一个 7 天复习计划，每天包含刷题、复盘和巩固任务。')
  },
  {
    title: '答题技巧',
    desc: '总结选择题策略',
    icon: 'list-check',
    handler: () => sendPreset('请总结单选、多选、判断题的答题技巧，并说明遇到拿不准的题该怎么排除。')
  }
])

const canRetry = computed(() => Boolean(lastUserMessage.value) && messages.value.length > 0)

onMounted(() => {
  try {
    const saved = localStorage.getItem('quiz_ai_history')
    if (saved) messages.value = JSON.parse(saved).filter(isValidMessage).slice(-savedLimit)
    const last = localStorage.getItem('quiz_ai_last_user_message')
    if (last) lastUserMessage.value = last
  } catch {}
  scrollToBottom()
})

function isValidMessage(message) {
  return message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'
}

function saveHistory() {
  try {
    const toSave = messages.value.filter(isValidMessage).slice(-savedLimit)
    localStorage.setItem('quiz_ai_history', JSON.stringify(toSave))
    if (lastUserMessage.value) localStorage.setItem('quiz_ai_last_user_message', lastUserMessage.value)
  } catch {}
}

function resizeInput() {
  nextTick(() => {
    if (!inputBox.value) return
    inputBox.value.style.height = 'auto'
    inputBox.value.style.height = `${Math.min(inputBox.value.scrollHeight, 132)}px`
  })
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  })
}

function buildModePrompt(text) {
  const modeMap = {
    coach: '请用学习教练的方式回答，先判断问题类型，再给出关键解释和下一步练习建议。',
    exam: '请用应试提分的方式回答，突出高频考点、易错陷阱、排除法和记忆口诀。',
    simple: '请用简明解释的方式回答，语言通俗，控制篇幅，直接讲清结论。'
  }
  return `${modeMap[activeMode.value]}\n\n我的问题：${text}`
}

function sendPreset(text) {
  inputText.value = text
  sendMessage()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || aiLoading.value) return

  lastUserMessage.value = text
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  resizeInput()
  saveHistory()
  scrollToBottom()

  aiLoading.value = true
  try {
    const history = messages.value
      .slice(-12, -1)
      .filter(isValidMessage)
      .map(m => ({ role: m.role, content: m.content }))
    const res = await API.aiChat(buildModePrompt(text), history)
    messages.value.push({ role: 'assistant', content: res.content || '我没有生成有效回答，请换个问法再试一次。' })
  } catch (e) {
    messages.value.push({ role: 'assistant', content: buildErrorMessage(e) })
  } finally {
    aiLoading.value = false
    saveHistory()
    scrollToBottom()
  }
}

async function retryLast() {
  if (!lastUserMessage.value || aiLoading.value) return
  inputText.value = lastUserMessage.value
  await sendMessage()
}

async function runDiagnose() {
  if (aiLoading.value) return
  aiLoading.value = true
  messages.value.push({ role: 'user', content: '请根据我的错题记录做一次学习诊断。' })
  scrollToBottom()
  try {
    const res = await API.aiDiagnose()
    messages.value.push({ role: 'assistant', content: res.content || '暂时没有可诊断的数据，先完成几组练习后再来看看。' })
  } catch (e) {
    messages.value.push({ role: 'assistant', content: buildErrorMessage(e, '错题诊断暂时不可用') })
  } finally {
    aiLoading.value = false
    saveHistory()
    scrollToBottom()
  }
}

function clearHistory() {
  if (!window.confirm('确定清空当前 AI 对话记录吗？')) return
  messages.value = []
  lastUserMessage.value = ''
  localStorage.removeItem('quiz_ai_history')
  localStorage.removeItem('quiz_ai_last_user_message')
}

function buildErrorMessage(error, prefix = 'AI 服务暂时不可用') {
  const message = error.response?.data?.message || error.message || '请稍后再试'
  return `${prefix}：${message}\n\n你可以先把题干、选项和自己的想法发给我，我会在服务恢复后继续帮你拆解。`
}

function formatContent(text = '') {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^###\s?(.+)$/gm, '<strong class="block mt-2">$1</strong>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<span class="ai-list-item">• $1</span>')
    .replace(/\n/g, '<br>')
}
</script>

<style scoped>
.ai-page {
  min-height: calc(100vh - 56px);
  padding: 20px 16px 88px;
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.08), rgba(245, 158, 11, 0.07)),
    #f8fafc;
}

.ai-shell {
  max-width: 1120px;
  margin: 0 auto;
}

.ai-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.ai-kicker {
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ai-header h1 {
  margin-top: 4px;
  color: #111827;
  font-size: 28px;
  font-weight: 800;
}

.ai-subtitle {
  margin-top: 6px;
  max-width: 620px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.7;
}

.ai-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  border: 1px solid #d1fae5;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
}

.ai-status span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #10b981;
}

.ai-status.is-busy {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}

.ai-status.is-busy span {
  background: #f59e0b;
}

.ai-layout {
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.ai-panel,
.chat-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.ai-panel {
  padding: 14px;
}

.panel-block + .panel-block {
  margin-top: 18px;
}

.panel-title,
.toolbar-title {
  color: #111827;
  font-size: 14px;
  font-weight: 800;
}

.quick-action {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
  color: #334155;
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.quick-action:hover:not(:disabled) {
  border-color: #14b8a6;
  background: #f0fdfa;
  transform: translateY(-1px);
}

.quick-action:disabled,
.mode-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.quick-action svg {
  margin-top: 2px;
  color: #0f766e;
}

.quick-action strong,
.quick-action small {
  display: block;
}

.quick-action strong {
  font-size: 13px;
}

.quick-action small {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}

.mode-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 10px;
}

.mode-btn {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: #64748b;
  padding: 9px 6px;
  font-size: 12px;
  font-weight: 700;
}

.mode-btn.active {
  border-color: #0f766e;
  background: #ccfbf1;
  color: #0f766e;
}

.coach-note {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.coach-note svg {
  margin-top: 2px;
  color: #f59e0b;
}

.chat-card {
  display: flex;
  min-height: 660px;
  overflow: hidden;
  flex-direction: column;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding: 14px 16px;
}

.toolbar-subtitle {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.icon-btn,
.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  transition: transform 0.18s ease, background 0.18s ease, opacity 0.18s ease;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
}

.icon-btn:hover:not(:disabled) {
  background: #e2e8f0;
}

.icon-btn:disabled,
.send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}

.empty-state {
  max-width: 560px;
  margin: 42px auto;
  text-align: center;
}

.empty-state img {
  width: 76px;
  height: 76px;
  object-fit: contain;
  margin: 0 auto 14px;
}

.empty-state h2 {
  color: #111827;
  font-size: 20px;
  font-weight: 800;
}

.empty-state p {
  margin: 8px auto 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.starter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.starter-grid button {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  min-height: 48px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.45;
  text-align: left;
}

.starter-grid button:hover:not(:disabled) {
  border-color: #14b8a6;
  background: #f0fdfa;
}

.message-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.message-row.user {
  justify-content: flex-end;
}

.avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #fef3c7;
  color: #d97706;
}

.message-bubble {
  max-width: min(78%, 720px);
  border-radius: 8px;
  background: #f8fafc;
  padding: 10px 12px;
}

.message-row.user .message-bubble {
  background: #0f766e;
  color: #ffffff;
}

.message-meta {
  margin-bottom: 4px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.message-row.user .message-meta {
  color: rgba(255, 255, 255, 0.72);
}

.message-content {
  color: #1f2937;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.message-row.user .message-content {
  color: #ffffff;
}

.message-content :deep(strong) {
  color: inherit;
  font-weight: 800;
}

.message-content :deep(.ai-list-item) {
  display: block;
  margin-top: 4px;
}

.loading-bubble {
  display: flex;
  gap: 6px;
  padding: 14px 16px;
}

.loading-bubble span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #f59e0b;
  animation: pulse 1s infinite ease-in-out;
}

.loading-bubble span:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-bubble span:nth-child(3) {
  animation-delay: 0.3s;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  border-top: 1px solid #e5e7eb;
  padding: 14px 16px 8px;
}

.composer textarea {
  flex: 1;
  max-height: 132px;
  resize: none;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px 13px;
  color: #111827;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
}

.composer textarea:focus {
  border-color: #14b8a6;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.14);
}

.send-btn {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 8px;
  background: #0f766e;
  color: #ffffff;
}

.send-btn:hover:not(:disabled) {
  background: #115e59;
  transform: translateY(-1px);
}

.disclaimer {
  padding: 0 16px 12px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

@keyframes pulse {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
  40% { transform: translateY(-4px); opacity: 1; }
}

@media (max-width: 860px) {
  .ai-page {
    padding: 16px 12px 82px;
  }

  .ai-header {
    display: block;
  }

  .ai-status {
    margin-top: 12px;
  }

  .ai-layout {
    grid-template-columns: 1fr;
  }

  .ai-panel {
    order: 2;
  }

  .chat-card {
    min-height: 620px;
  }
}

@media (max-width: 560px) {
  .ai-header h1 {
    font-size: 24px;
  }

  .starter-grid,
  .mode-list {
    grid-template-columns: 1fr;
  }

  .message-bubble {
    max-width: 86%;
  }

  .chat-scroll {
    padding: 14px 12px;
  }
}
</style>
