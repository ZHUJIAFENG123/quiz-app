import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器：自动附带 Token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('quiz_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：自动提取 { success, data } 中的 data
api.interceptors.response.use(
  response => {
    const body = response.data
    // 二进制数据（如Excel导出）直接返回
    if (body instanceof Blob || body instanceof ArrayBuffer) return body
    // 统一格式 { success, data } → 提取 data
    if (body && typeof body === 'object' && 'data' in body) return body.data
    return body
  },
  error => {
    const message = error.response?.data?.message || error.message || '请求失败'
    console.error('API Error:', message)
    return Promise.reject(error)
  }
)

export default {
  // 科目
  getSubjects: () => api.get('/subjects'),
  createSubject: (data) => api.post('/subjects', data),
  updateSubject: (id, data) => api.put(`/subjects/${id}`, data),
  deleteSubject: (id) => api.delete(`/subjects/${id}`),

  // 章节
  getChapters: (params) => api.get('/chapters', { params }),
  createChapter: (data) => api.post('/chapters', data),
  updateChapter: (id, data) => api.put(`/chapters/${id}`, data),
  deleteChapter: (id) => api.delete(`/chapters/${id}`),
  getChapterQuestionCount: (id) => api.get(`/chapters/${id}/question-count`),
  getChapterCounts: (params) => api.get('/chapters/counts', { params }),

  // 题目
  getQuestions: (params) => api.get('/questions', { params }),
  getQuestion: (id) => api.get(`/questions/${id}`),
  createQuestion: (data) => api.post('/questions', data),
  updateQuestion: (id, data) => api.put(`/questions/${id}`, data),
  deleteQuestion: (id) => api.delete(`/questions/${id}`),
  batchDeleteQuestions: (ids) => api.post('/questions/batch-delete', { ids }),

  // 练习
  getPracticeQuestions: (params) => api.get('/practice', { params }),
  getPracticeDetail: (id) => api.get(`/practice/${id}`),
  submitAnswer: (data) => api.post('/practice/answer', data),
  toggleFavorite: (id) => api.post(`/practice/${id}/toggle-favorite`),

  // 考试
  generateExam: (data) => api.post('/exam/generate', data),
  submitExamAnswer: (sessionId, data) => api.post(`/exam/${sessionId}/answer`, data),
  submitExamAll: (sessionId, data) => api.post(`/exam/${sessionId}/submit-all`, data),
  getExamResult: (sessionId) => api.get(`/exam/${sessionId}/result`),

  // 学习统计
  getStudyStats: () => api.get('/study/stats'),
  getChapterStats: () => api.get('/study/stats/chapters'),
  getDailyStats: () => api.get('/study/stats/daily'),
  clearStudyData: () => api.delete('/study/clear'),

  // 收藏
  getFavorites: (params) => api.get('/favorites', { params }),
  addFavorite: (questionId) => api.post(`/favorites/${questionId}`),
  removeFavorite: (questionId) => api.delete(`/favorites/${questionId}`),
  batchRemoveFavorites: (ids) => api.post('/favorites/batch-remove', { ids }),

  // 错题
  getWrongQuestions: (params) => api.get('/wrong', { params }),
  removeWrongQuestion: (questionId) => api.delete(`/wrong/${questionId}`),
  batchRemoveWrongQuestions: (ids) => api.post('/wrong/batch-remove', { ids }),

  // 管理
  importQuestions: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/admin/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  exportQuestions: (params) => api.get('/admin/export', { params, responseType: 'blob' }),
  getAdminStats: () => api.get('/admin/stats'),

  // 数据库管理
  backupDatabase: () => api.post('/database/backup'),
  restoreDatabase: (backupFile) => api.post('/database/restore', { backupFile }),
  getBackups: () => api.get('/database/backups'),
  getDatabaseInfo: () => api.get('/database/info'),

  // 数据同步
  syncToCloud: () => api.post('/sync'),
  getSyncStatus: () => api.get('/sync/status'),

  // 认证
  login: (username, password) => api.post('/auth/login', { username, password }),

  // AI
  aiAnalyze: (questionId) => api.post('/ai/analyze', { question_id: questionId }),
  aiQuickAnalyze: (questionId, userAnswer) => api.post('/ai/quick-analyze', { question_id: questionId, user_answer: userAnswer }),
  aiDiagnose: () => api.post('/ai/diagnose'),
  aiChat: (message, history) => api.post('/ai/chat', { message, history }),
  aiChatStreamUrl: () => '/api/ai/chat/stream',
  aiAnalyzeStreamUrl: () => '/api/ai/analyze/stream',

  // RAG
  ragSearch: (query, options = {}) => api.post('/ai/rag/search', { query, ...options }),
  ragStatus: () => api.get('/ai/rag/status'),
  ragReindex: (force = false) => api.post('/ai/rag/reindex', { force }),

  // Agent
  agentChat: (message, history) => api.post('/ai/agent/chat', { message, history }),
  agentTools: () => api.get('/ai/agent/tools'),
  agentStreamUrl: () => '/api/ai/agent/chat/stream',

  // AI 可观测性
  aiDashboard: (period = '24h') => api.get('/ai-observability/dashboard', { params: { period } }),
  aiTemplates: (period = '7d') => api.get('/ai-observability/templates', { params: { period } }),
  aiTraces: (limit = 20) => api.get('/ai-observability/traces', { params: { limit } }),

  // 评估与治理
  aiFeedback: (data) => api.post('/ai/feedback', data),
  aiEvaluation: (period = '7d') => api.get('/ai/evaluation', { params: { period } }),
  aiABTests: () => api.get('/ai/ab-tests'),
  aiABTestResult: (promptId, period = '7d') => api.get(`/ai/ab-test/${promptId}`, { params: { period } }),
  aiCostSummary: (days = 7) => api.get('/ai/cost-summary', { params: { days } }),
  aiCircuitStatus: () => api.get('/ai/circuit-status'),
  aiRateLimitStatus: () => api.get('/ai/rate-limit-status'),

  // 知识图谱
  getKnowledgeGraph: () => api.get('/ai/knowledge-graph'),
  getAIGraph: (subjectId) => api.post('/ai/knowledge-graph/ai', { subject_id: subjectId }),

  // AI智能组卷
  generateSmartExam: (data) => api.post('/ai/smart-exam', data),
  getUserProfile: () => api.get('/ai/user-profile'),

  // 学习路径
  getLearningMastery: () => api.get('/ai/learning/mastery'),
  getLearningRecommend: () => api.get('/ai/learning/recommend'),
  getLearningPath: () => api.get('/ai/learning/path'),
  getAdaptiveQuestions: (params) => api.get('/ai/learning/adaptive', { params }),

  // 法海探案
  getCases: () => api.get('/cases'),
  getCaseDetail: (id) => api.get(`/cases/${id}`),
  judgeCase: (id, choice) => api.post(`/cases/${id}/judge`, { choice }),
  resetCase: (id) => api.post(`/cases/${id}/reset`),

  register: (username, password, nickname) => api.post('/auth/register', { username, password, nickname }),
  getMe: () => api.get('/auth/me'),
  logout: () => {
    localStorage.removeItem('quiz_token')
    localStorage.removeItem('quiz_user')
    window.location.href = '/'
  },
}
