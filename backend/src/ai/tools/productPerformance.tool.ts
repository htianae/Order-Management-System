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
  matchesProduct,
  roundMoney
} from './monthlyAnalysisUtils.js'

const productPerformanceSchema = z.object({
  year: z.number().int().min(1900).max(3000).optional().describe('Reporting year, e.g. 2026. Defaults to the current year.'),
  month: z.number().int().min(1).max(12).optional().describe('Reporting month, 1 to 12. Omit for the entire year.'),
  productKeyword: z.string().trim().optional().describe('Product, product name or item keyword, e.g. cooling fan. Supports partial matches in any language.'),
  modelSpec: z.string().trim().optional().describe('Model or specification keyword, e.g. GFDD520. Supports partial matching.'),
  limit: z.number().int().min(1).max(50).optional().describe('Number of representative records to return. Default: 10.')
})

export type ProductPerformanceArgs = z.infer<typeof productPerformanceSchema>

function itemProductText(item: any) {
  return [
    item.materialCode,
    item.materialName,
    item.materialDescription,
    item.modelSpec,
    item.remark
  ].filter(Boolean).join(' ')
}

export async function executeAnalyzeProductPerformance(
  args: ProductPerformanceArgs,
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
  const matchedInquiryItems = inquiryItems.filter((item: any) => matchesProduct(args, itemProductText(item)))
  const matchedOrderItems = orders.flatMap((order: any) => (order.items || []).map((item: any) => ({ order, item })))
    .filter(({ item }: any) => matchesProduct(args, itemProductText(item)))
  const topManufacturers = new Map<string, number>()
  const topCustomers = new Map<string, number>()
  const productVariants = new Map<string, number>()
  const quotedPrices: unknown[] = []

  matchedInquiryItems.forEach((item: any) => {
    incrementMap(topManufacturers, item.manufacturer || item.supplierName || '-')
    incrementMap(topCustomers, item.inquiry?.inquiryCompany || '-')
    incrementMap(productVariants, displayProductName(item))
    quotedPrices.push(item.quotedPrice)
  })

  matchedOrderItems.forEach(({ order, item }: any) => {
    incrementMap(topManufacturers, item.manufacturer || '-')
    incrementMap(topCustomers, order.inquiryCompany || '-')
    incrementMap(productVariants, displayProductName(item))
    quotedPrices.push(item.quotedPrice)
  })

  const orderWonItems = matchedOrderItems.filter(({ order, item }: any) => order.bidResult === 'WON' || item.bidResult === 'WON')
  const winningAmount = orderWonItems.reduce((total: number, { order, item }: any) => {
    return total + (decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount) || 0)
  }, 0)

  return {
    year: range.year,
    month: range.month,
    productKeyword: args.productKeyword || null,
    modelSpec: args.modelSpec || null,
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
    topManufacturers: mapToRanking(topManufacturers, 10),
    topCustomers: mapToRanking(topCustomers, 10),
    matchedProducts: mapToRanking(productVariants, args.limit || 10),
    recentInquiryItems: matchedInquiryItems.slice(0, args.limit || 10).map((item: any) => ({
      inquiryCompany: item.inquiry?.inquiryCompany,
      inquiryDate: item.inquiry?.inquiryDate,
      materialCode: item.materialCode,
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
      materialCode: item.materialCode,
      materialName: item.materialDescription,
      modelSpec: item.remark,
      manufacturer: item.manufacturer,
      quotedPrice: decimalToNumber(item.quotedPrice),
      winningAmount: decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount)
    })),
    message: matchedInquiryItems.length || matchedOrderItems.length
      ? 'Inquiry and award analysis completed for the product keyword.'
      : 'Insufficient data available: no inquiries or orders match this product keyword.'
  }
}

export function createProductPerformanceTool(): AgentTool<ProductPerformanceArgs, Awaited<ReturnType<typeof executeAnalyzeProductPerformance>>> {
  return {
    name: 'analyze_product_performance',
    description: 'Analyze yearly or monthly inquiries, wins, win rate, deal value, main manufacturers and representative records for a product, name or model. Supports partial name and model matching and month-end product reviews.',
    parameters: productPerformanceSchema,
    execute: (args, context) => executeAnalyzeProductPerformance(args, context)
  }
}
