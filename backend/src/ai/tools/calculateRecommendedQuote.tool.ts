import { z } from 'zod'

import { decimalToNumber } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'
import { executeGetOrderDetail } from './orderDetail.tool.js'
import { executeSearchSimilarWonOrders } from './similarWonOrders.tool.js'

const quoteSchema = z.object({
  orderId: z.string().trim().optional(),
  materialCode: z.string().trim().optional(),
  materialName: z.string().trim().optional(),
  modelSpec: z.string().trim().optional(),
  quantity: z.number().nonnegative().optional(),
  customerName: z.string().trim().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  targetProfitRate: z.number().min(0).max(0.9).optional()
})

export type RecommendedQuoteArgs = z.infer<typeof quoteSchema>

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function calculateRecommendedQuoteFromData(input: {
  targetProfitRate: number
  purchaseCost?: number | null
  similarOrders: Array<{ unitPrice?: number | null; orderNo: string }>
}) {
  const dataInsufficientReasons: string[] = []
  const prices = input.similarOrders
    .map((order) => order.unitPrice)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  if (!prices.length) {
    dataInsufficientReasons.push('No similar historical won orders found')
  }

  if (!input.purchaseCost || input.purchaseCost <= 0) {
    dataInsufficientReasons.push('Purchase cost is missing for the current order')
  }

  if (!prices.length) {
    return {
      dataSufficient: false,
      dataInsufficientReasons,
      referencePrice: null,
      recommendedRange: {
        low: null,
        middle: null,
        high: null
      },
      riskTips: ['Insufficient historical winning prices to calculate a deterministic quote.']
    }
  }

  const referencePrice = median(prices)
  const historicalLow = Math.min(...prices)
  const historicalHigh = Math.max(...prices)
  const costPrice = input.purchaseCost && input.purchaseCost > 0
    ? input.purchaseCost / (1 - input.targetProfitRate)
    : null
  const middle = Math.max(referencePrice, costPrice || 0)
  const low = Math.max(historicalLow * 0.95, costPrice ? costPrice * 0.98 : referencePrice * 0.95)
  const high = Math.max(historicalHigh * 1.03, middle * 1.08)

  return {
    dataSufficient: dataInsufficientReasons.length === 0,
    dataInsufficientReasons,
    referencePrice: roundMoney(referencePrice),
    recommendedRange: {
      low: roundMoney(low),
      middle: roundMoney(middle),
      high: roundMoney(high)
    },
    targetProfitRate: input.targetProfitRate,
    estimatedProfitRateAtMiddle: input.purchaseCost && middle > 0
      ? roundMoney((middle - input.purchaseCost) / middle)
      : null,
    historicalPriceRange: {
      low: roundMoney(historicalLow),
      high: roundMoney(historicalHigh)
    },
    riskTips: [
      ...(dataInsufficientReasons.length ? dataInsufficientReasons.map((reason) => `Insufficient data: ${reason}`) : []),
      'Review manually against current lead times, customer budget and competition.'
    ]
  }
}

export async function executeCalculateRecommendedQuote(args: RecommendedQuoteArgs, context: ToolContext, db: any = prisma) {
  let purchaseCost = args.purchaseCost
  let currentOrderSummary: unknown = null

  if (args.orderId) {
    const detail = await executeGetOrderDetail({ orderId: args.orderId }, context, db)

    if (detail.found && 'order' in detail) {
      currentOrderSummary = detail.order
      const order = detail.order as any
      purchaseCost = purchaseCost ?? decimalToNumber(order.purchaseCost) ?? undefined
    }
  }

  const similar = await executeSearchSimilarWonOrders(args, context, db)
  const result = calculateRecommendedQuoteFromData({
    targetProfitRate: args.targetProfitRate ?? 0.2,
    purchaseCost,
    similarOrders: similar.matches
  })

  return {
    ...result,
    currentOrderSummary,
    historicalBasis: similar.matches.slice(0, 5)
  }
}

export function createCalculateRecommendedQuoteTool(): AgentTool<RecommendedQuoteArgs, Awaited<ReturnType<typeof executeCalculateRecommendedQuote>>> {
  return {
    name: 'calculate_recommended_quote',
    description: 'Generate a quote recommendation using deterministic rules based on the current order, similar historical won orders and purchase cost.',
    parameters: quoteSchema,
    execute: (args, context) => executeCalculateRecommendedQuote(args, context)
  }
}
