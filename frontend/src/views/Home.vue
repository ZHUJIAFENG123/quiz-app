<template>
  <div class="max-w-lg mx-auto space-y-5 pb-6">
    <!-- ===== Hero 区域 ===== -->
    <div class="bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 text-white px-5 pt-8 pb-10 rounded-b-3xl shadow-lg">
      <div class="flex items-center justify-between mb-5">
        <div>
          <p class="text-primary-200 text-sm mb-1">
            {{ greeting }}
          </p>
          <h1 class="text-xl font-bold">{{ currentUser ? (currentUser.nickname || currentUser.username) : '同学' }}，开始学习吧</h1>
        </div>
        <div class="relative">
          <svg class="w-16 h-16 transform -rotate-90">
            <circle cx="50%" cy="50%" r="42%" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="5" />
            <circle cx="50%" cy="50%" r="42%" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"
              :stroke-dasharray="ringLen" :stroke-dashoffset="ringLen - ringLen * ringPercent"
              class="transition-all duration-700" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-base font-bold">{{ stats.today_count || 0 }}</span>
            <span class="text-[9px] text-white/70">今日</span>
          </div>
        </div>
      </div>

      <!-- 小统计 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white/15 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
          <p class="text-lg font-bold">{{ stats.total_questions ?? '-' }}</p>
          <p class="text-[10px] text-white/60">题库总数</p>
        </div>
        <div class="bg-white/15 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
          <p class="text-lg font-bold text-green-300">{{ stats.accuracy != null ? stats.accuracy + '%' : '-' }}</p>
          <p class="text-[10px] text-white/60">正确率</p>
        </div>
        <div class="bg-white/15 rounded-xl px-3 py-2.5 text-center backdrop-blur-sm">
          <p class="text-lg font-bold text-amber-300">{{ stats.wrong_count ?? '-' }}</p>
          <p class="text-[10px] text-white/60">错题数</p>
        </div>
      </div>
    </div>

    <div class="px-4 -mt-4 space-y-5">
      <!-- ===== 未登录提示 ===== -->
      <div v-if="!currentUser" class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
        <font-awesome-icon icon="circle-info" class="text-amber-500 shrink-0" />
        <span>登录后保存学习进度，<router-link to="/login" class="font-semibold underline">点此登录</router-link></span>
      </div>

      <!-- ===== 探案故事推荐 ===== -->
      <div v-if="cases.length > 0" class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-4 pt-4 pb-3">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
              <font-awesome-icon icon="scale-balanced" class="text-amber-600 text-sm" />
            </div>
            <h2 class="text-sm font-bold text-gray-800">法海探案</h2>
          </div>
          <router-link to="/adventure" class="text-xs text-primary-600 hover:text-primary-700 font-medium">
            全部 <font-awesome-icon icon="chevron-right" class="text-[10px] ml-0.5" />
          </router-link>
        </div>
        <div class="overflow-x-auto pb-3">
          <div class="flex gap-3 px-4" style="min-width: max-content;">
            <div v-for="c in topCases" :key="c.id"
              @click="$router.push('/adventure')"
              class="w-40 shrink-0 rounded-xl p-3 border border-gray-100 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer active:scale-[0.97]"
              :class="c.completed ? 'bg-green-50/50' : 'bg-white'">
              <span :class="['tag mb-2', c.category === '刑法' ? 'tag-judge' : 'tag-single']">{{ c.category }}</span>
              <h3 class="text-xs font-semibold text-gray-800 line-clamp-2 mb-2">{{ c.title }}</h3>
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-gray-400">{{ c.totalScenes }} 关 {{ '⭐'.repeat(c.difficulty) }}</span>
                <span v-if="c.completed" class="text-green-600 text-xs">✓ 已破</span>
                <span v-else class="text-primary-600 text-xs">去探案</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 学习工具区 ===== -->
      <div class="bg-white rounded-2xl shadow-sm px-4 py-4">
        <h2 class="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <font-awesome-icon icon="pen-to-square" class="text-primary-600 text-xs" />
          刷题备考
        </h2>
        <div class="grid grid-cols-3 gap-3">
          <button @click="goPractice('sequential')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="list-check" class="text-blue-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">顺序练习</span>
          </button>
          <button @click="goPractice('random')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="shuffle" class="text-purple-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">随机练习</span>
          </button>
          <button @click="$router.push('/exam')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="file-pen" class="text-orange-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">模拟考试</span>
          </button>
          <button @click="$router.push('/wrong')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="circle-xmark" class="text-red-500" />
            </div>
            <span class="text-xs text-gray-700 font-medium">错题本</span>
          </button>
          <button @click="$router.push('/favorites')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="heart" class="text-pink-500" />
            </div>
            <span class="text-xs text-gray-700 font-medium">收藏夹</span>
          </button>
          <button @click="$router.push('/stats')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="chart-bar" class="text-teal-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">学习报表</span>
          </button>
          <button @click="$router.push('/knowledge-graph')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="share" class="text-indigo-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">知识图谱</span>
          </button>
          <button @click="$router.push('/exam?mode=smart')" class="tool-card group">
            <div class="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <font-awesome-icon icon="lightbulb" class="text-violet-600" />
            </div>
            <span class="text-xs text-gray-700 font-medium">AI组卷</span>
          </button>
        </div>
      </div>

      <!-- ===== 题库浏览 ===== -->
      <div class="bg-white rounded-2xl shadow-sm px-4 py-4">
        <h2 class="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <font-awesome-icon icon="book" class="text-primary-600 text-xs" />
          题库浏览
        </h2>
        <div v-if="subjects.length === 0" class="text-center text-gray-400 py-6 text-sm">暂无科目</div>
        <div v-for="subject in subjects" :key="subject.id" class="mb-2 last:mb-0">
          <button class="w-full flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
            @click="toggleSubject(subject.id)">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <font-awesome-icon icon="book" class="text-primary-600 text-xs" />
              </div>
              <span class="text-sm font-medium text-gray-700">{{ subject.name }}</span>
            </div>
            <font-awesome-icon :icon="expandedSubject === subject.id ? 'angle-up' : 'angle-down'" class="text-gray-400 text-xs" />
          </button>
          <div v-if="expandedSubject === subject.id" class="ml-2 pl-8 pr-3 pb-2 border-l-2 border-primary-100">
            <div v-if="subjectChaptersLoading[subject.id]" class="text-xs text-gray-400 py-2">加载中...</div>
            <div v-else-if="subjectChapters[subject.id]?.length === 0" class="text-xs text-gray-400 py-2">暂无章节</div>
            <router-link v-for="chapter in subjectChapters[subject.id]" :key="chapter.id"
              :to="`/practice?subject_id=${subject.id}&chapter_id=${chapter.id}`"
              class="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors">
              <span class="text-sm text-gray-600">{{ chapter.name }}</span>
              <div class="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span v-if="chapter.single_count" class="tag tag-single !text-[10px]">{{ chapter.single_count }}单选</span>
                <span v-if="chapter.multi_count" class="tag tag-multi !text-[10px]">{{ chapter.multi_count }}多选</span>
                <span v-if="chapter.judge_count" class="tag tag-judge !text-[10px]">{{ chapter.judge_count }}判断</span>
                <font-awesome-icon icon="chevron-right" class="text-gray-300 ml-1" />
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import API from '../api'

const router = useRouter()

const currentUser = computed(() => {
  try { return !!localStorage.getItem('quiz_token') } catch { return false }
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '早上好 ☀️'
  if (h < 18) return '下午好 🌤️'
  return '晚上好 🌙'
})

const ringLen = 2 * Math.PI * 42
const ringPercent = computed(() => {
  if (!stats.today_count) return 0.1
  return Math.min(stats.today_count / 50, 1)
})

const stats = reactive({
  total_questions: 0, total_study: 0, accuracy: null,
  wrong_count: 0, favorite_count: 0, today_count: 0
})

const subjects = ref([])
const expandedSubject = ref(null)
const subjectChapters = reactive({})
const subjectChaptersLoading = reactive({})
const cases = ref([])

const topCases = computed(() => {
  if (cases.value.length === 0) return []
  return [...cases.value].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return a.difficulty - b.difficulty
  }).slice(0, 4)
})

onMounted(async () => {
  try { Object.assign(stats, await API.getStudyStats()) } catch {}
  try { subjects.value = await API.getSubjects() || [] } catch {}
  try { cases.value = await API.getCases() || [] } catch {}
})

function goPractice(mode) {
  router.push({ path: '/practice', query: { mode } })
}

async function toggleSubject(subjectId) {
  if (expandedSubject.value === subjectId) { expandedSubject.value = null; return }
  expandedSubject.value = subjectId
  if (subjectChapters[subjectId]) return
  subjectChaptersLoading[subjectId] = true
  try {
    const chapters = await API.getChapters({ subject_id: subjectId })
    subjectChapters[subjectId] = chapters || []
    try {
      const counts = await API.getChapterCounts({ subject_id: subjectId })
      if (counts) {
        for (const ch of subjectChapters[subjectId]) {
          const c = counts[ch.id]
          if (c) { ch.single_count = c.single_count ?? 0; ch.multi_count = c.multi_count ?? 0; ch.judge_count = c.judge_count ?? 0 }
        }
      }
    } catch {}
  } catch { subjectChapters[subjectId] = [] }
  finally { subjectChaptersLoading[subjectId] = false }
}
</script>

<style scoped>
.tool-card {
  @apply flex flex-col items-center py-2 rounded-xl hover:bg-gray-50 transition-colors;
}
</style>
