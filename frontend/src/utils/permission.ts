import type { RouteLocationNormalizedLoaded } from 'vue-router'

import type { AppMenuItem } from '@/config/menu'
import type { UserRole } from '@/types/auth'

export function hasRoleAccess(userRole: UserRole | undefined, allowedRoles?: UserRole[], username?: string, allowedUsernames?: string[]) {
  if (!allowedRoles?.length) {
    return !allowedUsernames?.length || Boolean(username && allowedUsernames.includes(username))
  }

  if (!userRole) {
    return false
  }

  if (!allowedRoles.includes(userRole)) {
    return false
  }

  return !allowedUsernames?.length || userRole === 'BOSS' || userRole === 'ADMIN' || Boolean(username && allowedUsernames.includes(username))
}

export function filterMenusByRole(menus: AppMenuItem[], userRole: UserRole | undefined, username?: string) {
  return menus.filter((menu) => hasRoleAccess(userRole, menu.roles, username, menu.usernames))
}

export function getRouteRoles(route: RouteLocationNormalizedLoaded) {
  return route.meta.roles as UserRole[] | undefined
}

export function getRouteUsernames(route: RouteLocationNormalizedLoaded) {
  return route.meta.usernames as string[] | undefined
}
