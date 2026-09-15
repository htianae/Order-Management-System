import { z } from 'zod'

import { assertCanQueryEmployeePerformance, isBossOrAdmin } from '../security/tool-permissions.js'
import { decimalToNumber } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const employeePerformanceSchema = z.object({
  userId: z.string().trim().optional(),
  username: z.string().trim().optional(),
  year: z.number().int().min(1900).max(3000).optional()
})

export type EmployeePerformanceArgs = z.infer<typeof employeePerformanceSchema>

function getYearRange(year?: number) {
  if (!year) {
    return {}
  }

  return {
    gte: new Date(`${year}-01-01T00:00:00.000Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00.000Z`)
  }
}

export async function executeGetEmployeePerformance(args: EmployeePerformanceArgs, context: ToolContext, db: any = prisma) {
  assertCanQueryEmployeePerformance(args.userId, context.user)
  const targetUserId = isBossOrAdmin(context.user.role) ? args.userId : context.user.id
  const targetUser = args.username && isBossOrAdmin(context.user.role)
    ? await db.user.findFirst({
        where: { username: { contains: args.username, mode: 'insensitive' } },
        select: { id: true, username: true, displayName: true }
      })
    : null
  const effectiveUserId = targetUser?.id || targetUserId
  const dateRange = getYearRange(args.year)
  const where = {
    ...(effectiveUserId ? { creatorId: effectiveUserId } : {}),
    ...(args.year ? { createdAt: dateRange } : {})
  }
  const [aggregate, total, won, lost] = await Promise.all([
    db.order.aggregate({
      where,
      _sum: { winningAmount: true, profit: true }
    }),
    db.order.count({ where }),
    db.order.count({ where: { ...where, bidResult: 'WON' } }),
    db.order.count({ where: { ...where, bidResult: 'LOST' } })
  ])

  return {
    userId: effectiveUserId || null,
    username: targetUser?.username || (effectiveUserId === context.user.id ? context.user.username : args.username || null),
    year: args.year || null,
    orderCount: total,
    wonCount: won,
    lostCount: lost,
    winRate: total ? won / total : 0,
    winningAmount: decimalToNumber(aggregate._sum?.winningAmount) || 0,
    profit: decimalToNumber(aggregate._sum?.profit) || 0
  }
}

export function createEmployeePerformanceTool(): AgentTool<EmployeePerformanceArgs, Awaited<ReturnType<typeof executeGetEmployeePerformance>>> {
  return {
    name: 'get_employee_performance',
    description: 'Query employee or company business performance within the current user permission scope, including order count, deal value, wins, win rate and profit.',
    parameters: employeePerformanceSchema,
    execute: (args, context) => executeGetEmployeePerformance(args, context)
  }
}
