import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { decimalToNumber } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const customerDealRankingSchema = z.object({
  year: z.number().int().min(1900).max(3000).optional().describe('Reporting year, e.g. 2026. Defaults to the current year.'),
  month: z.number().int().min(1).max(12).optional().describe('Reporting month, 1 to 12. Omit for the entire year.'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of ranked results. Default: 10.'),
  sortBy: z.enum(['orderCount', 'winningAmount', 'profit']).optional().describe('Sort by won order count, deal value or profit. Defaults to won order count.')
})

export type CustomerDealRankingArgs = z.infer<typeof customerDealRankingSchema>

function getDateRange(year?: number, month?: number, now = new Date()) {
  const selectedYear = year || now.getFullYear()
  const startMonth = month ? month - 1 : 0
  const endYear = month === 12 ? selectedYear + 1 : selectedYear
  const endMonth = month ? month : 12

  return {
    year: selectedYear,
    month: month || null,
    start: new Date(Date.UTC(selectedYear, startMonth, 1)),
    end: new Date(Date.UTC(endYear, endMonth, 1))
  }
}

function topProducts(orders: any[]) {
  const counts = new Map<string, number>()

  orders.forEach((order) => {
    ;(order.items || []).forEach((item: any) => {
      const name = item.materialDescription || order.productNameCn || 'Unnamed item'
      counts.set(name, (counts.get(name) || 0) + 1)
    })
  })

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
}

export async function executeGetCustomerDealRanking(
  args: CustomerDealRankingArgs,
  context: ToolContext,
  db: any = prisma,
  now = new Date()
) {
  const range = getDateRange(args.year, args.month, now)
  const orders = await db.order.findMany({
    where: {
      AND: [
        getOrderReadScope(context.user),
        { bidResult: 'WON' },
        {
          inquiryDate: {
            gte: range.start,
            lt: range.end
          }
        }
      ]
    },
    select: {
      id: true,
      orderNo: true,
      inquiryCompany: true,
      inquiryDate: true,
      winningAmount: true,
      profit: true,
      productNameCn: true,
      items: {
        select: {
          materialDescription: true
        }
      }
    },
    orderBy: { inquiryDate: 'desc' }
  })
  const groups = new Map<string, any[]>()

  orders.forEach((order: any) => {
    const companyName = order.inquiryCompany || 'Customer not specified'
    groups.set(companyName, [...(groups.get(companyName) || []), order])
  })

  const rankings = Array.from(groups.entries()).map(([companyName, companyOrders]) => {
    const winningAmount = companyOrders.reduce((total, order) => total + (decimalToNumber(order.winningAmount) || 0), 0)
    const profit = companyOrders.reduce((total, order) => total + (decimalToNumber(order.profit) || 0), 0)

    return {
      companyName,
      wonOrderCount: companyOrders.length,
      winningAmount: Math.round(winningAmount * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      averageOrderAmount: companyOrders.length ? Math.round((winningAmount / companyOrders.length) * 100) / 100 : 0,
      topProducts: topProducts(companyOrders),
      recentOrders: companyOrders.slice(0, 5).map((order) => ({
        orderId: order.id,
        orderNo: order.orderNo,
        inquiryDate: order.inquiryDate,
        winningAmount: decimalToNumber(order.winningAmount) || 0,
        profit: decimalToNumber(order.profit) || 0
      }))
    }
  })
  const sortBy = args.sortBy || 'orderCount'

  rankings.sort((left, right) => {
    if (sortBy === 'winningAmount') {
      return right.winningAmount - left.winningAmount || right.wonOrderCount - left.wonOrderCount
    }

    if (sortBy === 'profit') {
      return right.profit - left.profit || right.wonOrderCount - left.wonOrderCount
    }

    return right.wonOrderCount - left.wonOrderCount || right.winningAmount - left.winningAmount
  })

  const totalWinningAmount = rankings.reduce((total, item) => total + item.winningAmount, 0)
  const totalProfit = rankings.reduce((total, item) => total + item.profit, 0)

  return {
    year: range.year,
    month: range.month,
    sortBy,
    totalWonOrderCount: orders.length,
    totalCompanyCount: rankings.length,
    totalWinningAmount: Math.round(totalWinningAmount * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    rankings: rankings.slice(0, args.limit || 10),
    message: orders.length
      ? 'Customer ranking generated from actual won orders.'
      : 'Insufficient data available: no accessible won orders found in this period.'
  }
}

export function createCustomerDealRankingTool(): AgentTool<CustomerDealRankingArgs, Awaited<ReturnType<typeof executeGetCustomerDealRanking>>> {
  return {
    name: 'get_customer_deal_ranking',
    description: 'Rank accessible customers for a year or month by won order count, deal value or profit. Use for questions such as which customer had the most deals this year.',
    parameters: customerDealRankingSchema,
    execute: (args, context) => executeGetCustomerDealRanking(args, context)
  }
}
