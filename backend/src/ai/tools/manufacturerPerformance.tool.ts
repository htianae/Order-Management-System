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
  matchesManufacturer,
  roundMoney
} from './monthlyAnalysisUtils.js'

const manufacturerPerformanceSchema = z.object({
  year: z.number().int().min(1900).max(3000).optional().describe('Reporting year, e.g. 2026. Defaults to the current year.'),
  month: z.number().int().min(1).max(12).optional().describe('Reporting month, 1 to 12. Omit for the entire year.'),
  manufacturerKeyword: z.string().trim().min(1).describe('Manufacturer, brand or supplier keyword. Supports partial matches in any language.'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of representative records to return. Default: 10.')
})

export type ManufacturerPerformanceArgs = z.infer<typeof manufacturerPerformanceSchema>

function manufacturerText(item: any) {
  return [
    item.manufacturer,
    item.supplierName,
    item.supplierRemark
  ].filter(Boolean).join(' ')
}

export async function executeAnalyzeManufacturerPerformance(
  args: ManufacturerPerformanceArgs,
  context: ToolContext,
  db: any = prisma,
  now = new Date()
) {
  const range = getAnalysisDateRange(args.year, args.month, now)
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
      take: 800
    }),
    db.order.findMany({
      where: buildOrderWhere(context, range),
      include: {
        items: {
          orderBy: { lineNo: 'asc' }
        }
      },
      orderBy: { inquiryDate: 'desc' },
      take: 500
    })
  ])
  const matchedInquiryItems = inquiryItems.filter((item: any) => matchesManufacturer(args, manufacturerText(item)))
  const matchedOrderItems = orders.flatMap((order: any) => (order.items || []).map((item: any) => ({ order, item })))
    .filter(({ item }: any) => matchesManufacturer(args, manufacturerText(item)))
  const topProducts = new Map<string, number>()
  const topCustomers = new Map<string, number>()
  const names = new Map<string, number>()
  const quotedPrices: unknown[] = []

  matchedInquiryItems.forEach((item: any) => {
    incrementMap(topProducts, displayProductName(item))
    incrementMap(topCustomers, item.inquiry?.inquiryCompany || '-')
    incrementMap(names, item.manufacturer || item.supplierName || '-')
    quotedPrices.push(item.quotedPrice)
  })

  matchedOrderItems.forEach(({ order, item }: any) => {
    incrementMap(topProducts, displayProductName(item))
    incrementMap(topCustomers, order.inquiryCompany || '-')
    incrementMap(names, item.manufacturer || '-')
    quotedPrices.push(item.quotedPrice)
  })

  const orderWonItems = matchedOrderItems.filter(({ order, item }: any) => order.bidResult === 'WON' || item.bidResult === 'WON')
  const winningAmount = orderWonItems.reduce((total: number, { order, item }: any) => {
    return total + (decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount) || 0)
  }, 0)

  return {
    year: range.year,
    month: range.month,
    manufacturerKeyword: args.manufacturerKeyword,
    inquiryCount: matchedInquiryItems.length,
    inquiryWonCount: matchedInquiryItems.filter((item: any) => item.result === 'WON').length,
    inquiryLostCount: matchedInquiryItems.filter((item: any) => item.result === 'LOST').length,
    inquiryWinRate: matchedInquiryItems.length
      ? matchedInquiryItems.filter((item: any) => item.result === 'WON').length / matchedInquiryItems.length
      : 0,
    orderMatchedItemCount: matchedOrderItems.length,
    orderWonCount: orderWonItems.length,
    orderWinRate: matchedOrderItems.length ? orderWonItems.length / matchedOrderItems.length : 0,
    winningAmount: roundMoney(winningAmount),
    averageQuotedPrice: averagePrice(quotedPrices),
    matchedManufacturerNames: mapToRanking(names, 10),
    topProducts: mapToRanking(topProducts, args.limit || 10),
    topCustomers: mapToRanking(topCustomers, 10),
    recentInquiryItems: matchedInquiryItems.slice(0, args.limit || 10).map((item: any) => ({
      inquiryCompany: item.inquiry?.inquiryCompany,
      inquiryDate: item.inquiry?.inquiryDate,
      materialName: item.materialName,
      modelSpec: item.modelSpec,
      manufacturer: item.manufacturer,
      supplierName: item.supplierName,
      quotedPrice: decimalToNumber(item.quotedPrice),
      result: item.result
    })),
    recentWonOrders: orderWonItems.slice(0, args.limit || 10).map(({ order, item }: any) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      inquiryCompany: order.inquiryCompany,
      inquiryDate: order.inquiryDate,
      materialName: item.materialDescription,
      modelSpec: item.remark,
      manufacturer: item.manufacturer,
      quotedPrice: decimalToNumber(item.quotedPrice),
      winningAmount: decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount)
    })),
    message: matchedInquiryItems.length || matchedOrderItems.length
      ? 'Inquiry and award analysis completed for the manufacturer or brand keyword.'
      : 'Insufficient data available: no inquiries or orders match this manufacturer or brand keyword.'
  }
}

export function createManufacturerPerformanceTool(): AgentTool<
  ManufacturerPerformanceArgs,
  Awaited<ReturnType<typeof executeAnalyzeManufacturerPerformance>>
> {
  return {
    name: 'analyze_manufacturer_performance',
    description: 'Analyze yearly or monthly inquiries, wins, win rate, deal value, main products and representative records for a manufacturer, brand or supplier. Supports partial name matching and month-end manufacturer reviews.',
    parameters: manufacturerPerformanceSchema,
    execute: (args, context) => executeAnalyzeManufacturerPerformance(args, context)
  }
}
