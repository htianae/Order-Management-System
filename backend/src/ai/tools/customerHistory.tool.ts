import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { decimalToNumber, serializeForAi } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const customerHistorySchema = z.object({
  customerName: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).optional()
})

export type CustomerHistoryArgs = z.infer<typeof customerHistorySchema>

export async function executeSearchCustomerHistory(args: CustomerHistoryArgs, context: ToolContext, db: any = prisma) {
  const where = {
    AND: [
      getOrderReadScope(context.user),
      { inquiryCompany: { contains: args.customerName, mode: 'insensitive' } }
    ]
  }
  const [orders, aggregate, total, won, lost] = await Promise.all([
    db.order.findMany({
      where,
      include: {
        items: {
          select: {
            materialCode: true,
            materialDescription: true,
            quantity: true,
            quotedPrice: true,
            winningAmount: true
          },
          orderBy: { lineNo: 'asc' }
        }
      },
      orderBy: { inquiryDate: 'desc' },
      take: args.limit || 10
    }),
    db.order.aggregate({ where, _sum: { winningAmount: true, profit: true } }),
    db.order.count({ where }),
    db.order.count({ where: { AND: [where, { bidResult: 'WON' }] } }),
    db.order.count({ where: { AND: [where, { bidResult: 'LOST' }] } })
  ])
  const productCounts = new Map<string, number>()

  orders.forEach((order: any) => {
    ;(order.items || []).forEach((item: any) => {
      const name = item.materialDescription || order.productNameCn || 'Unnamed item'
      productCounts.set(name, (productCounts.get(name) || 0) + 1)
    })
  })

  return {
    customerName: args.customerName,
    orderCount: total,
    winningAmount: decimalToNumber(aggregate._sum?.winningAmount) || 0,
    profit: decimalToNumber(aggregate._sum?.profit) || 0,
    wonCount: won,
    lostCount: lost,
    frequentProducts: Array.from(productCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    recentOrders: serializeForAi(orders),
    message: total ? 'Customer history found.' : 'Insufficient data available: no historical orders found for this customer.'
  }
}

export function createCustomerHistoryTool(): AgentTool<CustomerHistoryArgs, Awaited<ReturnType<typeof executeSearchCustomerHistory>>> {
  return {
    name: 'search_customer_history',
    description: 'Query accessible customer history including historical orders, deal value, awards, frequently purchased products and recent orders.',
    parameters: customerHistorySchema,
    execute: (args, context) => executeSearchCustomerHistory(args, context)
  }
}
