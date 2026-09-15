import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { decimalToNumber } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import { calculateRecommendedQuoteFromData } from './calculateRecommendedQuote.tool.js'
import { scoreCandidate } from './similarWonOrders.tool.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const historicalQuoteRecommendationSchema = z.object({
  orderId: z.string().trim().optional().describe('Current order database ID. Pass unchanged when the user asks about a quote from the order details page.'),
  materialCode: z.string().trim().optional().describe('Item code or product code.'),
  materialName: z.string().trim().optional().describe('Item name or product name.'),
  modelSpec: z.string().trim().optional().describe('Model and specifications.'),
  quantity: z.number().nonnegative().optional().describe('Required quantity.'),
  customerName: z.string().trim().optional().describe('Customer name.'),
  purchaseCost: z.number().nonnegative().optional().describe('Current estimated purchase cost per unit.'),
  targetProfitRate: z.number().min(0).max(0.9).optional().describe('Target profit rate; 0.2 means 20%.'),
  limit: z.number().int().min(1).max(20).optional().describe('Number of historical records per category. Default: 5.')
})

export type HistoricalQuoteRecommendationArgs = z.infer<typeof historicalQuoteRecommendationSchema>

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function priceRange(matches: Array<{ unitPrice: number | null }>) {
  const prices = matches
    .map((match) => match.unitPrice)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  if (!prices.length) {
    return null
  }

  return {
    low: roundMoney(Math.min(...prices)),
    high: roundMoney(Math.max(...prices)),
    average: roundMoney(prices.reduce((total, price) => total + price, 0) / prices.length)
  }
}

function toMatch(input: HistoricalQuoteRecommendationArgs, order: any, item: any) {
  const scored = scoreCandidate(input, order, item)
  const quantity = decimalToNumber(item.quantity)
  const winningAmount = decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount)
  const quotedPrice = decimalToNumber(item.quotedPrice) || decimalToNumber(order.quotedAmount)
  const unitPrice = quotedPrice || (winningAmount && quantity ? winningAmount / quantity : null)

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    inquiryCompany: order.inquiryCompany,
    inquiryDate: order.inquiryDate,
    bidResult: order.bidResult,
    materialCode: item.materialCode,
    materialName: item.materialDescription || order.productNameCn,
    modelSpec: item.remark || order.modelSpec,
    quantity,
    quotedPrice,
    winningAmount,
    unitPrice,
    purchaseCost: decimalToNumber(item.purchaseTotal),
    score: scored.score,
    reasons: scored.reasons
  }
}

async function enrichFromCurrentOrder(args: HistoricalQuoteRecommendationArgs, context: ToolContext, db: any) {
  if (!args.orderId || (args.materialCode || args.materialName || args.modelSpec)) {
    return args
  }

  const currentOrder = await db.order.findFirst({
    where: { AND: [getOrderReadScope(context.user), { id: args.orderId }] },
    include: { items: { orderBy: { lineNo: 'asc' } } }
  })

  if (!currentOrder) {
    return args
  }

  const firstItem = currentOrder.items?.[0]

  return {
    ...args,
    materialCode: firstItem?.materialCode || currentOrder.productCode || args.materialCode,
    materialName: firstItem?.materialDescription || currentOrder.productNameCn || args.materialName,
    modelSpec: firstItem?.remark || currentOrder.modelSpec || args.modelSpec,
    quantity: decimalToNumber(firstItem?.quantity || currentOrder.quantity) || args.quantity,
    customerName: currentOrder.inquiryCompany || args.customerName,
    purchaseCost: args.purchaseCost ?? decimalToNumber(firstItem?.purchaseUnitPrice || firstItem?.purchaseTotal || currentOrder.purchaseCost) ?? undefined
  }
}

export async function executeGetHistoricalQuoteRecommendation(
  args: HistoricalQuoteRecommendationArgs,
  context: ToolContext,
  db: any = prisma
) {
  const input = await enrichFromCurrentOrder(args, context, db)
  const limit = input.limit || 5
  const orders = await db.order.findMany({
    where: {
      AND: [
        getOrderReadScope(context.user),
        { bidResult: { in: ['WON', 'LOST'] } }
      ]
    },
    include: {
      items: {
        orderBy: { lineNo: 'asc' }
      }
    },
    orderBy: { inquiryDate: 'desc' },
    take: 300
  })
  const matches = orders.flatMap((order: any) => (order.items || []).map((item: any) => toMatch(input, order, item)))
    .filter((match: { score: number }) => match.score > 0)
    .sort((left: { score: number }, right: { score: number }) => right.score - left.score)
  const wonMatches = matches.filter((match: { bidResult: string }) => match.bidResult === 'WON').slice(0, limit)
  const lostMatches = matches.filter((match: { bidResult: string }) => match.bidResult === 'LOST').slice(0, limit)
  const recommendation = calculateRecommendedQuoteFromData({
    targetProfitRate: input.targetProfitRate ?? 0.2,
    purchaseCost: input.purchaseCost,
    similarOrders: wonMatches
  })
  const wonRange = priceRange(wonMatches)
  const lostRange = priceRange(lostMatches)

  return {
    input,
    recommendation,
    wonMatches,
    lostMatches,
    wonPriceRange: wonRange,
    lostPriceRange: lostRange,
    summary: wonMatches.length
      ? `Found ${wonMatches.length} historical won records${lostMatches.length ? ` and ${lostMatches.length} lost quotes for reference.` : '.'}`
      : 'Insufficient data available: no similar historical won orders; a reliable recommended price cannot be generated.',
    riskTips: [
      ...(recommendation.riskTips || []),
      ...(lostRange ? ['Historical lost quotes may indicate price ceilings or competitive pressure; do not use them alone as recommended prices.'] : []),
      'Review manually against current purchase costs, delivery times and customer budget.'
    ]
  }
}

export function createHistoricalQuoteRecommendationTool(): AgentTool<
  HistoricalQuoteRecommendationArgs,
  Awaited<ReturnType<typeof executeGetHistoricalQuoteRecommendation>>
> {
  return {
    name: 'get_historical_quote_recommendation',
    description: 'Use item code, name, model, quantity and customer from a new inquiry or current order to find historical won and lost records and recommend a quote range.',
    parameters: historicalQuoteRecommendationSchema,
    execute: (args, context) => executeGetHistoricalQuoteRecommendation(args, context)
  }
}
