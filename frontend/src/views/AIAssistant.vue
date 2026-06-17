<template>
  <div class="max-w-2xl mx-auto px-4 py-6">
    <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
      <font-awesome-icon icon="lightbulb" class="text-yellow-500" />
      AI 学习助手
    </h1>

    <!-- 快捷功能 -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <button @click="runDiagnose" :disabled="aiLoading"
        class="card border border-orange-200 bg-orange-50 text-left p-3 hover:shadow-md transition-shadow disabled:opacity-50">
        <font-awesome-icon icon="chart-pie" class="text-orange-500 mb-1" />
        <p class="text-sm font-medium text-gray-700">错题诊断</p>
        <p class="text-xs text-gray-400">分析薄弱环节，给出复习建议</p>
      </button>
      <button @click="addMessage('这道考试科目包含哪些重要考点？可以给我梳理一下吗？')" :disabled="aiLoading"
        class="card border border-blue-200 bg-blue-50 text-left p-3 hover:shadow-md transition-shadow disabled:opacity-50">
        <font-awesome-icon icon="tags" class="text-blue-500 mb-1" />
        <p class="text-sm font-medium text-gray-700">考点梳理</p>
        <p class="text-xs text-gray-400">快速了解考试重点知识</p>
      </button>
    </div>

    <!-- 对话区域 -->
    <div class="card mb-4" style="min-height: 400px; max-height: 60vh; overflow-y: auto;" ref="chatContainer">
      <div v-if="messages.length === 0" class="text-center py-12 text-gray-400">
        <font-awesome-icon icon="lightbulb" class="text-4xl mb-3 text-yellow-300" />
        <p class="text-sm">我是你的AI学习助手</p>
        <p class="text-xs mt-1">可以帮你分析题目、诊断错题、解答知识点</p>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="mb-4">
        <!-- 用户消息 -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div class="bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-sm">
            {{ msg.content }}
          </div>
        </div>
        <!-- AI消息 -->
        <div v-else class="flex gap-2">
          <div class="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0 mt-1">
            <font-awesome-icon icon="lightbulb" class="text-yellow-500 text-xs" />
          </div>
          <div class="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
            <div class="text-sm text-gray-800 whitespace-pre-wrap" v-html="formatContent(msg.content)"></div>
          </div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="aiLoading" class="flex gap-2 mb-4">
        <div class="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
          <font-awesome-icon icon="lightbulb" class="text-yellow-500 text-xs" />
        </div>
        <div class="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5">
          <div class="flex gap-1.5">
            <span class="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style="animation-delay: 0s"></span>
            <span class="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style="animation-delay: 0.15s"></span>
            <span class="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="flex gap-2">
      <input
        v-model="inputText"
        @keyup.enter="sendMessage"
        :disabled="aiLoading"
        placeholder="输入你的问题..."
        class="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
      />
      <button @click="sendMessage" :disabled="aiLoading || !inputText.trim()"
        class="btn-primary px-5 py-2.5 text-sm rounded-xl disabled:opacity-50 flex items-center gap-1">
        <font-awesome-icon icon="paper-plane" class="text-xs" />
        发送
      </button>
    </div>
    <p class="text-xs text-gray-300 text-center mt-2">AI回答仅供参考，请以教材为准</p>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import API from '../api'

const messages = ref([])
const inputText = ref('')
const aiLoading = ref(false)
const chatContainer = ref(null)

// 从 localStorage 恢复对话历史
onMounted(() => {
  try {
    const saved = localStorage.getItem('quiz_ai_history')
    if (saved) messages.value = JSON.parse(saved)
  } catch {}
})

function saveHistory() {
  try {
    // 只保留最近20轮
    const toSave = messages.value.slice(-20)
    localStorage.setItem('quiz_ai_history', JSON.stringify(toSave))
  } catch {}
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

function addMessage(text) {
  inputText.value = text
  sendMessage()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || aiLoading.value) return

  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  saveHistory()
  scrollToBottom()

  aiLoading.value = true
  try {
    const history = messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    const res = await API.aiChat(text, history)
    messages.value.push({ role: 'assistant', content: res.content })
    saveHistory()
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '抱歉，AI服务暂时不可用：' + (e.response?.data?.message || e.message) })
  } finally {
    aiLoading.value = false
    scrollToBottom()
  }
}

async function runDiagnose() {
  if (aiLoading.value) return
  aiLoading.value = true
  try {
    const res = await API.aiDiagnose()
    messages.value.push({ role: 'assistant', content: res.content })
    saveHistory()
    scrollToBottom()
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '诊断失败：' + (e.response?.data?.message || e.message) })
  } finally {
    aiLoading.value = false
    scrollToBottom()
  }
}

function formatContent(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-900">$1</strong>')
    .replace(/\n/g, '<br>')
}
</script>
