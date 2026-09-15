import type { Prisma, UserRole } from '@prisma/client'

import type { ToolContext } from '../tools/tool-types.js'

type ToolUser = ToolContext['user']

export function isBossOrAdmin(role: UserRole) {
  return role === 'BOSS' || role === 'ADMIN'
}

export function getOrderReadScope(user: ToolUser): Prisma.OrderWhereInput {
  return isBossOrAdmin(user.role)
    ? {}
    : {
        OR: [
          { creatorId: user.id },
          { ownerId: user.id }
        ]
      }
}

export function getInquiryReadScope(user: ToolUser): Prisma.InquiryWhereInput {
  return isBossOrAdmin(user.role) ? {} : { creatorId: user.id }
}

export function assertCanQueryEmployeePerformance(requestedUserId: string | undefined, user: ToolUser) {
  if (isBossOrAdmin(user.role)) {
    return
  }

  if (requestedUserId && requestedUserId !== user.id) {
    throw new Error('You do not have permission to view other employees\' data')
  }
}
