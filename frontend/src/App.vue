<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 后台管理不显示底部导航 -->
    <div v-if="!isAdminRoute" class="pb-16">
      <!-- 顶部用户栏 -->
      <div class="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2">
          <img src="/logo.png" alt="logo" class="w-6 h-6 rounded" />
          <span class="text-sm font-semibold text-primary-600">刷题宝典</span>
        </router-link>
        <div class="flex items-center gap-2">
          <template v-if="currentUser">
            <router-link to="/profile" class="text-xs text-gray-500 hover:text-primary-600">{{ currentUser.nickname || currentUser.username }}</router-link>
            <button @click="doLogout" class="text-xs text-gray-400 hover:text-red-500">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="text-xs text-gray-500 hover:text-primary-600">登录</router-link>
            <span class="text-gray-300 text-xs">|</span>
            <router-link to="/register" class="text-xs text-gray-500 hover:text-primary-600">注册</router-link>
          </template>
          <router-link to="/profile" class="text-gray-400 hover:text-primary-600 ml-1">
            <font-awesome-icon icon="user" class="text-sm" />
          </router-link>
        </div>
      </div>
      
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
    <div v-else>
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
    
    <!-- 底部导航栏 -->
    <nav v-if="!isAdminRoute" class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div class="flex justify-around items-center h-14 max-w-lg mx-auto">
        <router-link to="/" class="nav-item" exact-active-class="text-primary-600">
          <font-awesome-icon icon="home" class="text-lg" />
          <span class="text-xs mt-0.5">首页</span>
        </router-link>
        <router-link to="/practice" class="nav-item" active-class="text-primary-600">
          <font-awesome-icon icon="pen-to-square" class="text-lg" />
          <span class="text-xs mt-0.5">练习</span>
        </router-link>
        <router-link to="/exam" class="nav-item" active-class="text-primary-600">
          <font-awesome-icon icon="file-pen" class="text-lg" />
          <span class="text-xs mt-0.5">考试</span>
        </router-link>
        <router-link to="/wrong" class="nav-item" active-class="text-primary-600">
          <font-awesome-icon icon="circle-xmark" class="text-lg" />
          <span class="text-xs mt-0.5">错题</span>
        </router-link>
        <router-link to="/favorites" class="nav-item" active-class="text-primary-600">
          <font-awesome-icon icon="heart" class="text-lg" />
          <span class="text-xs mt-0.5">收藏</span>
        </router-link>
        <router-link to="/ai" class="nav-item" active-class="text-primary-600">
          <font-awesome-icon icon="lightbulb" class="text-lg" />
          <span class="text-xs mt-0.5">AI助手</span>
        </router-link>
        <router-link to="/adventure" class="nav-item" active-class="text-amber-600">
          <font-awesome-icon icon="scale-balanced" class="text-lg" />
          <span class="text-xs mt-0.5">探案</span>
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

const currentUser = ref(getUser())

function getUser() {
  try {
    const u = localStorage.getItem('quiz_user')
    return u ? JSON.parse(u) : null
  } catch { return null }
}

// 更新用户信息的辅助函数
function checkUser() { currentUser.value = getUser() }
window.addEventListener('storage', checkUser)

watch(() => route.path, () => {
  currentUser.value = getUser()
})

function doLogout() {
  localStorage.removeItem('quiz_token')
  localStorage.removeItem('quiz_user')
  currentUser.value = null
  window.location.href = '/'
}
</script>

<style scoped>
.nav-item {
  @apply flex flex-col items-center justify-center text-gray-500 transition-colors duration-200;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
