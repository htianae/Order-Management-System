<template>
  <main class="auth-page">
    <section class="auth-card">
      <h1>Sign In</h1>
      <p>Sign in to the internal order management system</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="Username" prop="username">
          <el-input v-model.trim="form.username" placeholder="Enter username" autocomplete="username" />
        </el-form-item>

        <el-form-item label="Password" prop="password">
          <el-input
            v-model="form.password"
            placeholder="Enter password"
            type="password"
            autocomplete="current-password"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-button class="auth-submit" type="primary" :loading="loading" @click="handleSubmit">
          Sign In
        </el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules: FormRules = {
  username: [{ required: true, message: 'Enter username', trigger: 'blur' }],
  password: [{ required: true, message: 'Enter password', trigger: 'blur' }]
}

async function handleSubmit() {
  const valid = await formRef.value?.validate()

  if (!valid) {
    return
  }

  loading.value = true

  try {
    await authStore.login(form)
    ElMessage.success('Signed in successfully')
    router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Sign-in failed')
  } finally {
    loading.value = false
  }
}
</script>
