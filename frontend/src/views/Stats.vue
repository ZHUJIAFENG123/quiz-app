<template>
  <div class="max-w-3xl mx-auto px-4 py-6">
    <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
      <font-awesome-icon icon="chart-bar" class="text-primary-600" />
      学习统计
    </h1>

    <!-- 加载中 -->
    <div v-if="loading" class="flex justify-center py-16">
      <div class="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full"></div>
    </div>

    <template v-else>
      <!-- 概览卡片 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="card text-center">
          <font-awesome-icon icon="pen-to-square" class="text-2xl text-primary-600 mb-1" />
          <p class="text-2xl font-bold text-gray-800">{{ stats.total_study || 0 }}</p>
          <p class="text-xs text-gray-400">总做题数</p>
        </div>
        <div class="card text-center">
          <font-awesome-icon icon="trophy" class="text-2xl text-yellow-500 mb-1" />
          <p class="text-2xl font-bold" :class="rateColor(stats.accuracy || 0)">
            {{ stats.accuracy || 0 }}%
          </p>
          <p class="text-xs text-gray-400">正确率</p>
        </div>
        <div class="card text-center">
          <font-awesome-icon icon="clock" class="text-2xl text-blue-400 mb-1" />
          <p class="text-2xl font-bold text-gray-800">{{ stats.practice_count || 0 }}</p>
          <p class="text-xs text-gray-400">练习次数</p>
        </div>
        <div class="card text-center">
          <font-awesome-icon icon="file-pen" class="text-2xl text-purple-500 mb-1" />
          <p class="text-2xl font-bold text-gray-800">{{ stats.exam_count || 0 }}</p>
          <p class="text-xs text-gray-400">考试场次</p>
        </div>
      </div>

      <!-- 章节正确率 -->
      <div class="card mb-6" v-if="chapterStats.length > 0">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">各章节正确率</h3>
        <div class="space-y-3">
          <div v-for="ch in chapterStats" :key="ch.id">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-gray-600 truncate max-w-[60%]">{{ ch.subject_name }} · {{ ch.name }}</span>
              <span :class="['font-medium', rateColor(ch.accuracy)]">{{ ch.accuracy }}%</span>
            </div>
            <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                :class="['h-full rounded-full transition-all duration-500', barColor(ch.accuracy)]"
                :style="{ width: Math.max(ch.accuracy, 2) + '%' }"
              ></div>
            </div>
            <p class="text-xs text-gray-300 mt-0.5">{{ ch.correct || 0 }} / {{ ch.total || 0 }} 题</p>
          </div>
        </div>
      </div>

      <!-- 最近7天图表 -->
      <div class="card mb-6" v-if="dailyStats.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700">最近7天学习趋势</h3>
          <span class="text-xs text-gray-400">共 {{ dailyTotal }} 题</span>
        </div>
        <div class="space-y-3">
          <div v-for="(d, i) in dailyStats" :key="i" class="flex items-center gap-3">
            <!-- 日期标签 -->
            <span class="text-xs text-gray-500 w-16 flex-shrink-0 text-right">{{ formatLabel(d.date) }}</span>
            <!-- 进度条 -->
            <div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
              <!-- 正确部分 -->
              <div
                v-if="(d.correct || 0) > 0"
                class="absolute inset-y-0 left-0 bg-primary-600 transition-all duration-700 rounded-l-full"
                :class="(d.total || 0) - (d.correct || 0) === 0 ? 'rounded-r-full' : ''"
                :style="{ width: maxBarWidth > 0 ? ((d.correct || 0) / maxBarWidth * 100) + '%' : '0%' }"
              ></div>
              <!-- 错误部分 -->
              <div
                v-if="(d.total || 0) - (d.correct || 0) > 0"
                class="absolute inset-y-0 bg-red-400 transition-all duration-700"
                :class="(d.correct || 0) === 0 ? 'rounded-l-full rounded-r-full' : 'rounded-r-full'"
                :style="{
                  left: maxBarWidth > 0 ? ((d.correct || 0) / maxBarWidth * 100) + '%' : '0%',
                  width: maxBarWidth > 0 ? (((d.total || 0) - (d.correct || 0)) / maxBarWidth * 100) + '%' : '0%'
                }"
              ></div>
            </div>
            <!-- 数字 -->
            <span class="text-xs text-gray-600 w-12 flex-shrink-0 font-mono">
              <span class="text-primary-600 font-medium">{{ d.correct || 0 }}</span>
              <span class="text-gray-300">/</span>
              <span class="text-red-400">{{ (d.total || 0) - (d.correct || 0) }}</span>
            </span>
          </div>
        </div>
        <!-- 图例 -->
        <div class="flex items-center justify-center gap-6 mt-4 text-xs text-gray-400">
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-primary-600"></span>正确
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-red-400"></span>错误
          </span>
        </div>
      </div>

      <!-- 危险操作 -->
      <div class="card border border-red-200 bg-red-50">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-red-700 mb-0.5">清除学习数据</p>
            <p class="text-xs text-red-400">将清空所有学习记录、错题和收藏数据，不可恢复</p>
          </div>
          <button
            class="btn-danger text-sm !px-4 !py-1.5 flex items-center gap-1 shrink-0"
            @click="confirmClear"
          >
            <font-awesome-icon icon="broom" />
            清除学习数据
          </button>
        </div>
      </div>
    </template>

    <!-- 确认对话框 -->
    <Teleport to="body">
      <div
        v-if="showClearDialog"
        class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        @click.self="showClearDialog = false"
      >
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
          <div class="flex items-center gap-3 mb-4">
            <font-awesome-icon icon="exclamation-triangle" class="text-3xl text-red-500" />
            <div>
              <h3 class="font-semibold text-gray-800">确认清除</h3>
              <p class="text-sm text-gray-500 mt-0.5">
                此操作将永久删除所有学习记录、错题和收藏数据，不可恢复。确定继续吗？
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost text-sm !px-4 !py-1.5" @click="showClearDialog = false">取消</button>
            <button class="btn-danger text-sm !px-4 !py-1.5" @click="doClear">确认清除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import API from '../api'

const loading = ref(true)
const showClearDialog = ref(false)
const stats = ref({})
const chapterStats = ref([])
const dailyStats = ref([])

// 7天内单日最多做题数，用于计算进度条最大宽度
const maxBarWidth = computed(() => {
  if (!dailyStats.value.length) return 0
  return Math.max(...dailyStats.value.map(d => d.total || 0), 1)
})

// 7天总做题数
const dailyTotal = computed(() => {
  return dailyStats.value.reduce((s, d) => s + (d.total || 0), 0)
})

onMounted(async () => {
  loading.value = true
  try {
    const [statsRes, chapterRes, dailyRes] = await Promise.all([
      API.getStudyStats(),
      API.getChapterStats(),
      API.getDailyStats(),
    ])
    stats.value = statsRes || {}
    chapterStats.value = chapterRes || []
    dailyStats.value = dailyRes || []
  } catch (e) {
    stats.value = {}
    chapterStats.value = []
    dailyStats.value = []
  } finally {
    loading.value = false
  }
})

function confirmClear() {
  showClearDialog.value = true
}

async function doClear() {
  try {
    await API.clearStudyData()
    stats.value = {}
    chapterStats.value = []
    dailyStats.value = []
    showClearDialog.value = false
  } catch (e) {
    alert('清除失败')
    showClearDialog.value = false
  }
}

function rateColor(rate) {
  if (rate >= 80) return 'text-green-500'
  if (rate >= 60) return 'text-yellow-500'
  return 'text-red-500'
}

function barColor(rate) {
  if (rate >= 80) return 'bg-green-500'
  if (rate >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatLabel(d) {
  if (!d) return ''
  const dayNames = ['日', '一', '二', '三', '四', '五', '六']
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) {
      const parts = d.split('-')
      if (parts.length === 3) return parts[1] + '/' + parts[2]
      return d
    }
    const m = date.getMonth() + 1
    const day = date.getDate()
    const wd = dayNames[date.getDay()]
    return m + '/' + day + '\n周' + wd
  } catch { return d }
}

</script>
