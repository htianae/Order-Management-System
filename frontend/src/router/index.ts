import { createRouter, createWebHistory } from 'vue-router'

import { orderRoles } from '@/config/menu'
import { useAuthStore } from '@/stores/auth'
import { getRouteRoles, getRouteUsernames, hasRoleAccess } from '@/utils/permission'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/orders'
        },
        {
          path: 'orders',
          name: 'orders',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/orders/OrderListView.vue')
        },
        {
          path: 'orders/new',
          name: 'orders-new',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/orders/NewOrderView.vue')
        },
        {
          path: 'inquiries',
          name: 'inquiries',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/inquiries/InquiryRecordsView.vue')
        },
        {
          path: 'inquiries/history',
          name: 'inquiries-history',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/inquiries/HistoryInquirySearchView.vue')
        },
        {
          path: 'orders/mine',
          name: 'orders-mine',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/orders/MyOrdersView.vue')
        },
        {
          path: 'reports/payment-applications',
          name: 'payment-application-summary',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/reports/PaymentApplicationSummaryView.vue')
        },
        {
          path: 'reports/annual-purchase-contracts',
          name: 'annual-purchase-contract-summary',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/reports/AnnualPurchaseContractSummaryView.vue')
        },
        {
          path: 'orders/history',
          name: 'orders-history',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/orders/HistorySearchView.vue')
        },
        {
          path: 'reports/business-analysis',
          name: 'business-analysis',
          meta: { requiresAuth: true, roles: orderRoles, usernames: ['Hengan1', 'Hengan3', 'Hengan4'] },
          component: () => import('@/views/reports/BusinessAnalysisView.vue')
        },
        {
          path: 'orders/:id',
          name: 'order-detail',
          meta: { requiresAuth: true, roles: orderRoles },
          component: () => import('@/views/orders/OrderDetailView.vue')
        },
        {
          path: 'boss/pending-approvals',
          name: 'boss-pending-approvals',
          meta: { requiresAuth: true, roles: ['BOSS', 'ADMIN'] },
          component: () => import('@/views/boss/PendingApprovalsView.vue')
        },
        {
          path: 'boss',
          name: 'boss-dashboard',
          meta: { requiresAuth: true, roles: ['BOSS', 'ADMIN'] },
          component: () => import('@/views/boss/BossDashboardView.vue')
        },
        {
          path: 'boss/files',
          name: 'boss-files',
          meta: { requiresAuth: true, roles: ['BOSS', 'ADMIN'] },
          component: () => import('@/views/boss/BossFileCenterView.vue')
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          meta: { requiresAuth: true, roles: ['ADMIN'] },
          component: () => import('@/views/admin/UserManagementView.vue')
        }
      ]
    },
    {
      path: '/login',
      name: 'login',
      meta: { requiresGuest: true },
      component: () => import('@/views/LoginView.vue')
    },
    {
      path: '/403',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue')
    }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAuth && authStore.isAuthenticated && !authStore.user) {
    try {
      await authStore.fetchCurrentUser()
    } catch {
      authStore.logout()
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  if (to.meta.requiresAuth && !hasRoleAccess(authStore.role, getRouteRoles(to), authStore.user?.username, getRouteUsernames(to))) {
    return { name: 'forbidden' }
  }

  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    return { name: 'orders' }
  }

  return true
})

export default router
