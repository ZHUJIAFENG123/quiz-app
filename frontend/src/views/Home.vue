<template>
  <div class="max-w-lg mx-auto px-4 py-6 space-y-6">
    <!-- 欢迎标题 -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-800">刷题宝典</h1>
      <router-link to="/stats" class="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
        <font-awesome-icon icon="chart-line" />
        学习统计
      </router-link>
    </div>

    <!-- 未登录提示 -->
    <div v-if="!currentUser" class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700 flex items-center gap-2">
      <font-awesome-icon icon="circle-info" class="text-blue-500" />
      <span>未登录状态下数据是共享的，建议<router-link to="/login" class="font-medium underline">登录</router-link>以保存个人数据</span>
    </div>

    <!-- 学习统计卡片 -->
    <div class="grid grid-cols-3 gap-3">
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary-600">{{ stats.total_questions ?? '-' }}</div>
        <div class="text-xs text-gray-500 mt-1">题库总数</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-blue-500">{{ stats.total_study ?? '-' }}</div>
        <div class="text-xs text-gray-500 mt-1">已学题目</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-green-500">{{ stats.accuracy != null ? stats.accuracy + '%' : '-' }}</div>
        <div class="text-xs text-gray-500 mt-1">正确率</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-red-500">{{ stats.wrong_count ?? '-' }}</div>
        <div class="text-xs text-gray-500 mt-1">错题数</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-orange-500">{{ stats.favorite_count ?? '-' }}</div>
        <div class="text-xs text-gray-500 mt-1">收藏数</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-purple-500">{{ stats.today_count ?? 0 }}</div>
        <div class="text-xs text-gray-500 mt-1">今日已练</div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div>
      <h2 class="text-lg font-semibold text-gray-800 mb-3">快速开始</h2>
      <div class="grid grid-cols-2 gap-3">
        <button
          @click="goPractice('sequential')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-blue-500"
        >
          <font-awesome-icon icon="list-check" class="text-blue-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">顺序练习</div>
          <div class="text-xs text-gray-400 mt-0.5">按章节顺序逐题练习</div>
        </button>
        <button
          @click="goPractice('random')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-purple-500"
        >
          <font-awesome-icon icon="shuffle" class="text-purple-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">随机练习</div>
          <div class="text-xs text-gray-400 mt-0.5">随机抽取题目练习</div>
        </button>
        <button
          @click="$router.push('/exam')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-orange-500"
        >
          <font-awesome-icon icon="file-pen" class="text-orange-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">模拟考试</div>
          <div class="text-xs text-gray-400 mt-0.5">限时模拟真实考试</div>
        </button>
        <button
          @click="$router.push('/wrong')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-red-500"
        >
          <font-awesome-icon icon="circle-xmark" class="text-red-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">错题本</div>
          <div class="text-xs text-gray-400 mt-0.5">回顾所有错题记录</div>
        </button>
        <button
          @click="$router.push('/favorites')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-pink-500"
        >
          <font-awesome-icon icon="heart" class="text-pink-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">收藏夹</div>
          <div class="text-xs text-gray-400 mt-0.5">查看收藏的题目</div>
        </button>
        <button
          @click="$router.push('/stats')"
          class="card text-left hover:shadow-md transition-shadow border-l-4 border-teal-500"
        >
          <font-awesome-icon icon="chart-bar" class="text-teal-500 text-xl mb-2" />
          <div class="font-medium text-gray-800 text-sm">学习统计</div>
          <div class="text-xs text-gray-400 mt-0.5">查看详细学习数据</div>
        </button>
      </div>
    </div>

    <!-- 科目/章节浏览 -->
    <div>
      <h2 class="text-lg font-semibold text-gray-800 mb-3">题库浏览</h2>
      <div v-if="subjects.length === 0" class="card text-center text-gray-400 py-8">
        <font-awesome-icon icon="book" class="text-4xl mb-2 opacity-30" />
        <p>暂无科目数据</p>
      </div>
      <div v-for="subject in subjects" :key="subject.id" class="card mb-3 overflow-hidden">
        <button
          class="w-full flex items-center justify-between p-1"
          @click="toggleSubject(subject.id)"
        >
          <div class="flex items-center gap-3">
            <font-awesome-icon icon="book" class="text-primary-600" />
            <span class="font-medium text-gray-800">{{ subject.name }}</span>
          </div>
          <font-awesome-icon
            :icon="expandedSubject === subject.id ? 'angle-up' : 'angle-down'"
            class="text-gray-400 transition-transform"
          />
        </button>
        <div v-if="expandedSubject === subject.id" class="mt-3 pt-3 border-t border-gray-100">
          <div v-if="subjectChaptersLoading[subject.id]" class="text-center text-gray-400 text-sm py-3">
            加载中...
          </div>
          <div v-else-if="subjectChapters[subject.id]?.length === 0" class="text-center text-gray-400 text-sm py-3">
            暂无章节
          </div>
          <router-link
            v-for="chapter in subjectChapters[subject.id]"
            :key="chapter.id"
            :to="`/practice?subject_id=${subject.id}&chapter_id=${chapter.id}`"
            class="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center gap-2">
              <font-awesome-icon icon="layer-group" class="text-gray-300 text-xs" />
              <span class="text-sm text-gray-700">{{ chapter.name }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <span v-if="chapter.single_count" class="tag tag-single">{{ chapter.single_count }}单选</span>
              <span v-if="chapter.multi_count" class="tag tag-multi">{{ chapter.multi_count }}多选</span>
              <span v-if="chapter.judge_count" class="tag tag-judge">{{ chapter.judge_count }}判断</span>
              <font-awesome-icon icon="chevron-right" class="text-gray-300" />
            </div>
          </router-link>
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

const stats = reactive({
  total_questions: 0,
  total_study: 0,
  accuracy: null,
  wrong_count: 0,
  favorite_count: 0,
  today_count: 0
})

const subjects = ref([])
const expandedSubject = ref(null)
const subjectChapters = reactive({})
const subjectChaptersLoading = reactive({})

onMounted(async () => {
  try {
    const data = await API.getStudyStats()
    Object.assign(stats, data)
  } catch { /* 静默失败 */ }

  try {
    const data = await API.getSubjects()
    subjects.value = data || []
  } catch { /* 静默失败 */ }
})

function goPractice(mode) {
  router.push({ path: '/practice', query: { mode } })
}

async function toggleSubject(subjectId) {
  if (expandedSubject.value === subjectId) {
    expandedSubject.value = null
    return
  }
  expandedSubject.value = subjectId
  if (subjectChapters[subjectId]) return

  subjectChaptersLoading[subjectId] = true
  try {
    const chapters = await API.getChapters({ subject_id: subjectId })
    subjectChapters[subjectId] = chapters || []
    // 获取每个章节的题目数量
    for (const ch of subjectChapters[subjectId]) {
      try {
        const counts = await API.getChapterQuestionCount(ch.id)
        if (counts) {
          ch.single_count = counts.single_count ?? 0
          ch.multi_count = counts.multi_count ?? 0
          ch.judge_count = counts.judge_count ?? 0
        }
      } catch { /* 跳过 */ }
    }
  } catch {
    subjectChapters[subjectId] = []
  } finally {
    subjectChaptersLoading[subjectId] = false
  }
}
</script>
