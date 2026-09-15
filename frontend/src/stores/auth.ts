import { defineStore } from 'pinia'

import { getCurrentUserApi, loginApi } from '@/api/auth'
import type { AuthUser, LoginPayload } from '@/types/auth'

function readStoredUser() {
  const rawUser = localStorage.getItem('auth_user')

  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser) as AuthUser
  } catch {
    localStorage.removeItem('auth_user')
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('access_token'),
    user: readStoredUser()
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    role: (state) => state.user?.role
  },
  actions: {
    setSession(token: string, user: AuthUser) {
      this.token = token
      this.user = user
      localStorage.setItem('access_token', token)
      localStorage.setItem('auth_user', JSON.stringify(user))
    },
    clearSession() {
      this.token = null
      this.user = null
      localStorage.removeItem('access_token')
      localStorage.removeItem('auth_user')
    },
    async login(payload: LoginPayload) {
      const { data } = await loginApi(payload)
      this.setSession(data.token, data.user)
    },
    async fetchCurrentUser() {
      const { data } = await getCurrentUserApi()
      this.user = data.user
      localStorage.setItem('auth_user', JSON.stringify(data.user))
    },
    logout() {
      this.clearSession()
    }
  }
})
