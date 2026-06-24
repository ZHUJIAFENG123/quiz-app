<template>
  <div class="max-w-3xl mx-auto px-4 py-6">
    <!-- 头部 -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <h1 class="text-xl font-bold text-gray-800 flex items-center gap-2">
        <font-awesome-icon icon="circle-xmark" class="text-red-500" />
        我的错题本
      </h1>
      <select
        v-model="subjectFilter"
        class="input w-full sm:w-44 text-sm"
        @change="loadData"
      >
        <option value="">全部科目</option>
        <option v-for="s in subjects" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>

    <!-- 操作栏 -->
    <div v-if="list.length > 0" class="flex flex-wrap items-center gap-3 mb-4">
      <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="isAllSelected"
          @change="toggleSelectAll"
          class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
        />
        全选
      </label>
      <button
        v-if="selectedIds.length > 0"
        class="btn-danger text-sm !px-3 !py-1.5 flex items-center gap-1"
        @click="batchRemove"
      >
        <font-awesome-icon icon="trash" />
        批量移除 ({{ selectedIds.length }})
      </button>
      <div class="flex-1"></div>
      <router-link
        to="/practice?source=wrong"
        class="btn-primary text-sm !px-4 !py-1.5 flex items-center gap-1"
      >
        <font-awesome-icon icon="pen-to-square" />
        重做错题
      </router-link>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="flex justify-center py-16">
      <div class="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full"></div>
    </div>

    <!-- 错题列表 -->
    <div v-else-if="list.length > 0" class="space-y-3">
      <div
        v-for="(item, idx) in list"
        :key="item.id"
        class="card border border-gray-100 hover:shadow-md transition-shadow"
      >
        <!-- 卡片头部 -->
        <div class="flex items-start gap-3">
          <input
            type="checkbox"
            :checked="selectedIds.includes(item.id)"
            @change="toggleSelect(item.id)"
            class="w-4 h-4 mt-1 text-primary-600 rounded border-gray-300 focus:ring-primary-500 shrink-0"
          />
          <div class="flex-1 min-w-0 cursor-pointer" @click="toggleExpand(item.id)">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-gray-400 font-mono">#{{ (currentPage - 1) * pageSize + idx + 1 }}</span>
              <span :class="['tag', getTypeClass(item.type)]">{{ getTypeLabel(item.type) }}</span>
              <span class="text-xs text-gray-400">{{ item.subject_name }}</span>
              <span class="text-xs text-gray-400">·</span>
              <span class="text-xs text-gray-400">{{ item.chapter_name }}</span>
            </div>
            <p class="text-sm text-gray-700 truncate">{{ item.content }}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span>
                <font-awesome-icon icon="circle-xmark" class="text-red-400 mr-1" />
                答错 {{ item.wrong_count }} 次
              </span>
              <span>
                <font-awesome-icon icon="calendar-day" class="mr-1" />
                {{ formatDate(item.last_wrong_at) }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="移除"
              @click="removeOne(item.id)"
            >
              <font-awesome-icon icon="trash" class="text-sm" />
            </button>
            <button
              :class="[
                'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                item.is_favorite
                  ? 'text-red-500 bg-red-50'
                  : 'text-gray-400 hover:text-red-400 hover:bg-red-50'
              ]"
              :title="item.is_favorite ? '取消收藏' : '收藏'"
              @click="toggleFav(item)"
            >
              <font-awesome-icon icon="heart" class="text-sm" />
            </button>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              @click="toggleExpand(item.id)"
            >
              <font-awesome-icon
                :icon="expandedId === item.id ? 'angle-up' : 'angle-down'"
                class="text-sm"
              />
            </button>
          </div>
        </div>

        <!-- 展开详情 -->
        <div v-if="expandedId === item.id" class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-sm text-gray-800 leading-relaxed mb-3">{{ item.content }}</p>
          <div class="space-y-1.5 mb-3">
            <div
              v-for="opt in getOptions(item)"
              :key="opt.key"
              :class="[
                'text-sm px-3 py-1.5 rounded-lg',
                opt.key === item.answer
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-gray-50 text-gray-600'
              ]"
            >
              <span class="font-medium mr-2">{{ opt.key }}.</span>{{ opt.value }}
            </div>
          </div>
          <div v-if="item.user_answer" class="text-sm mb-2">
            <span class="text-gray-500">你的答案：</span>
            <span :class="item.user_answer === item.answer ? 'text-green-600 font-medium' : 'text-red-500 font-medium'">
              {{ item.user_answer }}
              <font-awesome-icon
                :icon="item.user_answer === item.answer ? 'circle-check' : 'circle-xmark'"
                class="ml-1"
              />
            </span>
          </div>
          <div v-if="item.analysis" class="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-800">
            <span class="font-medium">解析：</span>{{ item.analysis }}
          </div>
          <!-- AI 解析 -->
          <div class="mt-2 pt-2 border-t border-gray-100">
            <button v-if="aiLoadingId !== item.id" @click="getAIAnalysis(item)" class="flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-700 font-medium">
              <font-awesome-icon icon="lightbulb" /> AI 深度解析
            </button>
            <div v-if="aiLoadingId === item.id" class="flex items-center gap-2 text-xs text-gray-400">
              <div class="animate-spin w-3 h-3 border border-yellow-500 border-t-transparent rounded-full"></div>
              AI正在分析...
            </div>
            <div v-if="aiContents[item.id]" class="bg-yellow-50 rounded-lg p-2.5 mt-1 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{{ aiContents[item.id] }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="text-center py-20">
      <font-awesome-icon icon="circle-check" class="text-6xl text-green-300 mb-4" />
      <p class="text-lg text-gray-500 font-medium">暂无错题，继续保持！</p>
      <p class="text-sm text-gray-400 mt-1">去练习或考试，答错的题目会出现在这里</p>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-1 mt-6">
      <button
        :disabled="currentPage <= 1"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        @click="goPage(currentPage - 1)"
      >
        <font-awesome-icon icon="chevron-left" />
      </button>
      <button
        v-for="p in visiblePages"
        :key="p"
        :class="[
          'w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors',
          p === currentPage
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 hover:bg-gray-100'
        ]"
        @click="goPage(p)"
      >
        {{ p }}
      </button>
      <button
        :disabled="currentPage >= totalPages"
        class="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        @click="goPage(currentPage + 1)"
      >
        <font-awesome-icon icon="chevron-right" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import API from '../api'

const loading = ref(false)
const list = ref([])
const subjects = ref([])
const subjectFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)
const totalPages = ref(0)
const expandedId = ref(null)
const selectedIds = ref([])

const isAllSelected = computed(() => {
  return list.value.length > 0 && selectedIds.value.length === list.value.length
})

const visiblePages = computed(() => {
  const pages = []
  const tp = totalPages.value
  const cp = currentPage.value
  let start = Math.max(1, cp - 2)
  let end = Math.min(tp, cp + 2)
  if (end - start < 4) {
    if (start === 1) end = Math.min(tp, start + 4)
    else start = Math.max(1, end - 4)
  }
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

onMounted(async () => {
  try {
    const res = await API.getSubjects()
    subjects.value = res || []
  } catch (e) { /* ignore */ }
  loadData()
})

async function loadData() {
  loading.value = true
  try {
    const params = { page: currentPage.value, pageSize }
    if (subjectFilter.value) params.subject_id = subjectFilter.value
    const data = await API.getWrongQuestions(params)
    list.value = data.list || []
    total.value = data.total || 0
    totalPages.value = data.totalPages || 0
    expandedId.value = null
    selectedIds.value = []
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = list.value.map(i => i.id)
  }
}

async function removeOne(id) {
  try {
    await API.removeWrongQuestion(id)
    // 删除后重新加载当前页，避免手动操作列表导致数据不一致
    await loadData()
  } catch (e) {
    alert('移除失败')
  }
}

async function batchRemove() {
  if (selectedIds.value.length === 0) return
  if (!confirm(`确定要移除选中的 ${selectedIds.value.length} 道错题吗？`)) return
  try {
    await API.batchRemoveWrongQuestions(selectedIds.value)
    const removedCount = selectedIds.value.length
    selectedIds.value = []
    // 如果当前页全部被选中移除，回到上一页
    if (removedCount >= list.value.length && currentPage.value > 1) {
      currentPage.value--
    }
    await loadData()
  } catch (e) {
    alert('批量移除失败')
  }
}

async function toggleFav(item) {
  try {
    await API.toggleFavorite(item.id)
    item.is_favorite = !item.is_favorite
  } catch (e) {
    alert('操作失败')
  }
}

function goPage(p) {
  if (p < 1 || p > totalPages.value || p === currentPage.value) return
  currentPage.value = p
  loadData()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// AI 解析
const aiLoadingId = ref(null)
const aiContents = reactive({})

async function getAIAnalysis(item) {
  if (aiLoadingId.value) return
  aiLoadingId.value = item.id
  try {
    const res = await API.aiQuickAnalyze(item.question_id || item.id, item.user_answer || '')
    aiContents[item.id] = res.content
  } catch {
    aiContents[item.id] = 'AI解析暂时不可用，请稍后再试'
  } finally {
    aiLoadingId.value = null
  }
}

function getTypeLabel(type) {
  const map = { '单选': '单选', '多选': '多选', '判断': '判断' }
  return map[type] || type
}

function getTypeClass(type) {
  const map = { '单选': 'tag-single', '多选': 'tag-multi', '判断': 'tag-judge' }
  return map[type] || ''
}

function getOptions(item) {
  const opts = []
  if (item.option_a) opts.push({ key: 'A', value: item.option_a })
  if (item.option_b) opts.push({ key: 'B', value: item.option_b })
  if (item.option_c) opts.push({ key: 'C', value: item.option_c })
  if (item.option_d) opts.push({ key: 'D', value: item.option_d })
  return opts
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>
