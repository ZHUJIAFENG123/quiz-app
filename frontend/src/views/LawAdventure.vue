<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- 顶部栏 -->
    <header class="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
      <router-link to="/" class="text-gray-400 hover:text-gray-600">
        <font-awesome-icon icon="arrow-left" />
      </router-link>
      <h1 class="text-lg font-bold text-gray-800">法海探案</h1>
      <span v-if="activeCase" class="ml-auto text-xs text-gray-400">{{ activeCase.category }}</span>
    </header>

    <!-- 案件列表 -->
    <main v-if="!activeCase" class="flex-1 overflow-y-auto p-4">
      <div class="text-center mb-6">
        <font-awesome-icon icon="scale-balanced" class="text-4xl text-primary-600 mb-2" />
        <h2 class="text-lg font-bold text-gray-800">法海探案</h2>
        <p class="text-sm text-gray-500">化身侦探，在真实案件改编中学习法律知识</p>
      </div>

      <!-- 分类筛选 -->
      <div class="flex gap-2 mb-4 overflow-x-auto">
        <button v-for="cat in categories" :key="cat"
          @click="filterCategory = cat === filterCategory ? '' : cat"
          :class="['px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
            filterCategory === cat ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300']">
          {{ cat }}
        </button>
      </div>

      <!-- 加载 -->
      <div v-if="loading" class="text-center py-12 text-gray-400">
        <font-awesome-icon icon="refresh" spin class="text-3xl mb-3" />
        <p>加载案件列表...</p>
      </div>

      <!-- 案件卡片 -->
      <div v-else class="space-y-3">
        <div v-for="c in filteredCases" :key="c.id"
          @click="openCase(c.id)"
          class="card border border-gray-100 hover:shadow-md transition-all cursor-pointer active:scale-[0.98]">
          <div class="flex items-start gap-3">
            <!-- 状态图标 -->
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :class="c.completed ? 'bg-green-100' : 'bg-primary-50'">
              <font-awesome-icon
                :icon="c.completed ? 'circle-check' : (c.currentScene > 0 ? 'circle-half-stroke' : 'play')"
                :class="c.completed ? 'text-green-600' : 'text-primary-600'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span :class="['tag', c.category === '刑法' ? 'tag-judge' : 'tag-single']">{{ c.category }}</span>
                <span class="text-xs text-gray-400">{{ '⭐'.repeat(c.difficulty) }}</span>
              </div>
              <h3 class="text-sm font-semibold text-gray-800">{{ c.title }}</h3>
              <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ c.description }}</p>
              <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{{ c.totalScenes }} 个关卡</span>
                <span v-if="c.completed" class="text-green-600 font-medium">✓ 已侦破 {{ c.score }}/{{ c.totalScenes }}</span>
                <span v-else-if="c.currentScene > 0" class="text-primary-600">进度 {{ c.currentScene }}/{{ c.totalScenes }}</span>
              </div>
            </div>
            <font-awesome-icon icon="chevron-right" class="text-gray-300 mt-3 shrink-0" />
          </div>
        </div>
        <div v-if="filteredCases.length === 0" class="text-center py-8 text-gray-400">暂无此类案件</div>
      </div>
    </main>

    <!-- 案件进行中 -->
    <main v-else class="flex-1 overflow-y-auto p-4 pb-6">
      <!-- 进度条 -->
      <div class="flex items-center gap-2 mb-4">
        <div class="flex-1 bg-gray-200 rounded-full h-1.5">
          <div class="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
            :style="{ width: (caseData.currentScene / caseData.totalScenes * 100) + '%' }"></div>
        </div>
        <span class="text-xs text-gray-400 font-mono">{{ caseData.currentScene }}/{{ caseData.totalScenes }}</span>
        <span class="text-xs font-bold text-primary-600">{{ caseData.score }}分</span>
      </div>

      <!-- 已完成 - 案件报告卡 -->
      <template v-if="caseData.completed">
        <div class="text-center py-4">
          <div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-3"
            :class="completionGrade.class">
            <font-awesome-icon :icon="completionGrade.icon" class="text-3xl" />
          </div>
          <h3 class="text-lg font-bold text-gray-800">{{ completionGrade.title }}</h3>
          <p class="text-sm text-gray-500 mt-1">{{ completionGrade.desc }}</p>
          <div class="mt-3 text-2xl font-bold text-primary-600">{{ caseData.score }} / {{ caseData.totalScenes }}</div>
          <p class="text-xs text-gray-400">正确率 {{ Math.round(caseData.score / caseData.totalScenes * 100) }}%</p>
        </div>

        <!-- 回顾选择 -->
        <div class="mt-4 space-y-3">
          <h4 class="text-sm font-semibold text-gray-700">案情回顾</h4>
          <div v-for="(pc, i) in caseData.previousChoices" :key="i"
            :class="['p-3 rounded-lg border text-sm', pc.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200']">
            <div class="flex items-center gap-2 mb-1">
              <font-awesome-icon :icon="pc.isCorrect ? 'circle-check' : 'circle-xmark'"
                :class="pc.isCorrect ? 'text-green-600' : 'text-red-500'" />
              <span class="font-medium" :class="pc.isCorrect ? 'text-green-700' : 'text-red-700'">第{{ i + 1 }}关 · 选择{{ pc.choice }}</span>
            </div>
            <p class="text-xs" :class="pc.isCorrect ? 'text-green-600' : 'text-red-500'">{{ pc.feedback }}</p>
            <p v-if="pc.lawRef" class="text-xs mt-1 text-gray-400">{{ pc.lawRef }}</p>
          </div>
        </div>

        <div class="flex gap-3 mt-4">
          <button @click="resetCase" class="btn-ghost flex-1 text-sm">
            <font-awesome-icon icon="rotate-left" class="mr-1" />
            重新探案
          </button>
          <button @click="activeCase = null" class="btn-primary flex-1 text-sm">
            <font-awesome-icon icon="list-check" class="mr-1" />
            返回列表
          </button>
        </div>
      </template>

      <!-- 案件内容 -->
      <template v-else-if="caseData.scene">
        <!-- 剧情叙述 -->
        <div class="card border-l-4 border-l-primary-500 mb-4">
          <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{{ caseData.scene.narrative }}</p>
        </div>

        <!-- 问题 -->
        <h3 class="text-sm font-semibold text-gray-800 mb-3">{{ caseData.scene.question }}</h3>

        <!-- 选项 -->
        <div class="space-y-2">
          <button v-for="opt in caseData.scene.choices" :key="opt.key"
            @click="judge(opt.key)"
            :disabled="judging"
            :class="['w-full p-3 rounded-lg border-2 text-left transition-all',
              judgedKey && judgedKey === opt.key
                ? (judgeResult?.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50')
                : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50',
              judging ? 'opacity-60' : '']">
            <div class="flex items-center gap-3">
              <span :class="['w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0',
                judgedKey && judgedKey === opt.key
                  ? (judgeResult?.isCorrect ? 'border-green-500 bg-green-500 text-white' : 'border-red-500 bg-red-500 text-white')
                  : 'border-gray-300 text-gray-500']">
                {{ opt.key }}
              </span>
              <span class="text-sm">{{ opt.text }}</span>
            </div>
          </button>
        </div>

        <!-- 判定结果 + 反馈 -->
        <div v-if="judgeResult" :class="['mt-4 p-4 rounded-lg border', judgeResult.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200']">
          <div class="flex items-center gap-2 mb-2">
            <font-awesome-icon :icon="judgeResult.isCorrect ? 'circle-check' : 'circle-xmark'"
              :class="judgeResult.isCorrect ? 'text-green-600 text-xl' : 'text-red-500 text-xl'" />
            <span class="font-bold" :class="judgeResult.isCorrect ? 'text-green-700' : 'text-red-700'">
              {{ judgeResult.isCorrect ? '判断正确！' : '判断有误' }}
            </span>
          </div>
          <p class="text-sm" :class="judgeResult.isCorrect ? 'text-green-600' : 'text-red-500'">{{ judgeResult.feedback }}</p>
          <p v-if="judgeResult.lawRef" class="text-xs mt-1.5 text-gray-400 flex items-center gap-1">
            <font-awesome-icon icon="scale-balanced" class="text-xs" />
            {{ judgeResult.lawRef }}
          </p>
          <button @click="nextScene"
            class="btn-primary text-sm !py-1.5 !px-4 mt-3">
            {{ judgeResult.completed ? '查看报告' : '继续探案' }}
            <font-awesome-icon icon="arrow-right" class="ml-1 text-xs" />
          </button>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import API from '../api'

const loading = ref(true)
const cases = ref([])
const filterCategory = ref('')
const categories = ['刑法', '民法', '行政法']
const activeCase = ref(null)
const caseData = reactive({
  id: null, title: '', category: '', difficulty: 1,
  totalScenes: 0, currentScene: 0, score: 0, completed: false,
  scene: null, previousChoices: []
})
const judging = ref(false)
const judgeResult = ref(null)
const judgedKey = ref(null)

const filteredCases = computed(() => {
  if (!filterCategory.value) return cases.value
  return cases.value.filter(c => c.category === filterCategory.value)
})

const completionGrade = computed(() => {
  const rate = caseData.totalScenes > 0 ? caseData.score / caseData.totalScenes : 0
  if (rate === 1) return { class: 'bg-yellow-100 text-yellow-600', icon: 'crown', title: '完美侦破！', desc: '全部正确，你已经是一名优秀的法律人了' }
  if (rate >= 0.75) return { class: 'bg-green-100 text-green-600', icon: 'medal', title: '接近真相', desc: '大部分判断正确，再练练就能满分' }
  if (rate >= 0.5) return { class: 'bg-blue-100 text-blue-600', icon: 'circle-check', title: '调查中', desc: '还需要更多证据和推理' }
  return { class: 'bg-gray-100 text-gray-600', icon: 'circle-question', title: '继续努力', desc: '多读法条，下次一定能破案' }
})

onMounted(async () => {
  try { cases.value = await API.getCases() || [] } catch {}
  loading.value = false
})

async function openCase(id) {
  judging.value = false
  judgeResult.value = null
  judgedKey.value = null
  try {
    const data = await API.getCaseDetail(id)
    Object.assign(caseData, data)
    activeCase.value = id
  } catch { /* 静默 */ }
}

async function judge(choice) {
  if (judging.value || judgeResult.value) return
  judging.value = true
  judgedKey.value = choice
  try {
    const res = await API.judgeCase(activeCase.value, choice)
    judgeResult.value = res
    caseData.score = res.score
    caseData.currentScene = res.currentScene
    caseData.completed = res.completed
  } catch { /* 静默 */ }
  judging.value = false
}

async function nextScene() {
  if (caseData.completed) {
    // 重新加载完整数据（含 previousChoices）
    const data = await API.getCaseDetail(activeCase.value)
    Object.assign(caseData, data)
  } else {
    judgeResult.value = null
    judgedKey.value = null
    const data = await API.getCaseDetail(activeCase.value)
    Object.assign(caseData, data)
  }
}

async function resetCase() {
  try {
    await API.resetCase(activeCase.value)
    judgeResult.value = null
    judgedKey.value = null
    const data = await API.getCaseDetail(activeCase.value)
    Object.assign(caseData, data)
  } catch {}
}
</script>
