<template>
  <div class="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-6">
    <!-- 加载中 -->
    <div v-if="loading" class="card text-center py-12 text-gray-400">
      <font-awesome-icon icon="refresh" spin class="text-3xl mb-3 text-primary-600" />
      <p>加载成绩中...</p>
    </div>

    <!-- 结果内容 -->
    <template v-else-if="result">
      <!-- 分数区域 -->
      <div class="card text-center py-6 mb-4">
        <div class="relative inline-flex items-center justify-center mb-4">
          <svg class="w-36 h-36 sm:w-40 sm:h-40 transform -rotate-90">
            <circle
              cx="50%" cy="50%" r="42%"
              fill="none"
              stroke="#e5e7eb"
              stroke-width="8"
            />
            <circle
              cx="50%" cy="50%" r="42%"
              fill="none"
              :stroke="scoreColor"
              stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
              class="transition-all duration-1000 ease-out"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-3xl sm:text-4xl font-bold" :class="scoreTextColor">{{ result.score ?? 0 }}</span>
            <span class="text-xs text-gray-400">分</span>
          </div>
        </div>
        <p class="text-sm text-gray-500">
          {{ scoreLabel }}
        </p>
      </div>

      <!-- 统计数据 -->
      <div class="grid grid-cols-4 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-lg font-bold text-primary-600">{{ result.total ?? 0 }}</div>
          <div class="text-xs text-gray-400">总题数</div>
        </div>
        <div class="card text-center">
          <div class="text-lg font-bold text-green-500">{{ result.correct ?? 0 }}</div>
          <div class="text-xs text-gray-400">正确</div>
        </div>
        <div class="card text-center">
          <div class="text-lg font-bold text-red-500">{{ result.wrong ?? 0 }}</div>
          <div class="text-xs text-gray-400">错误</div>
        </div>
        <div class="card text-center">
          <div class="text-lg font-bold text-gray-600">{{ formatTime }}</div>
          <div class="text-xs text-gray-400">用时</div>
        </div>
      </div>

      <!-- 正确率进度条 -->
      <div class="card mb-4 p-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm text-gray-600">正确率</span>
          <span class="text-sm font-bold" :class="scoreTextColor">{{ accuracyPercent }}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="h-2 rounded-full transition-all duration-700"
            :class="accuracyBarClass"
            :style="{ width: accuracyPercent + '%' }"
          ></div>
        </div>
      </div>

      <!-- 章节统计 -->
      <div v-if="result.chapter_stats && result.chapter_stats.length" class="card mb-4">
        <h3 class="font-semibold text-gray-800 mb-3 text-sm">各章节成绩</h3>
        <div v-for="cs in result.chapter_stats" :key="cs.chapter_name || cs.name" class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <span class="text-sm text-gray-700">{{ cs.chapter_name || cs.name }}</span>
          <div class="flex items-center gap-3 text-xs">
            <span class="text-green-600">{{ cs.correct ?? 0 }} 对</span>
            <span class="text-red-500">{{ cs.wrong ?? 0 }} 错</span>
            <span class="text-gray-400">/ {{ cs.total ?? (cs.correct || 0) + (cs.wrong || 0) }}</span>
            <span class="font-medium" :class="chapterScoreColor(cs)">{{ chapterScoreRate(cs) }}%</span>
          </div>
        </div>
      </div>

      <!-- 题目详情列表 -->
      <div class="mb-4">
        <h3 class="font-semibold text-gray-800 mb-3 text-sm">答题详情</h3>
        <div
          v-for="(q, idx) in result.records"
          :key="q.id || idx"
          class="card mb-3"
          :class="q.is_correct ? 'border-l-4 border-l-green-400' : 'border-l-4 border-l-red-400'"
        >
          <!-- 题目标题 -->
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <span :class="q.type === '单选' ? 'tag tag-single' : q.type === '多选' ? 'tag tag-multi' : 'tag tag-judge'">
                {{ q.type === '单选' ? '单选' : q.type === '多选' ? '多选' : '判断' }}
              </span>
              <span class="text-sm font-medium text-gray-700">第{{ idx + 1 }}题</span>
            </div>
            <span :class="q.is_correct ? 'text-green-500' : 'text-red-500'" class="text-xs font-medium flex items-center gap-1">
              <font-awesome-icon :icon="q.is_correct ? 'circle-check' : 'circle-xmark'" />
              {{ q.is_correct ? '正确' : '错误' }}
            </span>
          </div>

          <!-- 题目内容 -->
          <p class="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-wrap">{{ q.content }}</p>

          <!-- 选项 -->
          <div v-if="getResultOptions(q).length" class="mb-2 text-xs text-gray-500 space-y-0.5">
            <div v-for="opt in getResultOptions(q)" :key="opt.key" class="flex items-center gap-1">
              <span :class="[
                'font-medium',
                isAnswerOption(opt.key, q.answer) && isAnswerOption(opt.key, q.user_answer) ? 'text-green-600' :
                isAnswerOption(opt.key, q.answer) ? 'text-green-600' :
                isAnswerOption(opt.key, q.user_answer) && !isAnswerOption(opt.key, q.answer) ? 'text-red-500' :
                'text-gray-400'
              ]">
                {{ opt.key }}. {{ opt.content }}
              </span>
              <font-awesome-icon v-if="isAnswerOption(opt.key, q.answer)" icon="check" class="text-green-500 text-xs" />
              <font-awesome-icon v-else-if="isAnswerOption(opt.key, q.user_answer) && !isAnswerOption(opt.key, q.answer)" icon="xmark" class="text-red-500 text-xs" />
            </div>
          </div>

          <!-- 答案对比 -->
          <div class="bg-gray-50 rounded-lg p-2 text-xs space-y-1">
            <div class="flex gap-2">
              <span class="text-gray-400 flex-shrink-0">你的答案：</span>
              <span :class="q.is_correct ? 'text-green-600 font-medium' : 'text-red-500 font-medium'">{{ formatUserAnswer(q) }}</span>
            </div>
            <div v-if="!q.is_correct" class="flex gap-2">
              <span class="text-gray-400 flex-shrink-0">正确答案：</span>
              <span class="text-green-600 font-medium">{{ formatCorrectAnswer(q) }}</span>
            </div>
          </div>

          <!-- 解析 -->
          <div v-if="q.analysis" class="mt-2 text-xs text-gray-500 leading-relaxed bg-blue-50 rounded-lg p-2">
            <span class="font-medium text-blue-700">解析：</span>{{ q.analysis }}
          </div>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="flex gap-3">
        <router-link to="/" class="btn-ghost flex-1 text-center text-sm">
          <font-awesome-icon icon="home" class="mr-1" />
          返回首页
        </router-link>
        <router-link to="/wrong" class="btn-primary flex-1 text-center text-sm">
          <font-awesome-icon icon="circle-xmark" class="mr-1" />
          查看错题
        </router-link>
      </div>
    </template>

    <!-- 错误状态 -->
    <div v-else-if="!loading && errorMsg" class="card text-center py-12">
      <font-awesome-icon icon="exclamation-triangle" class="text-4xl text-orange-500 mb-3" />
      <p class="text-gray-600 mb-3">{{ errorMsg }}</p>
      <router-link to="/" class="btn-primary text-sm inline-block">返回首页</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import API from '../api'

const route = useRoute()
const sessionId = route.params.sessionId

const loading = ref(true)
const errorMsg = ref('')
const result = ref(null)

// 圆形进度相关
const circumference = 2 * Math.PI * 42  // r=42%

const dashOffset = computed(() => {
  const percent = result.value?.score ?? 0
  return circumference - (percent / 100) * circumference
})

const scoreColor = computed(() => {
  const s = result.value?.score ?? 0
  if (s >= 80) return '#22c55e'
  if (s >= 60) return '#eab308'
  return '#ef4444'
})

const scoreTextColor = computed(() => {
  const s = result.value?.score ?? 0
  if (s >= 80) return 'text-green-500'
  if (s >= 60) return 'text-yellow-500'
  return 'text-red-500'
})

const scoreLabel = computed(() => {
  const s = result.value?.score ?? 0
  if (s >= 80) return '优秀！继续保持！'
  if (s >= 60) return '良好，还有提升空间'
  return '需要多加练习哦'
})

const accuracyPercent = computed(() => {
  if (!result.value || !result.value.total) return 0
  return Math.round(((result.value.correct || 0) / result.value.total) * 100)
})

const accuracyBarClass = computed(() => {
  const p = accuracyPercent.value
  if (p >= 80) return 'bg-green-500'
  if (p >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
})

const formatTime = computed(() => {
  const t = result.value?.time_taken || Number(route.query.time) || 0
  if (!t) return '0秒'
  if (typeof t === 'number') {
    const m = Math.floor(t / 60)
    const s = t % 60
    return m > 0 ? `${m}分${s}秒` : `${s}秒`
  }
  return String(t)
})

function getResultOptions(q) {
  const opts = []
  if (q.option_a) opts.push({ key: 'A', content: q.option_a })
  if (q.option_b) opts.push({ key: 'B', content: q.option_b })
  if (q.option_c) opts.push({ key: 'C', content: q.option_c })
  if (q.option_d) opts.push({ key: 'D', content: q.option_d })
  return opts
}

function isAnswerOption(key, answer) {
  if (!answer) return false
  // answer 是字符串，如 "A"、"A,C"、"正确"、"错误"
  const str = String(answer)
  return str.split(',').map(s => s.trim()).includes(key)
}

function formatUserAnswer(q) {
  const a = q.user_answer
  if (a === undefined || a === null || a === '') return '未作答'
  return String(a).split(',').join('、')
}

function formatCorrectAnswer(q) {
  const a = q.correct_answer || q.answer
  if (a === undefined || a === null || a === '') return '-'
  return String(a).split(',').join('、')
}

function chapterScoreRate(cs) {
  if (!cs.total && cs.total !== 0) {
    cs.total = (cs.correct || 0) + (cs.wrong || 0)
  }
  if (!cs.total) return 0
  return Math.round(((cs.correct || 0) / cs.total) * 100)
}

function chapterScoreColor(cs) {
  const rate = chapterScoreRate(cs)
  if (rate >= 80) return 'text-green-500'
  if (rate >= 60) return 'text-yellow-500'
  return 'text-red-500'
}

onMounted(async () => {
  try {
    // 智能组卷结果从 localStorage 读取
    if (sessionId.startsWith('smart_') || route.query.smart === '1') {
      const stored = localStorage.getItem(`smart_exam_${sessionId}`)
      if (stored) {
        const data = JSON.parse(stored)
        result.value = {
          score: data.accuracy || 0,
          total: data.total || 0,
          correct: data.correct || 0,
          wrong: (data.total || 0) - (data.correct || 0),
          time_taken: data.time_taken || 0,
          details: (data.details || []).map(d => ({
            ...d,
            option_a: '', option_b: '', option_c: '', option_d: ''
          })),
          chapter_scores: [],
          mode: 'smart'
        }
      } else {
        errorMsg.value = '智能组卷结果未找到'
      }
    } else {
      result.value = await API.getExamResult(sessionId)
    }
  } catch (e) {
    errorMsg.value = '加载成绩失败，请确认考试记录是否存在'
  } finally {
    loading.value = false
  }
})
</script>
