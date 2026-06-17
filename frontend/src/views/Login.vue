<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <img src="/mascot.png" alt="小助手" class="w-16 h-16 rounded-full object-cover mx-auto mb-3 shadow-md" />
        <h1 class="text-2xl font-bold text-primary-600">刷题宝典</h1>
        <p class="text-sm text-gray-500 mt-1">登录以同步学习数据</p>
      </div>
      
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4">登录</h2>
        
        <div v-if="error" class="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-3">{{ error }}</div>
        
        <div class="mb-3">
          <label class="block text-xs text-gray-500 mb-1">用户名</label>
          <input v-model="username" type="text" placeholder="输入用户名" 
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            @keyup.enter="login" />
        </div>
        
        <div class="mb-4">
          <label class="block text-xs text-gray-500 mb-1">密码</label>
          <input v-model="password" type="password" placeholder="输入密码"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            @keyup.enter="login" />
        </div>
        
        <button @click="login" :disabled="loading"
          class="w-full btn-primary py-2.5 text-sm disabled:opacity-50">
          {{ loading ? '登录中...' : '登录' }}
        </button>
        
        <p class="text-center text-xs text-gray-400 mt-4">
          还没有账号？
          <router-link to="/register" class="text-primary-600 font-medium">立即注册</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import API from '../api'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function login() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请填写用户名和密码'
    return
  }
  loading.value = true
  try {
    const res = await API.login(username.value, password.value)
    localStorage.setItem('quiz_token', res.token)
    localStorage.setItem('quiz_user', JSON.stringify(res.user))
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
