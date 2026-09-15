<template>
  <el-container class="admin-layout">
    <el-aside class="admin-sidebar" width="260px">
      <div class="brand">
        <span class="brand-mark">OM</span>
        <div>
          <strong>Order Management</strong>
          <span>Order System</span>
        </div>
      </div>

      <el-menu
        class="side-menu"
        :default-active="activePath"
        router
        background-color="#172033"
        text-color="#cbd5e1"
        active-text-color="#ffffff"
      >
        <el-menu-item v-for="menu in visibleMenus" :key="menu.path" :index="menu.path">
          <el-icon>
            <component :is="menu.icon" />
          </el-icon>
          <span class="menu-label">
            {{ menu.title }}
            <span v-if="menu.badgeKey" class="menu-count">{{ getMenuBadge(menu) }}</span>
          </span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="header-title">{{ currentTitle }}</div>
        <div class="user-box">
          <span class="user-name">{{ authStore.user?.realName || authStore.user?.username }}</span>
          <el-tag>{{ roleText }}</el-tag>
          <el-button type="primary" plain @click="handleLogout">Sign Out</el-button>
        </div>
      </el-header>

      <el-main class="admin-main">
        <RouterView />
      </el-main>
    </el-container>

    <AiChatWidget />
  </el-container>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { appMenus } from '@/config/menu'
import AiChatWidget from '@/components/ai/AiChatWidget.vue'
import { useAuthStore } from '@/stores/auth'
import { usePendingApprovalsStore } from '@/stores/pendingApprovals'
import { filterMenusByRole } from '@/utils/permission'
import type { AppMenuItem } from '@/config/menu'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pendingApprovalsStore = usePendingApprovalsStore()

const activePath = computed(() => {
  const matchedMenu = [...appMenus]
    .sort((left, right) => right.path.length - left.path.length)
    .find((menu) => route.path === menu.path || route.path.startsWith(`${menu.path}/`))

  return matchedMenu?.path || route.path
})

const visibleMenus = computed(() => filterMenusByRole(appMenus, authStore.role, authStore.user?.username))

const currentTitle = computed(() => {
  const matchedMenu = appMenus.find((menu) => menu.path === activePath.value)
  return matchedMenu?.title || 'Home'
})

const roleText = computed(() => {
  const roleMap = {
    EMPLOYEE: 'Employee',
    BOSS: 'Manager',
    ADMIN: 'Administrator'
  }

  return authStore.user?.role ? roleMap[authStore.user.role] : 'No Role Assigned'
})

function getMenuBadge(menu: AppMenuItem) {
  return menu.badgeKey === 'pendingApprovals' ? pendingApprovalsStore.count : 0
}

watch(
  () => [route.fullPath, authStore.role],
  async () => {
    if (authStore.role === 'BOSS' || authStore.role === 'ADMIN') {
      try {
        await pendingApprovalsStore.refresh()
      } catch {
        pendingApprovalsStore.clear()
      }
    } else {
      pendingApprovalsStore.clear()
    }
  },
  { immediate: true }
)

function handleLogout() {
  authStore.logout()
  router.push({ name: 'login' })
}
</script>
