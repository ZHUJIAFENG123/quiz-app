<template>
  <div class="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-6">
    <!-- 错题模式标题 -->
    <div v-if="isWrongMode" class="card mb-4 p-3 bg-orange-50 border-orange-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <font-awesome-icon icon="circle-xmark" class="text-orange-500" />
          <span class="font-medium text-orange-700">重做错题</span>
          <span class="text-xs text-orange-500">共 {{ totalCount }} 道</span>
        </div>
        <router-link to="/wrong" class="text-xs text-orange-500 hover:text-orange-700">返回错题本</router-link>
      </div>
    </div>

    <!-- 筛选栏（错题模式隐藏） -->
    <div v-if="!isWrongMode" class="card mb-4 p-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select v-model="filters.subject_id" class="input text-sm" @change="onSubjectChange">
          <option :value="null">全部科目</option>
          <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <select v-model="filters.chapter_id" class="input text-sm">
          <option :value="null">全部章节</option>
          <option v-for="c in filteredChapters" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="filters.type" class="input text-sm">
          <option value="">全部题型</option>
          <option value="单选">单选</option>
          <option value="多选">多选</option>
          <option value="判断">判断</option>
        </select>
        <div class="flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            :class="['flex-1 text-xs py-2 font-medium transition-colors', filters.mode === 'sequential' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600']"
            @click="filters.mode = 'sequential'"
          >顺序</button>
          <button
            :class="['flex-1 text-xs py-2 font-medium transition-colors', filters.mode === 'random' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600']"
            @click="filters.mode = 'random'"
          >随机</button>
        </div>
      </div>
      <button class="btn-primary w-full mt-2 text-sm" @click="startFresh" :disabled="loading">
        <font-awesome-icon icon="search" class="mr-1" />
        {{ questions.length ? '重新加载' : '开始练习' }}
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading && questions.length === 0" class="card text-center py-12 text-gray-400">
      <img src="/mascot.png" alt="小助手" class="w-20 h-20 rounded-full object-cover mx-auto mb-3 opacity-80 animate-bounce" />
      <p>小助手正在准备题目...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading && questions.length === 0 && hasStarted" class="card text-center py-12 text-gray-400">
      <img src="/mascot.png" alt="小助手" class="w-20 h-20 rounded-full object-cover mx-auto mb-3 opacity-60" />
      <p>没有符合条件的题目</p>
      <p class="text-sm mt-1">请尝试调整筛选条件</p>
    </div>

    <!-- 题目区域 -->
    <template v-if="currentQuestion">
      <!-- 进度与题号 -->
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-500">{{ currentIndex + 1 }} / {{ totalCount || questions.length }}</span>
        <span class="flex items-center gap-2">
          <span :class="typeTagClass">{{ typeTagText }}</span>
          <button
            @click="toggleFavorite"
            class="text-lg transition-colors"
            :class="currentQuestion.is_favorite ? 'text-pink-500' : 'text-gray-300 hover:text-pink-400'"
          >
            <font-awesome-icon :icon="currentQuestion.is_favorite ? 'heart' : 'heart'" />
          </button>
        </span>
      </div>

      <!-- 题目内容 -->
      <div class="card mb-4">
        <div class="text-gray-800 leading-relaxed text-sm sm:text-base whitespace-pre-wrap">{{ currentQuestion.content }}</div>
      </div>

      <!-- 选项区域 -->
      <div class="space-y-2 mb-4">
        <!-- 单选题选项 -->
        <template v-if="currentQuestion.type === '单选'">
          <button
            v-for="opt in questionOptions"
            :key="opt.key"
            @click="selectSingle(opt.key)"
            :disabled="answered"
            :class="optionClass(opt.key, false)"
          >
            <span class="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0"
              :class="optionIndicatorClass(opt.key, false)">
              {{ opt.key }}
            </span>
            <span class="text-sm sm:text-base text-left">{{ opt.content }}</span>
            <font-awesome-icon v-if="answered && opt.key === currentQuestion.answer" icon="check" class="ml-auto text-green-500" />
            <font-awesome-icon v-else-if="answered && opt.key === userAnswers[currentQuestion.id] && opt.key !== currentQuestion.answer" icon="xmark" class="ml-auto text-red-500" />
          </button>
          <button
            v-if="!answered && singleTempSelected !== null"
            @click="confirmSingle"
            class="btn-primary w-full mt-3 text-sm"
          >
            确认选择
          </button>
        </template>

        <!-- 多选题选项 -->
        <template v-if="currentQuestion.type === '多选'">
          <button
            v-for="opt in questionOptions"
            :key="opt.key"
            @click="toggleMulti(opt.key)"
            :disabled="answered"
            :class="optionClass(opt.key, true)"
          >
            <span class="w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0"
              :class="optionIndicatorClass(opt.key, true)">
              <font-awesome-icon v-if="isMultiSelected(opt.key)" icon="check" class="text-xs" />
              <template v-else>{{ opt.key }}</template>
            </span>
            <span class="text-sm sm:text-base text-left">{{ opt.content }}</span>
            <font-awesome-icon v-if="answered && isCorrectMultiOption(opt.key)" icon="check" class="ml-auto text-green-500" />
            <font-awesome-icon v-else-if="answered && isWrongMultiOption(opt.key)" icon="xmark" class="ml-auto text-red-500" />
          </button>
          <button
            v-if="!answered && isMultiSelectedAny"
            @click="confirmMulti"
            class="btn-primary w-full mt-3 text-sm"
          >
            确认选择
          </button>
        </template>

        <!-- 判断题按钮 -->
        <template v-if="currentQuestion.type === '判断'">
          <div class="grid grid-cols-2 gap-3">
            <button
              @click="selectJudge('正确')"
              :disabled="answered"
              :class="judgeBtnClass('正确')"
            >
              <font-awesome-icon v-if="answered && currentQuestion.answer === '正确'" icon="circle-check" class="text-xl" />
              <font-awesome-icon v-else-if="answered && userAnswers[currentQuestion.id] === '正确' && currentQuestion.answer !== '正确'" icon="circle-xmark" class="text-xl" />
              <font-awesome-icon v-else icon="circle-check" class="text-xl" />
              <span class="font-medium">正确</span>
            </button>
            <button
              @click="selectJudge('错误')"
              :disabled="answered"
              :class="judgeBtnClass('错误')"
            >
              <font-awesome-icon v-if="answered && currentQuestion.answer === '错误'" icon="circle-check" class="text-xl" />
              <font-awesome-icon v-else-if="answered && userAnswers[currentQuestion.id] === '错误' && currentQuestion.answer !== '错误'" icon="circle-xmark" class="text-xl" />
              <font-awesome-icon v-else icon="circle-xmark" class="text-xl" />
              <span class="font-medium">错误</span>
            </button>
          </div>
        </template>
      </div>

      <!-- 答题结果与解析 -->
      <div v-if="answered" class="card mb-4">
        <div class="flex items-center gap-2 mb-2">
          <font-awesome-icon
            :icon="isCorrect ? 'circle-check' : 'circle-xmark'"
            :class="isCorrect ? 'text-green-500' : 'text-red-500'"
            class="text-lg"
          />
          <span :class="isCorrect ? 'text-green-600 font-medium' : 'text-red-600 font-medium'">
            {{ isCorrect ? '回答正确！' : '回答错误' }}
          </span>
        </div>
        <div class="text-sm text-gray-600">
          <p class="mb-1"><span class="font-medium text-gray-700">正确答案：</span>{{ formatAnswer }}</p>
          <p v-if="currentQuestion.analysis" class="text-gray-500 leading-relaxed">
            <span class="font-medium text-gray-700">解析：</span>{{ currentQuestion.analysis }}
          </p>
        </div>
      </div>

      <!-- 底部导航 -->
      <div class="flex items-center justify-between mt-4">
        <button
          @click="prevQuestion"
          :disabled="currentIndex === 0 && currentPage === 1"
          class="btn-ghost text-sm flex items-center gap-1"
        >
          <font-awesome-icon icon="chevron-left" class="text-xs" />
          上一题
        </button>
        <span class="text-xs text-gray-400">
          第 {{ currentPage > 1 ? (currentPage - 1) * 20 + currentIndex + 1 : currentIndex + 1 }} 题
        </span>
        <button
          @click="nextQuestion"
          class="btn-primary text-sm flex items-center gap-1"
          :disabled="loadingMore"
        >
          {{ loadingMore ? '加载中...' : '下一题' }}
          <font-awesome-icon icon="chevron-right" class="text-xs" />
        </button>
      </div>
    </template>

    <!-- 初始引导 -->
    <div v-if="!hasStarted && !loading" class="card text-center py-12 text-gray-400">
      <img src="/mascot.png" alt="小助手" class="w-20 h-20 rounded-full object-cover mx-auto mb-3 opacity-80" />
      <p class="text-sm text-gray-500">选好科目和题型，小助手带你刷题！</p>
    </div>

    <!-- 全部完成 -->
    <div v-if="allDone" class="card text-center py-12">
      <img src="/mascot.png" alt="小助手" class="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-md" />
      <p class="text-lg font-medium text-gray-800">恭喜！已完成所有题目</p>
      <p class="text-sm text-gray-400 mt-1">正确率 {{ correctRate }}%</p>
      <div class="flex justify-center gap-3 mt-4">
        <button @click="startFresh" class="btn-outline text-sm">重新开始</button>
        <router-link to="/" class="btn-primary text-sm">返回首页</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import API from '../api'

const route = useRoute()

// 错题模式
const isWrongMode = computed(() => route.query.source === 'wrong')

// 筛选条件
const filters = reactive({
  subject_id: null,
  chapter_id: null,
  type: '',
  mode: 'sequential'
})

// 数据
const subjects = ref([])
const chapters = ref([])
const questions = ref([])
const currentIndex = ref(0)
const currentPage = ref(1)
const totalCount = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const hasStarted = ref(false)
const allDone = ref(false)
const userAnswers = reactive({})
const answerResults = reactive({})

// 多选临时选择
const multiSelectTemp = reactive({})

// 单选临时选择（确认后才提交）
const singleTempSelected = ref(null)

onMounted(async () => {
  try {
    subjects.value = await API.getSubjects() || []
  } catch { /* 静默 */ }

  // 尝试恢复练习进度
  const saved = loadPracticeState()
  if (saved && !route.query.source) {
    Object.assign(filters, saved.filters)
    if (saved.subject_id) filters.subject_id = saved.subject_id
    if (saved.chapter_id) filters.chapter_id = saved.chapter_id
    if (saved.type) filters.type = saved.type
    if (saved.mode) filters.mode = saved.mode
    if (filters.subject_id) await onSubjectChange()
    await startPractice(saved.currentIndex || 0)
    return
  }
  if (route.query.subject_id) filters.subject_id = Number(route.query.subject_id)
  if (route.query.chapter_id) filters.chapter_id = Number(route.query.chapter_id)
  if (route.query.type) filters.type = route.query.type
  if (route.query.mode) filters.mode = route.query.mode

  // 如果路由带有筛选参数，自动开始
  // 错题模式自动开始
  if (route.query.source === 'wrong') {
    await startPractice()
  } else if (route.query.subject_id || route.query.chapter_id || route.query.type) {
    if (route.query.mode) filters.mode = route.query.mode
    await onSubjectChange()
    await startPractice()
  }
})

const filteredChapters = computed(() => {
  if (!filters.subject_id) return chapters.value
  return chapters.value.filter(c => c.subject_id === filters.subject_id)
})

async function onSubjectChange() {
  filters.chapter_id = null
  if (filters.subject_id) {
    try {
      chapters.value = await API.getChapters({ subject_id: filters.subject_id }) || []
    } catch { chapters.value = [] }
  } else {
    chapters.value = []
  }
}

async function startPractice(startIndex = 0) {
  hasStarted.value = true
  allDone.value = false
  currentPage.value = 1
  currentIndex.value = 0
  questions.value = []
  Object.keys(userAnswers).forEach(k => delete userAnswers[k])
  Object.keys(answerResults).forEach(k => delete answerResults[k])
  Object.keys(multiSelectTemp).forEach(k => delete multiSelectTemp[k])
  singleTempSelected.value = null
  
  loading.value = true
  try {
    let data
    if (isWrongMode.value) {
      data = await API.getWrongQuestions({ page: 1, pageSize: 20 })
    } else {
      // 如果指定了起始位置，加载多页直到覆盖
      const pageForStart = Math.floor(startIndex / 20) + 1
      data = await API.getPracticeQuestions({
        page: pageForStart,
        pageSize: 20,
        subject_id: filters.subject_id || undefined,
        chapter_id: filters.chapter_id || undefined,
        type: filters.type || undefined,
        mode: filters.mode
      })
      currentPage.value = pageForStart
    }
    // 处理返回数据 - API已解包为 { list, total, page, ... }
    if (Array.isArray(data)) {
      questions.value = data
      totalCount.value = data.length
    } else if (data && data.list) {
      questions.value = data.list
      totalCount.value = data.total
    } else {
      questions.value = []
      totalCount.value = 0
    }
    if (startIndex > 0 && questions.value.length > 0) {
      currentIndex.value = Math.min(startIndex % 20, questions.value.length - 1)
    }
    savePracticeState()
  } catch {
    questions.value = []
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  loadingMore.value = true
  currentPage.value++
  try {
    let data
    if (isWrongMode.value) {
      data = await API.getWrongQuestions({ page: currentPage.value, pageSize: 20 })
    } else {
      data = await API.getPracticeQuestions({
        page: currentPage.value,
        pageSize: 20,
        subject_id: filters.subject_id || undefined,
        chapter_id: filters.chapter_id || undefined,
        type: filters.type || undefined,
        mode: filters.mode
      })
    }
    const newData = Array.isArray(data) ? data : (data?.list || [])
    if (newData.length === 0) {
      allDone.value = true
    } else {
      questions.value.push(...newData)
    }
  } catch {
    allDone.value = true
  } finally {
    loadingMore.value = false
  }
}

// ===== 练习进度记忆 =====
const PRACTICE_KEY = 'quiz_practice_state'

function savePracticeState() {
  if (isWrongMode.value) return // 错题模式不保存
  try {
    const state = {
      filters: JSON.parse(JSON.stringify(filters)),
      currentPage: currentPage.value,
      currentIndex: currentIndex.value,
      questionIds: questions.value.map(q => q.id)
    }
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded */ }
}

function loadPracticeState() {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function clearPracticeState() {
  localStorage.removeItem(PRACTICE_KEY)
}

function startFresh() {
  clearPracticeState()
  startPractice(0)
}

const currentQuestion = computed(() => questions.value[currentIndex.value] || null)

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

const answered = computed(() => {
  if (!currentQuestion.value) return false
  return answerResults[currentQuestion.value.id] !== undefined
})

const isCorrect = computed(() => {
  if (!currentQuestion.value) return false
  return answerResults[currentQuestion.value.id] === true
})

const correctRate = computed(() => {
  const results = Object.values(answerResults)
  if (results.length === 0) return 0
  const correctCount = results.filter(r => r === true).length
  return Math.round((correctCount / results.length) * 100)
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

const formatAnswer = computed(() => {
  if (!currentQuestion.value) return ''
  const answer = currentQuestion.value.answer
  if (currentQuestion.value.type === '多选') {
    return String(answer).split(',').join('、')
  }
  return String(answer)
})

// 选项样式
function optionClass(key, isMulti) {
  if (!currentQuestion.value) return 'flex items-center w-full p-3 rounded-lg border-2 transition-all text-left'
  
  const base = 'flex items-center w-full p-3 rounded-lg border-2 transition-all text-left'
  if (answered.value) {
    if (isMulti) {
      if (isCorrectMultiOption(key)) return base + ' border-green-400 bg-green-50'
      if (isWrongMultiOption(key)) return base + ' border-red-400 bg-red-50'
    } else {
      if (String(key) === String(currentQuestion.value.answer)) return base + ' border-green-400 bg-green-50'
      const ua = userAnswers[currentQuestion.value.id]
      if (String(key) === String(ua) && String(key) !== String(currentQuestion.value.answer)) return base + ' border-red-400 bg-red-50'
    }
    return base + ' border-gray-200 opacity-60'
  }
  
  if (isMulti && isMultiSelected(key)) return base + ' border-primary-500 bg-primary-50'
  if (!isMulti && singleTempSelected.value === key) return base + ' border-primary-500 bg-primary-50'
  if (!isMulti && String(userAnswers[currentQuestion.value.id]) === String(key)) return base + ' border-primary-500 bg-primary-50'
  return base + ' border-gray-200 hover:border-primary-300 hover:bg-gray-50'
}

function optionIndicatorClass(key, isMulti) {
  if (!currentQuestion.value) return ''
  
  if (answered.value) {
    if (isMulti) {
      if (isCorrectMultiOption(key)) return 'border-green-500 bg-green-500 text-white'
      if (isWrongMultiOption(key)) return 'border-red-500 bg-red-500 text-white'
    } else {
      if (String(key) === String(currentQuestion.value.answer)) return 'border-green-500 bg-green-500 text-white'
      const ua = userAnswers[currentQuestion.value.id]
      if (String(key) === String(ua) && String(key) !== String(currentQuestion.value.answer)) return 'border-red-500 bg-red-500 text-white'
    }
    return 'border-gray-300 text-gray-400'
  }
  
  if (isMulti && isMultiSelected(key)) return 'border-primary-500 bg-primary-500 text-white'
  if (!isMulti && singleTempSelected.value === key) return 'border-primary-500 bg-primary-500 text-white'
  if (!isMulti && String(userAnswers[currentQuestion.value.id]) === String(key)) return 'border-primary-500 bg-primary-500 text-white'
  return 'border-gray-300 text-gray-500'
}

// 判断按钮样式
function judgeBtnClass(val) {
  if (!currentQuestion.value) return 'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all'
  
  const base = 'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all'
  if (answered.value) {
    if (currentQuestion.value.answer === val) return base + ' border-green-400 bg-green-50 text-green-600'
    if (userAnswers[currentQuestion.value.id] === val && currentQuestion.value.answer !== val) return base + ' border-red-400 bg-red-50 text-red-600'
    return base + ' border-gray-200 text-gray-400'
  }
  if (userAnswers[currentQuestion.value.id] === val) return base + ' border-primary-500 bg-primary-50 text-primary-600'
  return base + ' border-gray-200 hover:border-primary-300 text-gray-500'
}

// 单选选择（仅高亮，不提交）
function selectSingle(key) {
  if (answered.value) return
  if (singleTempSelected.value === key) {
    singleTempSelected.value = null
    return
  }
  singleTempSelected.value = key
}

// 确认单选
function confirmSingle() {
  if (answered.value || singleTempSelected.value === null) return
  const key = singleTempSelected.value
  userAnswers[currentQuestion.value.id] = key
  singleTempSelected.value = null
  submitUserAnswer(key)
}

// 多选操作
const isMultiSelectedAny = computed(() => {
  if (!currentQuestion.value || currentQuestion.value.type !== '多选') return false
  const temp = multiSelectTemp[currentQuestion.value.id]
  return temp && temp.length > 0
})

function isMultiSelected(key) {
  if (!currentQuestion.value) return false
  const temp = multiSelectTemp[currentQuestion.value.id]
  return temp ? temp.includes(key) : false
}

function toggleMulti(key) {
  if (answered.value) return
  const qid = currentQuestion.value.id
  if (!multiSelectTemp[qid]) multiSelectTemp[qid] = []
  const idx = multiSelectTemp[qid].indexOf(key)
  if (idx >= 0) multiSelectTemp[qid].splice(idx, 1)
  else multiSelectTemp[qid].push(key)
}

function confirmMulti() {
  const qid = currentQuestion.value.id
  const selected = multiSelectTemp[qid] || []
  if (selected.length === 0) return
  userAnswers[qid] = [...selected]
  submitUserAnswer(selected)
}

function isCorrectMultiOption(key) {
  if (!currentQuestion.value) return false
  const answer = String(currentQuestion.value.answer)
  return answer.split(',').map(s => s.trim()).includes(key)
}

function isWrongMultiOption(key) {
  if (!currentQuestion.value) return false
  const qid = currentQuestion.value.id
  const answer = String(currentQuestion.value.answer)
  const userAns = userAnswers[qid]
  return Array.isArray(userAns) && userAns.includes(key) && !answer.split(',').map(s => s.trim()).includes(key)
}

// 判断选择
function selectJudge(val) {
  if (answered.value) return
  userAnswers[currentQuestion.value.id] = val
  submitUserAnswer(val)
}

// 提交答案
async function submitUserAnswer(answer) {
  const q = currentQuestion.value
  if (!q) return
  
  // 判断对错
  let correct = false
  if (q.type === '多选') {
    // 多选题：answer是数组 ["A","C"]，q.answer是字符串 "A,C"
    const userArr = Array.isArray(answer) ? [...answer].sort() : String(answer).split(',').map(s => s.trim()).sort()
    const correctArr = String(q.answer).split(',').map(s => s.trim()).sort()
    correct = userArr.length === correctArr.length && userArr.every((v, i) => v === correctArr[i])
  } else {
    correct = String(answer) === String(q.answer)
  }
  answerResults[q.id] = correct

  try {
    await API.submitAnswer({ question_id: q.id, user_answer: Array.isArray(answer) ? answer.join(',') : String(answer), mode: 'practice' })
    // 后台同步到云端（静默）
    API.syncToCloud().catch(() => {})
  } catch { /* 静默 */ }
}

// 收藏切换
async function toggleFavorite() {
  const q = currentQuestion.value
  if (!q) return
  try {
    await API.toggleFavorite(q.id)
    q.is_favorite = !q.is_favorite
  } catch { /* 静默 */ }
}

// 导航
function prevQuestion() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    Object.keys(multiSelectTemp).forEach(k => delete multiSelectTemp[k])
    singleTempSelected.value = null
    savePracticeState()
    return
  }
  if (currentPage.value > 1) {
    // 不实现跨页回退 - 保持在第一题
  }
}

async function nextQuestion() {
  singleTempSelected.value = null
  if (currentIndex.value < questions.value.length - 1) {
    currentIndex.value++
    Object.keys(multiSelectTemp).forEach(k => delete multiSelectTemp[k])
    savePracticeState()
    return
  }
  if (totalCount.value > questions.value.length) {
    await loadMore()
    if (questions.value.length > currentIndex.value) {
      currentIndex.value++
      Object.keys(multiSelectTemp).forEach(k => delete multiSelectTemp[k])
      savePracticeState()
    }
  } else {
    allDone.value = true
    clearPracticeState()
  }
}
</script>
