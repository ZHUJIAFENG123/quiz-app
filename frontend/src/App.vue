<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 后台管理不显示底部导航 -->
    <div v-if="!isAdminRoute" class="pb-16">
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
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
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
