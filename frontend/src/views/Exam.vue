<template>
  <div class="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-6">
    <!-- ==================== 考试设置界面 ==================== -->
    <template v-if="!examStarted">
      <h1 class="text-xl font-bold text-gray-800 mb-4">模拟考试</h1>

      <div class="card space-y-4">
        <!-- 科目选择 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">选择科目</label>
          <select v-model="setup.subject_id" class="input" @change="onSetupSubjectChange">
            <option :value="null">请选择科目</option>
            <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>

        <!-- 章节选择 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">选择章节</label>
          <select v-model="setup.chapter_id" class="input">
            <option :value="null">全部章节</option>
            <option v-for="c in setupChapters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- 题型选择 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">题型选择</label>
          <select v-model="setup.type" class="input">
            <option value="">全部题型</option>
            <option value="单选">单选题</option>
            <option value="多选">多选题</option>
            <option value="判断">判断题</option>
          </select>
        </div>

        <!-- 题目数量 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">题目数量：<span class="text-primary-600 font-bold">{{ setup.count }}</span> 题</label>
          <input v-model.number="setup.count" type="range" min="5" max="200" step="5" class="w-full accent-primary-600" />
          <div class="flex justify-between text-xs text-gray-400">
            <span>5</span>
            <span>200</span>
          </div>
        </div>

        <!-- 考试时长 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">考试时长：<span class="text-primary-600 font-bold">{{ setup.duration }}</span> 分钟</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="d in [15, 30, 45, 60, 90, 120]"
              :key="d"
              @click="setup.duration = d"
              :class="['px-3 py-1.5 rounded-lg text-sm border transition-colors', setup.duration === d ? 'border-primary-600 bg-primary-50 text-primary-600 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300']"
            >{{ d }}分钟</button>
          </div>
        </div>

        <button
          @click="startExam"
          :disabled="!setup.subject_id || generating"
          class="btn-primary w-full text-base py-3"
        >
          <font-awesome-icon v-if="generating" icon="refresh" spin class="mr-2" />
          {{ generating ? '正在生成试卷...' : '开始考试' }}
        </button>
      </div>
    </template>

    <!-- ==================== 考试进行中 ==================== -->
    <template v-else>
      <!-- 顶部信息栏 -->
      <div class="card mb-4 p-3">
        <div class="flex items-center justify-between">
          <!-- 倒计时 -->
          <div class="flex items-center gap-2" :class="timerClass">
            <font-awesome-icon icon="clock" />
            <span class="font-mono font-bold text-lg">{{ timerDisplay }}</span>
          </div>
          <!-- 进度 -->
          <span class="text-sm text-gray-500">{{ currentIndex + 1 }} / {{ examQuestions.length }}</span>
          <!-- 交卷按钮 -->
          <button @click="showSubmitConfirm = true" class="btn-danger text-sm">
            <font-awesome-icon icon="flag" class="mr-1" />
            交卷
          </button>
        </div>
      </div>

      <!-- 答题进度条 -->
      <div class="w-full bg-gray-200 rounded-full h-1.5 mb-4">
        <div class="bg-primary-600 h-1.5 rounded-full transition-all" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <!-- 题目卡片 -->
      <template v-if="currentQuestion">
        <!-- 题型标签 -->
        <div class="flex items-center justify-between mb-3">
          <span :class="typeTagClass">{{ typeTagText }}</span>
          <span v-if="examAnswers[currentQuestion.id] !== undefined" class="text-xs text-green-600 flex items-center gap-1">
            <font-awesome-icon icon="check" class="text-xs" />
            已作答
          </span>
        </div>

        <!-- 题目内容 -->
        <div class="card mb-4">
          <div class="text-gray-800 leading-relaxed text-sm sm:text-base whitespace-pre-wrap">{{ currentQuestion.content }}</div>
        </div>

        <!-- 选项区域 -->
        <div class="space-y-2 mb-4">
          <!-- 单选题 -->
          <template v-if="currentQuestion.type === '单选'">
            <button
              v-for="opt in questionOptions"
              :key="opt.key"
              @click="selectSingle(opt.key)"
              :class="examOptionClass(opt.key, false)"
            >
              <span class="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0"
                :class="examIndicatorClass(opt.key, false)">
                {{ opt.key }}
              </span>
              <span class="text-sm sm:text-base text-left">{{ opt.content }}</span>
            </button>
          </template>

          <!-- 多选题 -->
          <template v-if="currentQuestion.type === '多选'">
            <button
              v-for="opt in questionOptions"
              :key="opt.key"
              @click="toggleMulti(opt.key)"
              :class="examOptionClass(opt.key, true)"
            >
              <span class="w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0"
                :class="examIndicatorClass(opt.key, true)">
                <font-awesome-icon v-if="examMultiSelected(opt.key)" icon="check" class="text-xs" />
                <template v-else>{{ opt.key }}</template>
              </span>
              <span class="text-sm sm:text-base text-left">{{ opt.content }}</span>
            </button>
            <button
              v-if="examMultiAnySelected"
              @click="confirmMultiSelect"
              class="btn-primary w-full mt-3 text-sm"
            >
              确认选择
            </button>
          </template>

          <!-- 判断题 -->
          <template v-if="currentQuestion.type === '判断'">
            <div class="grid grid-cols-2 gap-3">
              <button
                @click="selectJudge('正确')"
                :class="examJudgeClass('正确')"
              >
                <font-awesome-icon icon="circle-check" class="text-xl" />
                <span class="font-medium">正确</span>
              </button>
              <button
                @click="selectJudge('错误')"
                :class="examJudgeClass('错误')"
              >
                <font-awesome-icon icon="circle-xmark" class="text-xl" />
                <span class="font-medium">错误</span>
              </button>
            </div>
          </template>
        </div>

        <!-- 导航按钮 -->
        <div class="flex items-center justify-between mt-4">
          <button
            @click="prevQuestion"
            :disabled="currentIndex === 0"
            class="btn-ghost text-sm flex items-center gap-1"
          >
            <font-awesome-icon icon="chevron-left" class="text-xs" />
            上一题
          </button>
          <span class="text-xs text-gray-400">第 {{ currentIndex + 1 }} 题</span>
          <button
            @click="nextQuestion"
            class="btn-primary text-sm flex items-center gap-1"
          >
            下一题
            <font-awesome-icon icon="chevron-right" class="text-xs" />
          </button>
        </div>
      </template>
    </template>

    <!-- ==================== 交卷确认弹窗 ==================== -->
    <div v-if="showSubmitConfirm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <div class="text-center mb-4">
          <font-awesome-icon icon="exclamation-triangle" class="text-4xl text-orange-500 mb-2" />
          <h3 class="text-lg font-bold text-gray-800">确认交卷？</h3>
        </div>
        <div class="text-sm text-gray-500 text-center mb-2">
          已作答 <span class="font-bold text-primary-600">{{ answeredCount }}</span> / {{ examQuestions.length }} 题
        </div>
        <div v-if="unansweredCount > 0" class="text-sm text-orange-500 text-center mb-4">
          还有 {{ unansweredCount }} 题未作答
        </div>
        <div class="flex gap-3">
          <button @click="showSubmitConfirm = false" class="btn-ghost flex-1">继续答题</button>
          <button @click="submitExam" :disabled="submitting" class="btn-primary flex-1">
            {{ submitting ? '提交中...' : '确认交卷' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import API from '../api'

const router = useRouter()

// ===== 设置 =====
const subjects = ref([])
const setupChapters = ref([])
const generating = ref(false)

const setup = reactive({
  subject_id: null,
  chapter_id: null,
  type: '',
  count: 50,
  duration: 45
})

onMounted(async () => {
  try {
    subjects.value = await API.getSubjects() || []
  } catch { /* 静默 */ }
})

async function onSetupSubjectChange() {
  setup.chapter_id = null
  if (setup.subject_id) {
    try {
      setupChapters.value = await API.getChapters({ subject_id: setup.subject_id }) || []
    } catch { setupChapters.value = [] }
  } else {
    setupChapters.value = []
  }
}

// ===== 考试状态 =====
const examStarted = ref(false)
const examQuestions = ref([])
const currentIndex = ref(0)
const examAnswers = reactive({})
const sessionId = ref(null)
const totalSeconds = ref(0)
const timerInterval = ref(null)
const showSubmitConfirm = ref(false)
const submitting = ref(false)

// 多选题临时选择
const examMultiTemp = reactive({})

const currentQuestion = computed(() => examQuestions.value[currentIndex.value] || null)

// 将 option_a/b/c/d 转为选项数组
const questionOptions = computed(() => {
  if (!currentQuestion.value) return []
  const opts = []
  if (currentQuestion.value.option_a) opts.push({ key: 'A', content: currentQuestion.value.option_a })
  if (currentQuestion.value.option_b) opts.push({ key: 'B', content: currentQuestion.value.option_b })
  if (currentQuestion.value.option_c) opts.push({ key: 'C', content: currentQuestion.value.option_c })
  if (currentQuestion.value.option_d) opts.push({ key: 'D', content: currentQuestion.value.option_d })
  return opts
})

const answeredCount = computed(() => {
  return Object.keys(examAnswers).length
})

const unansweredCount = computed(() => {
  return examQuestions.value.length - answeredCount.value
})

const progressPercent = computed(() => {
  if (examQuestions.value.length === 0) return 0
  return Math.round((answeredCount.value / examQuestions.value.length) * 100)
})

// 计时器
const timerDisplay = computed(() => {
  const m = Math.floor(totalSeconds.value / 60)
  const s = totalSeconds.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const timerClass = computed(() => {
  if (totalSeconds.value <= 60) return 'text-red-500'
  if (totalSeconds.value <= 300) return 'text-orange-500'
  return 'text-primary-600'
})

// 题型标签
const typeTagClass = computed(() => {
  if (!currentQuestion.value) return ''
  const map = { '单选': 'tag tag-single', '多选': 'tag tag-multi', '判断': 'tag tag-judge' }
  return map[currentQuestion.value.type] || ''
})

const typeTagText = computed(() => {
  if (!currentQuestion.value) return ''
  const map = { '单选': '单选题', '多选': '多选题', '判断': '判断题' }
  return map[currentQuestion.value.type] || ''
})

// ===== 开始考试 =====
async function startExam() {
  if (!setup.subject_id) return
  generating.value = true
  try {
    const data = await API.generateExam({
      subject_id: setup.subject_id,
      chapter_id: setup.chapter_id || undefined,
      type: setup.type || undefined,
      count: setup.count,
      duration: setup.duration
    })
    sessionId.value = data.session_id
    examQuestions.value = data.questions || []
    totalSeconds.value = (setup.duration || data.duration || 45) * 60
    examStarted.value = true
    currentIndex.value = 0
    // 清空答案
    Object.keys(examAnswers).forEach(k => delete examAnswers[k])
    Object.keys(examMultiTemp).forEach(k => delete examMultiTemp[k])
    
    // 启动倒计时
    startTimer()
  } catch {
    alert('生成试卷失败，请重试')
  } finally {
    generating.value = false
  }
}

function startTimer() {
  clearInterval(timerInterval.value)
  timerInterval.value = setInterval(() => {
    totalSeconds.value--
    if (totalSeconds.value <= 0) {
      clearInterval(timerInterval.value)
      submitExam()
    }
  }, 1000)
}

onBeforeUnmount(() => {
  clearInterval(timerInterval.value)
})

// ===== 答题操作 =====
function selectSingle(key) {
  examAnswers[currentQuestion.value.id] = key
}

function toggleMulti(key) {
  const qid = currentQuestion.value.id
  if (!examMultiTemp[qid]) examMultiTemp[qid] = []
  const idx = examMultiTemp[qid].indexOf(key)
  if (idx >= 0) examMultiTemp[qid].splice(idx, 1)
  else examMultiTemp[qid].push(key)
}

const examMultiAnySelected = computed(() => {
  if (!currentQuestion.value || currentQuestion.value.type !== '多选') return false
  const temp = examMultiTemp[currentQuestion.value.id]
  return temp && temp.length > 0
})

function examMultiSelected(key) {
  if (!currentQuestion.value) return false
  const temp = examMultiTemp[currentQuestion.value.id]
  return temp ? temp.includes(key) : false
}

function confirmMultiSelect() {
  const qid = currentQuestion.value.id
  const selected = examMultiTemp[qid] || []
  if (selected.length === 0) return
  examAnswers[qid] = [...selected]
}

function selectJudge(val) {
  examAnswers[currentQuestion.value.id] = val
}

// 选项样式
function examOptionClass(key, isMulti) {
  if (!currentQuestion.value) return 'flex items-center w-full p-3 rounded-lg border-2 transition-all text-left'
  const base = 'flex items-center w-full p-3 rounded-lg border-2 transition-all text-left'
  if (isMulti && examMultiSelected(key)) return base + ' border-primary-500 bg-primary-50'
  if (!isMulti && examAnswers[currentQuestion.value.id] === key) return base + ' border-primary-500 bg-primary-50'
  return base + ' border-gray-200 hover:border-primary-300 hover:bg-gray-50'
}

function examIndicatorClass(key, isMulti) {
  if (!currentQuestion.value) return ''
  if (isMulti && examMultiSelected(key)) return 'border-primary-500 bg-primary-500 text-white'
  if (!isMulti && examAnswers[currentQuestion.value.id] === key) return 'border-primary-500 bg-primary-500 text-white'
  return 'border-gray-300 text-gray-500'
}

function examJudgeClass(val) {
  if (!currentQuestion.value) return 'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all'
  const base = 'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all'
  if (examAnswers[currentQuestion.value.id] === val) return base + ' border-primary-500 bg-primary-50 text-primary-600'
  return base + ' border-gray-200 hover:border-primary-300 text-gray-500'
}

// ===== 导航 =====
function prevQuestion() {
  if (currentIndex.value > 0) currentIndex.value--
}

function nextQuestion() {
  if (currentIndex.value < examQuestions.value.length - 1) currentIndex.value++
}

// ===== 交卷 =====
async function submitExam() {
  if (submitting.value) return
  submitting.value = true
  clearInterval(timerInterval.value)
  
  try {
    // 并行提交所有已作答的题目
    const promises = examQuestions.value
      .filter(q => examAnswers[q.id] !== undefined)
      .map(q => {
        const userAnswer = Array.isArray(examAnswers[q.id]) ? examAnswers[q.id].join(',') : String(examAnswers[q.id])
        return API.submitExamAnswer(sessionId.value, { question_id: q.id, user_answer: userAnswer }).catch(() => {})
      })
    await Promise.all(promises)
    // 后台同步到云端（静默）
    API.syncToCloud().catch(() => {})
  } finally {
    submitting.value = false
    router.push(`/exam/result/${sessionId.value}`)
  }
}
</script>
