import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faHome, faBook, faPenToSquare, faFilePen, faHeart, faStar,
  faChartBar, faGear, faChevronLeft, faChevronRight, faClock,
  faCheck, faXmark, faCircleCheck, faCircleXmark, faShuffle,
  faListCheck, faTrash, faUpload, faDownload, faDatabase,
  faSearch, faPlus, faEdit, faEye, faEyeSlash, faAngleDown,
  faAngleUp, faCircle, faArrowLeft, faArrowRight, faRefresh,
  faFilter, faLayerGroup, faCircleQuestion, faCircleInfo,
  faSquareCheck, faSquare, faToggleOn, faToggleOff,
  faBookmark, faFlag, faHourglassHalf, faTrophy,
  faFileExport, faFileImport, faRotateLeft, faBars,
  faUser, faTable, faTags, faLightbulb, faExclamationTriangle,
  faShare, faCrown, faMedal, faCalendarDay, faFire,
  faChartLine, faChartPie, faBroom, faUndo, faArrowRightFromBracket, faPaperPlane,
  faScaleBalanced, faPlay, faCircleHalfStroke
} from '@fortawesome/free-solid-svg-icons'

import App from './App.vue'
import Home from './views/Home.vue'
import Practice from './views/Practice.vue'
import Exam from './views/Exam.vue'
import ExamResult from './views/ExamResult.vue'
import WrongBook from './views/WrongBook.vue'
import Favorites from './views/Favorites.vue'
import Stats from './views/Stats.vue'
import Admin from './views/Admin.vue'
import Login from './views/Login.vue'
import Register from './views/Register.vue'
import Profile from './views/Profile.vue'
import AIAssistant from './views/AIAssistant.vue'
import LawAdventure from './views/LawAdventure.vue'
import KnowledgeGraph from './views/KnowledgeGraph.vue'
import './style.css'

// Font Awesome 图标注册
library.add(
  faHome, faBook, faPenToSquare, faFilePen, faHeart, faStar,
  faChartBar, faGear, faChevronLeft, faChevronRight, faClock,
  faCheck, faXmark, faCircleCheck, faCircleXmark, faShuffle,
  faListCheck, faTrash, faUpload, faDownload, faDatabase,
  faSearch, faPlus, faEdit, faEye, faEyeSlash, faAngleDown,
  faAngleUp, faCircle, faArrowLeft, faArrowRight, faRefresh,
  faFilter, faLayerGroup, faCircleQuestion, faCircleInfo,
  faSquareCheck, faSquare, faToggleOn, faToggleOff,
  faBookmark, faFlag, faHourglassHalf, faTrophy,
  faFileExport, faFileImport, faRotateLeft, faBars,
  faUser, faTable, faTags, faLightbulb, faExclamationTriangle,
  faShare, faCrown, faMedal, faCalendarDay, faFire,
  faChartLine, faChartPie, faBroom, faUndo, faArrowRightFromBracket, faPaperPlane,
  faScaleBalanced, faPlay, faCircleHalfStroke
)

const routes = [
  { path: '/', name: 'Home', component: Home, meta: { title: '首页' } },
  { path: '/practice', name: 'Practice', component: Practice, meta: { title: '练习' } },
  { path: '/exam', name: 'Exam', component: Exam, meta: { title: '考试' } },
  { path: '/exam/result/:sessionId', name: 'ExamResult', component: ExamResult, meta: { title: '考试成绩' } },
  { path: '/wrong', name: 'WrongBook', component: WrongBook, meta: { title: '错题本' } },
  { path: '/favorites', name: 'Favorites', component: Favorites, meta: { title: '收藏夹' } },
  { path: '/stats', name: 'Stats', component: Stats, meta: { title: '学习统计' } },
  { path: '/profile', name: 'Profile', component: Profile, meta: { title: '个人主页' } },
  { path: '/ai', name: 'AIAssistant', component: AIAssistant, meta: { title: 'AI助手' } },
  { path: '/knowledge-graph', name: 'KnowledgeGraph', component: KnowledgeGraph, meta: { title: '知识图谱' } },
  { path: '/admin', name: 'Admin', component: Admin, meta: { title: '后台管理' } },
  { path: '/adventure', name: 'LawAdventure', component: LawAdventure, meta: { title: '法海探案' } },
  { path: '/login', name: 'Login', component: Login, meta: { title: '登录' } },
  { path: '/register', name: 'Register', component: Register, meta: { title: '注册' } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

// 登录状态检查
function getUserFromStorage() {
  try {
    const token = localStorage.getItem('quiz_token')
    const user = localStorage.getItem('quiz_user')
    if (token && user) return JSON.parse(user)
  } catch {}
  return null
}

// 页面标题更新
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 刷题宝典` : '刷题宝典'
})

const app = createApp(App)
app.component('font-awesome-icon', FontAwesomeIcon)
app.use(router)
app.mount('#app')
