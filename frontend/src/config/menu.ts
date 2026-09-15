import {
  CircleCheck,
  Document,
  Download,
  FolderOpened,
  House,
  Management,
  Search,
  Tickets,
  User
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

import type { UserRole } from '@/types/auth'

export interface AppMenuItem {
  title: string
  path: string
  icon: Component
  roles: UserRole[]
  usernames?: string[]
  badgeKey?: 'pendingApprovals'
}

export const orderRoles: UserRole[] = ['EMPLOYEE', 'BOSS', 'ADMIN']

export const appMenus: AppMenuItem[] = [
  {
    title: 'Order List',
    path: '/orders',
    icon: Document,
    roles: orderRoles
  },
  {
    title: 'New Order',
    path: '/orders/new',
    icon: FolderOpened,
    roles: orderRoles
  },
  {
    title: 'Inquiry Records',
    path: '/inquiries',
    icon: Tickets,
    roles: orderRoles
  },
  {
    title: 'Historical Inquiries',
    path: '/inquiries/history',
    icon: Search,
    roles: orderRoles
  },
  {
    title: 'My Orders',
    path: '/orders/mine',
    icon: House,
    roles: orderRoles
  },
  {
    title: 'Payment Request Summary',
    path: '/reports/payment-applications',
    icon: Document,
    roles: orderRoles
  },
  {
    title: 'Annual Business Summary',
    path: '/reports/annual-purchase-contracts',
    icon: Download,
    roles: orderRoles
  },
  {
    title: 'Order History Search',
    path: '/orders/history',
    icon: Search,
    roles: orderRoles
  },
  {
    title: 'Business Analysis',
    path: '/reports/business-analysis',
    icon: Management,
    roles: orderRoles,
    usernames: ['Hengan1', 'Hengan3', 'Hengan4']
  },
  {
    title: 'Pending Approvals',
    path: '/boss/pending-approvals',
    icon: CircleCheck,
    roles: ['BOSS', 'ADMIN'],
    badgeKey: 'pendingApprovals'
  },
  {
    title: 'Management Dashboard',
    path: '/boss',
    icon: Management,
    roles: ['BOSS', 'ADMIN']
  },
  {
    title: 'File Management',
    path: '/boss/files',
    icon: Download,
    roles: ['BOSS', 'ADMIN']
  },
  {
    title: 'User Management',
    path: '/admin/users',
    icon: User,
    roles: ['ADMIN']
  }
]
