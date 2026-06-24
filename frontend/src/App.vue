<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 后台管理不显示导航 -->
    <div v-if="!isAdminRoute" class="pb-16">
      <!-- 顶部栏 -->
      <header class="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <router-link to="/" class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <font-awesome-icon icon="book" class="text-white text-sm" />
          </div>
          <span class="font-bold text-base tracking-wide">学法宝典</span>
        </router-link>
        <div class="flex items-center gap-3">
          <template v-if="currentUser">
            <router-link to="/profile" class="text-white/80 hover:text-white text-xs flex items-center gap-1">
              <font-awesome-icon icon="user" class="text-xs" />
              {{ currentUser.nickname || currentUser.username }}
            </router-link>
          </template>
          <template v-else>
            <router-link to="/login" class="text-white/80 hover:text-white text-sm">登录</router-link>
          </template>
        </div>
      </header>
      
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
    <nav v-if="!isAdminRoute" class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 safe-bottom shadow-lg">
      <div class="flex justify-around items-center h-14 max-w-lg mx-auto">
        <router-link to="/" class="nav-item" exact-active-class="!text-primary-600">
          <font-awesome-icon icon="home" class="text-xl" />
          <span class="text-[10px] mt-0.5">首页</span>
        </router-link>
        <router-link to="/adventure" class="nav-item" active-class="!text-amber-600">
          <font-awesome-icon icon="scale-balanced" class="text-xl" />
          <span class="text-[10px] mt-0.5">探案</span>
        </router-link>
        <router-link to="/practice" class="nav-item" active-class="!text-primary-600">
          <div class="relative">
            <font-awesome-icon icon="pen-to-square" class="text-xl" />
          </div>
          <span class="text-[10px] mt-0.5">刷题</span>
        </router-link>
        <router-link to="/ai" class="nav-item" active-class="!text-violet-600">
          <font-awesome-icon icon="lightbulb" class="text-xl" />
          <span class="text-[10px] mt-0.5">AI学</span>
        </router-link>
        <router-link to="/profile" class="nav-item" active-class="!text-primary-600">
          <font-awesome-icon icon="user" class="text-xl" />
          <span class="text-[10px] mt-0.5">我的</span>
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))

const currentUser = ref(getUser())

function getUser() {
  try {
    const u = localStorage.getItem('quiz_user')
    return u ? JSON.parse(u) : null
  } catch { return null }
}

function checkUser() { currentUser.value = getUser() }
window.addEventListener('storage', checkUser)

watch(() => route.path, () => {
  currentUser.value = getUser()
})
</script>

<style scoped>
.nav-item {
  @apply flex flex-col items-center justify-center text-gray-400 transition-colors duration-200;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
