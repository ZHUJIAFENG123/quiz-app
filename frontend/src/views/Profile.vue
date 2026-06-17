<template>
  <div class="max-w-2xl mx-auto px-4 py-6">
    <!-- 用户信息卡片 -->
    <div class="card mb-6 text-center">
      <img src="/mascot.png" alt="小助手" class="w-16 h-16 rounded-full object-cover mx-auto mb-3 shadow-md" />
      <h2 class="text-lg font-bold text-gray-800">{{ user?.nickname || user?.username || '未登录' }}</h2>
      <p class="text-xs text-gray-400 mt-1">@{{ user?.username || '--' }}</p>
      <p class="text-xs text-gray-400">注册于 {{ formatDate(user?.created_at) }}</p>
    </div>

    <!-- 快捷入口 -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <router-link to="/favorites" class="card text-center py-3 hover:shadow-md transition-shadow">
        <font-awesome-icon icon="heart" class="text-pink-500 text-xl mb-1" />
        <p class="text-xs text-gray-600">收藏夹</p>
      </router-link>
      <router-link to="/wrong" class="card text-center py-3 hover:shadow-md transition-shadow">
        <font-awesome-icon icon="circle-xmark" class="text-orange-500 text-xl mb-1" />
        <p class="text-xs text-gray-600">错题本</p>
      </router-link>
      <button @click="doLogout" class="card text-center py-3 hover:shadow-md transition-shadow">
        <font-awesome-icon icon="arrow-right-from-bracket" class="text-red-400 text-xl mb-1" />
        <p class="text-xs text-gray-600">退出登录</p>
      </button>
    </div>

    <!-- 学习统计 -->
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <font-awesome-icon icon="chart-bar" class="text-primary-600" />
        学习统计
        <router-link to="/stats" class="text-xs text-primary-500 font-normal ml-auto">查看详情</router-link>
      </h3>

      <!-- 加载中 -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full"></div>
      </div>

      <template v-else>
        <!-- 概览卡片 -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div class="card text-center !p-2">
            <p class="text-xl font-bold text-gray-800">{{ stats.total_study || 0 }}</p>
            <p class="text-xs text-gray-400">总做题数</p>
          </div>
          <div class="card text-center !p-2">
            <p class="text-xl font-bold" :class="rateColor(stats.accuracy || 0)">{{ stats.accuracy || 0 }}%</p>
            <p class="text-xs text-gray-400">正确率</p>
          </div>
          <div class="card text-center !p-2">
            <p class="text-xl font-bold text-gray-800">{{ stats.wrong_count || 0 }}</p>
            <p class="text-xs text-gray-400">错题数</p>
          </div>
          <div class="card text-center !p-2">
            <p class="text-xl font-bold text-gray-800">{{ stats.favorite_count || 0 }}</p>
            <p class="text-xs text-gray-400">收藏数</p>
          </div>
        </div>

        <!-- 章节正确率 -->
        <div v-if="chapterStats.length > 0" class="card mb-4">
          <h4 class="text-xs font-semibold text-gray-600 mb-2">章节正确率</h4>
          <div class="space-y-2">
            <div v-for="ch in chapterStats.slice(0, 5)" :key="ch.id">
              <div class="flex items-center justify-between text-xs mb-0.5">
                <span class="text-gray-500 truncate max-w-[60%]">{{ ch.subject_name }} · {{ ch.name }}</span>
                <span :class="['font-medium', rateColor(ch.accuracy)]">{{ ch.accuracy }}%</span>
              </div>
              <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div :class="['h-full rounded-full', barColor(ch.accuracy)]"
                  :style="{ width: Math.max(ch.accuracy, 3) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 最近7天 -->
        <div v-if="dailyStats.length > 0" class="card">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-semibold text-gray-600">7天趋势</h4>
            <span class="text-xs text-gray-300">共 {{ dailyTotal }} 题</span>
          </div>
          <div class="space-y-1.5">
            <div v-for="(d, i) in dailyStats" :key="i" class="flex items-center gap-2">
              <span class="text-xs text-gray-400 w-12 flex-shrink-0 text-right">{{ formatDay(d.date) }}</span>
              <div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden relative">
                <div v-if="(d.correct || 0) > 0" class="absolute inset-y-0 left-0 bg-primary-600 rounded-l-full"
                  :class="(d.total || 0) - (d.correct || 0) === 0 ? 'rounded-r-full' : ''"
                  :style="{ width: dayMax > 0 ? ((d.correct || 0) / dayMax * 100) + '%' : '0%' }"></div>
                <div v-if="(d.total || 0) - (d.correct || 0) > 0" class="absolute inset-y-0 bg-red-300"
                  :class="(d.correct || 0) === 0 ? 'rounded-l-full rounded-r-full' : 'rounded-r-full'"
                  :style="{ left: dayMax > 0 ? ((d.correct || 0) / dayMax * 100) + '%' : '0%', width: dayMax > 0 ? (((d.total || 0) - (d.correct || 0)) / dayMax * 100) + '%' : '0%' }"></div>
              </div>
              <span class="text-xs text-gray-500 w-10 flex-shrink-0 font-mono text-right">
                {{ d.correct || 0 }}/{{ d.total || 0 }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import API from '../api'

const user = ref(null)
const loading = ref(true)
const stats = ref({})
const chapterStats = ref([])
const dailyStats = ref([])

const dailyTotal = computed(() => dailyStats.value.reduce((s, d) => s + (d.total || 0), 0))
const dayMax = computed(() => Math.max(...dailyStats.value.map(d => d.total || 0), 1))

onMounted(async () => {
  try {
    const u = localStorage.getItem('quiz_user')
    user.value = u ? JSON.parse(u) : null
  } catch { user.value = null }

  loading.value = true
  try {
    const [s, ch, dy] = await Promise.all([
      API.getStudyStats().catch(() => ({})),
      API.getChapterStats().catch(() => []),
      API.getDailyStats().catch(() => [])
    ])
    stats.value = s
    chapterStats.value = ch
    dailyStats.value = dy
  } catch { /* 静默 */ }
  loading.value = false
})

function formatDate(d) { if (!d) return '--'; return new Date(d).toLocaleDateString('zh-CN') }
function formatDay(d) { const dt = new Date(d); return `${dt.getMonth()+1}/${dt.getDate()}` }
function rateColor(r) { if (r >= 80) return 'text-green-600'; if (r >= 60) return 'text-yellow-600'; return 'text-red-500' }
function barColor(r) { if (r >= 80) return 'bg-green-500'; if (r >= 60) return 'bg-yellow-500'; return 'bg-red-400' }

function doLogout() {
  localStorage.removeItem('quiz_token')
  localStorage.removeItem('quiz_user')
  window.location.href = '/'
}
</script>
