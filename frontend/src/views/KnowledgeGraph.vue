<template>
  <div class="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-6">
    <h1 class="text-xl font-bold text-gray-800 mb-4">知识图谱</h1>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-4 gap-2 mb-4" v-if="stats">
      <div class="card text-center py-2">
        <div class="text-lg font-bold text-indigo-600">{{ stats.subjects }}</div>
        <div class="text-[10px] text-gray-500">科目</div>
      </div>
      <div class="card text-center py-2">
        <div class="text-lg font-bold text-purple-600">{{ stats.chapters }}</div>
        <div class="text-[10px] text-gray-500">章节</div>
      </div>
      <div class="card text-center py-2">
        <div class="text-lg font-bold text-cyan-600">{{ stats.keywords }}</div>
        <div class="text-[10px] text-gray-500">考点</div>
      </div>
      <div class="card text-center py-2">
        <div class="text-lg font-bold text-amber-600">{{ stats.totalEdges }}</div>
        <div class="text-[10px] text-gray-500">关联</div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
      <button
        v-for="f in filters"
        :key="f.key"
        @click="toggleFilter(f.key)"
        :class="[
          'px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors',
          activeFilters.has(f.key)
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-200 text-gray-500 hover:border-gray-300'
        ]"
      >{{ f.label }}</button>
      <div class="flex-1" />
      <button @click="loadGraph" class="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1">
        <font-awesome-icon icon="refresh" :spin="loading" />
        刷新
      </button>
    </div>

    <!-- 图谱画布 -->
    <div class="card p-0 overflow-hidden mb-4" style="min-height: 360px;">
      <div v-if="loading" class="flex items-center justify-center h-80">
        <div class="text-center">
          <font-awesome-icon icon="refresh" spin class="text-2xl text-primary-500 mb-2" />
          <p class="text-sm text-gray-500">正在构建知识图谱...</p>
        </div>
      </div>
      <div v-else-if="error" class="flex items-center justify-center h-80">
        <div class="text-center">
          <font-awesome-icon icon="exclamation-triangle" class="text-2xl text-amber-500 mb-2" />
          <p class="text-sm text-gray-500">{{ error }}</p>
          <button @click="loadGraph" class="mt-2 text-sm text-primary-600">重试</button>
        </div>
      </div>
      <canvas
        v-else
        ref="canvasRef"
        :width="canvasWidth"
        :height="canvasHeight"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @touchstart.passive="onTouchStart"
        @touchmove.passive="onTouchMove"
        @touchend="onTouchEnd"
        class="w-full cursor-grab active:cursor-grabbing"
        :style="{ height: canvasHeight + 'px' }"
      />
    </div>

    <!-- 选中节点详情 -->
    <div v-if="selectedNode" class="card mb-4">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: selectedNode.color || '#6366f1' }"></span>
          <h3 class="font-bold text-gray-800">{{ selectedNode.label }}</h3>
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full" :class="nodeTypeClass(selectedNode.type)">
          {{ nodeTypeLabel(selectedNode.type) }}
        </span>
      </div>
      <div class="text-sm text-gray-600 space-y-1">
        <p v-if="selectedNode.questionCount">题目数：{{ selectedNode.questionCount }}</p>
        <p v-if="selectedNode.count">出现次数：{{ selectedNode.count }}</p>
        <div v-if="selectedNode.mastery" class="flex items-center gap-2">
          <span>掌握度：</span>
          <span :class="{
            'text-green-600': selectedNode.mastery.level === 'mastered',
            'text-yellow-600': selectedNode.mastery.level === 'learning',
            'text-red-600': selectedNode.mastery.level === 'weak'
          }">{{ selectedNode.mastery.accuracy }} (已做{{ selectedNode.mastery.studied }}题)</span>
        </div>
        <!-- 关联节点 -->
        <div v-if="relatedNodes.length" class="mt-2">
          <p class="text-xs text-gray-400 mb-1">关联知识点：</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="rn in relatedNodes"
              :key="rn.id"
              @click="selectNode(rn)"
              class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-primary-50 hover:text-primary-600"
            >{{ rn.label }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="card">
      <h3 class="text-sm font-medium text-gray-700 mb-2">图例</h3>
      <div class="flex flex-wrap gap-3 text-xs">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-indigo-500"></span> 科目</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-purple-500"></span> 章节</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-cyan-500"></span> 考点</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-green-500"></span> 已掌握</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-red-500"></span> 薄弱</span>
        <span class="flex items-center gap-1"><span class="w-6 border-t-2 border-dashed border-amber-400"></span> 关联</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import api from '../api'

const canvasRef = ref(null)
const canvasWidth = 800
const canvasHeight = 400
const loading = ref(false)
const error = ref('')
const graphData = ref({ nodes: [], edges: [] })
const stats = ref(null)
const selectedNode = ref(null)

// 筛选器
const filters = [
  { key: 'subject', label: '科目' },
  { key: 'chapter', label: '章节' },
  { key: 'keyword', label: '考点' },
  { key: 'related', label: '跨章关联' }
]
const activeFilters = reactive(new Set(['subject', 'chapter', 'keyword', 'related']))

function toggleFilter(key) {
  if (activeFilters.has(key)) activeFilters.delete(key)
  else activeFilters.add(key)
  nextTick(() => drawGraph())
}

// 加载图谱
async function loadGraph() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.getKnowledgeGraph()
    graphData.value = data.graph || data
    stats.value = data.stats || null
    nextTick(() => drawGraph())
  } catch (e) {
    error.value = e.response?.data?.message || e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

// 筛选后的节点和边
const filteredNodes = computed(() => {
  const typeMap = { subject: 'subject', chapter: 'chapter', keyword: 'keyword', concept: 'keyword' }
  return graphData.value.nodes.filter(n => {
    const group = typeMap[n.type] || n.type
    return activeFilters.has(group)
  })
})

const filteredEdges = computed(() => {
  const nodeIds = new Set(filteredNodes.value.map(n => n.id))
  return graphData.value.edges.filter(e => {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return false
    if (e.type === 'related' && !activeFilters.has('related')) return false
    return true
  })
})

// 关联节点
const relatedNodes = computed(() => {
  if (!selectedNode.value) return []
  const edges = filteredEdges.value.filter(
    e => e.from === selectedNode.value.id || e.to === selectedNode.value.id
  )
  const relatedIds = new Set()
  edges.forEach(e => {
    if (e.from !== selectedNode.value.id) relatedIds.add(e.from)
    if (e.to !== selectedNode.value.id) relatedIds.add(e.to)
  })
  return filteredNodes.value.filter(n => relatedIds.has(n.id)).slice(0, 10)
})

// ===== 力导向布局 + Canvas渲染 =====
const nodePositions = new Map() // { id: { x, y, vx, vy } }
let simTimer = null
let dragNode = null
let panOffset = { x: 0, y: 0 }
let isDragging = false
let lastMouse = null

function initPositions() {
  nodePositions.clear()
  const nodes = filteredNodes.value
  const cx = canvasWidth / 2
  const cy = canvasHeight / 2

  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    const radius = n.type === 'subject' ? 60 : n.type === 'chapter' ? 140 : 220
    nodePositions.set(n.id, {
      x: cx + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
      y: cy + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0
    })
  })
}

function simulate() {
  const nodes = filteredNodes.value
  const edges = filteredEdges.value
  const alpha = 0.3

  for (let iter = 0; iter < 3; iter++) {
    // 斥力（节点间）
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodePositions.get(nodes[i].id)
        const b = nodePositions.get(nodes[j].id)
        if (!a || !b) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 800 / (dist * dist)
        const fx = (dx / dist) * force * alpha
        const fy = (dy / dist) * force * alpha
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }
    }

    // 引力（边连接）
    for (const edge of edges) {
      const a = nodePositions.get(edge.from)
      const b = nodePositions.get(edge.to)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const idealDist = edge.type === 'hierarchy' ? 80 : edge.type === 'related' ? 150 : 100
      const force = (dist - idealDist) * 0.01 * alpha
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }

    // 居中力
    const cx = canvasWidth / 2, cy = canvasHeight / 2
    for (const n of nodes) {
      const p = nodePositions.get(n.id)
      if (!p) continue
      p.vx += (cx - p.x) * 0.002
      p.vy += (cy - p.y) * 0.002
    }

    // 更新位置
    for (const n of nodes) {
      const p = nodePositions.get(n.id)
      if (!p || dragNode?.id === n.id) continue
      p.vx *= 0.6; p.vy *= 0.6
      p.x += p.vx; p.y += p.vy
      p.x = Math.max(30, Math.min(canvasWidth - 30, p.x))
      p.y = Math.max(30, Math.min(canvasHeight - 30, p.y))
    }
  }
}

function drawGraph() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  canvas.width = canvasWidth * dpr
  canvas.height = canvasHeight * dpr
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // 背景
  ctx.fillStyle = '#fafafa'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  const nodes = filteredNodes.value
  const edges = filteredEdges.value

  // 初始化位置
  if (nodePositions.size === 0) initPositions()

  // 运行模拟
  simulate()

  // 画边
  for (const edge of edges) {
    const from = nodePositions.get(edge.from)
    const to = nodePositions.get(edge.to)
    if (!from || !to) continue

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)

    if (edge.dashes || edge.type === 'related') {
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = edge.color || '#fbbf24'
      ctx.lineWidth = 1
    } else {
      ctx.setLineDash([])
      ctx.strokeStyle = edge.color || '#d1d5db'
      ctx.lineWidth = 1.5
    }
    ctx.stroke()
    ctx.setLineDash([])

    // 边标签
    if (edge.label && ctx.measureText(edge.label).width < 60) {
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      ctx.font = '9px sans-serif'
      ctx.fillStyle = '#9ca3af'
      ctx.textAlign = 'center'
      ctx.fillText(edge.label, mx, my - 4)
    }
  }

  // 画节点
  for (const node of nodes) {
    const pos = nodePositions.get(node.id)
    if (!pos) continue
    const r = (node.size || 15) / 2
    const isSelected = selectedNode.value?.id === node.id

    // 阴影
    if (isSelected) {
      ctx.shadowColor = node.color || '#6366f1'
      ctx.shadowBlur = 12
    }

    ctx.beginPath()
    ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = node.color || '#6366f1'
    ctx.fill()

    if (isSelected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // 标签
    ctx.font = node.type === 'subject' ? 'bold 11px sans-serif' : node.type === 'chapter' ? '10px sans-serif' : '9px sans-serif'
    ctx.fillStyle = '#374151'
    ctx.textAlign = 'center'
    ctx.fillText(node.label, pos.x, pos.y + r + 12)
  }
}

// 启动动画循环
function startAnimation() {
  if (simTimer) clearInterval(simTimer)
  let frames = 0
  simTimer = setInterval(() => {
    drawGraph()
    frames++
    if (frames > 60) { clearInterval(simTimer); simTimer = null } // 60帧后停止自动布局
  }, 50)
}

// ===== 交互 =====
function getNodeAtPos(x, y) {
  const nodes = filteredNodes.value
  for (let i = nodes.length - 1; i >= 0; i--) {
    const pos = nodePositions.get(nodes[i].id)
    if (!pos) continue
    const r = (nodes[i].size || 15) / 2 + 5
    if (Math.abs(x - pos.x) < r && Math.abs(y - pos.y) < r) return nodes[i]
  }
  return null
}

function getCanvasPos(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}

function onMouseDown(e) {
  const pos = getCanvasPos(e)
  const node = getNodeAtPos(pos.x, pos.y)
  if (node) {
    dragNode = node
    selectNode(node)
  }
  isDragging = true
  lastMouse = pos
}

function onMouseMove(e) {
  if (!isDragging) return
  const pos = getCanvasPos(e)
  if (dragNode) {
    const p = nodePositions.get(dragNode.id)
    if (p) { p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0 }
    drawGraph()
  }
}

function onMouseUp() {
  dragNode = null
  isDragging = false
}

function onTouchStart(e) {
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height
  const pos = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  const node = getNodeAtPos(pos.x, pos.y)
  if (node) { dragNode = node; selectNode(node) }
  lastMouse = pos
}

function onTouchMove(e) {
  if (!dragNode || e.touches.length !== 1) return
  const touch = e.touches[0]
  const rect = canvasRef.value.getBoundingClientRect()
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height
  const pos = { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  const p = nodePositions.get(dragNode.id)
  if (p) { p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0 }
  drawGraph()
}

function onTouchEnd() { dragNode = null }

function selectNode(node) {
  selectedNode.value = node
  drawGraph()
  if (simTimer) return // 模拟中不重启
  startAnimation() // 选中后轻微重新布局
}

// 工具函数
function nodeTypeLabel(type) {
  return { subject: '科目', chapter: '章节', keyword: '考点', concept: '概念' }[type] || type
}
function nodeTypeClass(type) {
  return {
    subject: 'bg-indigo-100 text-indigo-700',
    chapter: 'bg-purple-100 text-purple-700',
    keyword: 'bg-cyan-100 text-cyan-700',
    concept: 'bg-teal-100 text-teal-700'
  }[type] || 'bg-gray-100 text-gray-700'
}

watch(filteredNodes, () => {
  initPositions()
  startAnimation()
})

onMounted(() => { loadGraph() })
</script>

<style scoped>
.card {
  @apply bg-white rounded-xl shadow-sm border border-gray-100 p-3;
}
</style>
