<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-primary-600">刷题宝典</h1>
        <p class="text-sm text-gray-500 mt-1">创建账号开始学习</p>
      </div>
      
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 class="text-lg font-semibold text-gray-800 mb-4">注册</h2>
        
        <div v-if="error" class="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg mb-3">{{ error }}</div>
        <div v-if="success" class="bg-green-50 text-green-600 text-sm px-3 py-2 rounded-lg mb-3">{{ success }}</div>
        
        <div class="mb-3">
          <label class="block text-xs text-gray-500 mb-1">用户名</label>
          <input v-model="username" type="text" placeholder="3-20个字符"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>

        <div class="mb-3">
          <label class="block text-xs text-gray-500 mb-1">昵称 <span class="text-gray-300">(选填)</span></label>
          <input v-model="nickname" type="text" placeholder="显示名称"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        
        <div class="mb-4">
          <label class="block text-xs text-gray-500 mb-1">密码</label>
          <input v-model="password" type="password" placeholder="至少6位"
            class="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
        </div>
        
        <button @click="register" :disabled="loading"
          class="w-full btn-primary py-2.5 text-sm disabled:opacity-50">
          {{ loading ? '注册中...' : '注册' }}
        </button>
        
        <p class="text-center text-xs text-gray-400 mt-4">
          已有账号？
          <router-link to="/login" class="text-primary-600 font-medium">去登录</router-link>
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
const nickname = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

async function register() {
  error.value = ''
  success.value = ''
  if (!username.value || !password.value) {
    error.value = '请填写用户名和密码'
    return
  }
  if (username.value.length < 3) {
    error.value = '用户名至少3个字符'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }
  loading.value = true
  try {
    const res = await API.register(username.value, password.value, nickname.value)
    localStorage.setItem('quiz_token', res.token)
    localStorage.setItem('quiz_user', JSON.stringify(res.user))
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.message || '注册失败'
  } finally {
    loading.value = false
  }
}
</script>
