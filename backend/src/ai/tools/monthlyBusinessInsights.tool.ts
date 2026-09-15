import { z } from 'zod'

import { decimalToNumber } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'
import {
  averagePrice,
  buildInquiryItemWhere,
  buildOrderWhere,
  displayProductName,
  getAnalysisDateRange,
  incrementMap,
  mapToRanking,
  roundMoney
} from './monthlyAnalysisUtils.js'

const monthlyBusinessInsightsSchema = z.object({
  year: z.number().int().min(1900).max(3000).optional().describe('Reporting year, e.g. 2026. Defaults to the current year.'),
  month: z.number().int().min(1).max(12).optional().describe('Reporting month, 1 to 12. Defaults to the current month.'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of results per ranking. Default: 10.')
})

export type MonthlyBusinessInsightsArgs = z.infer<typeof monthlyBusinessInsightsSchema>

export async function executeGetMonthlyBusinessInsights(
  args: MonthlyBusinessInsightsArgs,
  context: ToolContext,
  db: any = prisma,
  now = new Date()
) {
  const range = getAnalysisDateRange(args.year, args.month || now.getMonth() + 1, now)
  const limit = args.limit || 10
  const [inquiryItems, orders] = await Promise.all([
    db.inquiryItem.findMany({
      where: buildInquiryItemWhere(context, range),
      include: {
        inquiry: {
          select: {
            inquiryCompany: true,
            inquiryDate: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    }),
    db.order.findMany({
      where: buildOrderWhere(context, range),
      include: {
        items: {
          orderBy: { lineNo: 'asc' }
        }
      },
      orderBy: { inquiryDate: 'desc' },
      take: 600
    })
  ])
  const productCounts = new Map<string, number>()
  const productWonCounts = new Map<string, number>()
  const manufacturerCounts = new Map<string, number>()
  const manufacturerWonCounts = new Map<string, number>()
  const customerCounts = new Map<string, number>()
  const quotedPrices: unknown[] = []

  inquiryItems.forEach((item: any) => {
    const productName = displayProductName(item)
    const manufacturerName = item.manufacturer || item.supplierName || '-'

    incrementMap(productCounts, productName)
    incrementMap(manufacturerCounts, manufacturerName)
    incrementMap(customerCounts, item.inquiry?.inquiryCompany || '-')
    quotedPrices.push(item.quotedPrice)

    if (item.result === 'WON') {
      incrementMap(productWonCounts, productName)
      incrementMap(manufacturerWonCounts, manufacturerName)
    }
  })

  const wonOrders = orders.filter((order: any) => order.bidResult === 'WON')
  const winningAmount = wonOrders.reduce((total: number, order: any) => total + (decimalToNumber(order.winningAmount) || 0), 0)
  const hotProducts = mapToRanking(productCounts, limit).map((item) => ({
    ...item,
    wonCount: productWonCounts.get(item.name) || 0,
    winRate: item.count ? (productWonCounts.get(item.name) || 0) / item.count : 0
  }))
  const hotManufacturers = mapToRanking(manufacturerCounts, limit).map((item) => ({
    ...item,
    wonCount: manufacturerWonCounts.get(item.name) || 0,
    winRate: item.count ? (manufacturerWonCounts.get(item.name) || 0) / item.count : 0
  }))
  const highWinRateProducts = hotProducts
    .filter((item) => item.count >= 2)
    .sort((left, right) => right.winRate - left.winRate || right.count - left.count)
    .slice(0, limit)
  const highVolumeLowWinProducts = hotProducts
    .filter((item) => item.count >= 2 && item.winRate < 0.5)
    .sort((left, right) => right.count - left.count || left.winRate - right.winRate)
    .slice(0, limit)

  return {
    year: range.year,
    month: range.month,
    totalInquiryCount: inquiryItems.length,
    totalInquiryWonCount: inquiryItems.filter((item: any) => item.result === 'WON').length,
    inquiryWinRate: inquiryItems.length ? inquiryItems.filter((item: any) => item.result === 'WON').length / inquiryItems.length : 0,
    totalWonOrderCount: wonOrders.length,
    totalWinningAmount: roundMoney(winningAmount),
    averageQuotedPrice: averagePrice(quotedPrices),
    hotProducts,
    hotManufacturers,
    highWinRateProducts,
    highVolumeLowWinProducts,
    hotCustomers: mapToRanking(customerCounts, limit),
    recentWonOrders: wonOrders.slice(0, limit).map((order: any) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      inquiryCompany: order.inquiryCompany,
      inquiryDate: order.inquiryDate,
      winningAmount: decimalToNumber(order.winningAmount),
      products: (order.items || []).slice(0, 3).map((item: any) => displayProductName(item))
    })),
    message: inquiryItems.length || orders.length
      ? 'Monthly business insights generated.'
      : 'Insufficient data available: no accessible inquiries or orders found for this month.'
  }
}

export function createMonthlyBusinessInsightsTool(): AgentTool<
  MonthlyBusinessInsightsArgs,
  Awaited<ReturnType<typeof executeGetMonthlyBusinessInsights>>
> {
  return {
    name: 'get_monthly_business_insights',
    description: 'Generate monthly business insights covering popular inquiry products and manufacturers, high-win-rate products, frequently requested products with few wins, customers and deal summaries. Suitable for month-end reviews.',
    parameters: monthlyBusinessInsightsSchema,
    execute: (args, context) => executeGetMonthlyBusinessInsights(args, context)
  }
}
