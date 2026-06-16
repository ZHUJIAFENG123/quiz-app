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
  register: (username, password, nickname) => api.post('/auth/register', { username, password, nickname }),
  getMe: () => api.get('/auth/me'),
  logout: () => {
    localStorage.removeItem('quiz_token')
    localStorage.removeItem('quiz_user')
  },
}
