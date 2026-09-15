import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { serializeForAi } from '../utils/serialize.js'
import { env } from '../../config/env.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const delayedOrdersSchema = z.object({
  statusDays: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export type DelayedOrdersArgs = z.infer<typeof delayedOrdersSchema>

function daysBetween(left: Date, right: Date) {
  return Math.floor((right.getTime() - left.getTime()) / 86400000)
}

export async function executeGetDelayedOrders(args: DelayedOrdersArgs, context: ToolContext, db: any = prisma, now = new Date()) {
  const statusDays = args.statusDays || env.aiAgentDelayedStatusDays
  const orders = await db.order.findMany({
    where: {
      AND: [
        getOrderReadScope(context.user),
        {
          currentStatus: {
            in: [
              'INQUIRY',
              'QUOTED',
              'BID_WON',
              'PURCHASING',
              'PURCHASE_PAYMENT',
              'SUPPLIER_SHIPPED',
              'ARRIVED_COMPANY',
              'SHIPPED_TO_CUSTOMER',
              'CUSTOMER_PAID'
            ]
          }
        }
      ]
    },
    include: {
      items: {
        select: {
          id: true,
          lineNo: true,
          materialDescription: true,
          currentStatus: true,
          deliveryTime: true
        },
        orderBy: { lineNo: 'asc' }
      }
    },
    orderBy: { updatedAt: 'asc' },
      take: args.limit || 50
  })

  const items = orders
    .map((order: any) => {
      const updatedAt = order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt)
      const stalledDays = Number.isNaN(updatedAt.getTime()) ? 0 : daysBetween(updatedAt, now)

      return {
        id: order.id,
        orderNo: order.orderNo,
        inquiryCompany: order.inquiryCompany,
        currentStatus: order.currentStatus,
        updatedAt: order.updatedAt,
        stalledDays,
        reason: `Order has remained at ${order.currentStatus} for ${stalledDays} days`,
        items: order.items
      }
    })
    .filter((order: { stalledDays: number }) => order.stalledDays >= statusDays)

  return {
    thresholdDays: statusDays,
    items: serializeForAi(items) as Array<{ reason: string; stalledDays: number }>,
    message: items.length ? 'Potentially delayed or stalled orders identified.' : 'No delayed orders exceed the threshold.'
  }
}

export function createDelayedOrdersTool(): AgentTool<DelayedOrdersArgs, Awaited<ReturnType<typeof executeGetDelayedOrders>>> {
  return {
    name: 'get_delayed_orders',
    description: 'Identify accessible orders that may be delayed or stalled using configurable time thresholds.',
    parameters: delayedOrdersSchema,
    execute: (args, context) => executeGetDelayedOrders(args, context)
  }
}
