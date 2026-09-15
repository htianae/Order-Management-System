import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { decimalToNumber } from '../utils/serialize.js'
import { countTokenMatches, normalizeText, quantitySimilarityScore } from '../utils/similarity.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const similarWonOrdersSchema = z.object({
  orderId: z.string().trim().optional(),
  materialCode: z.string().trim().optional(),
  materialName: z.string().trim().optional(),
  modelSpec: z.string().trim().optional(),
  quantity: z.number().nonnegative().optional(),
  customerName: z.string().trim().optional(),
  limit: z.number().int().min(1).max(20).optional()
})

export type SimilarWonOrdersArgs = z.infer<typeof similarWonOrdersSchema>

export function scoreCandidate(input: SimilarWonOrdersArgs, order: any, item: any, now = new Date()) {
  let score = 0
  const reasons: string[] = []
  const itemText = [item.materialDescription, item.remark, order.productNameCn, order.modelSpec].filter(Boolean).join(' ')

  if (input.materialCode && item.materialCode && normalizeText(input.materialCode) === normalizeText(item.materialCode)) {
    score += 40
    reasons.push('Item code match')
  } else if (input.materialCode && item.materialCode && normalizeText(item.materialCode).includes(normalizeText(input.materialCode))) {
    score += 25
    reasons.push('Partial item code match')
  }

  const nameMatches = countTokenMatches(input.materialName, itemText)
  if (nameMatches > 0) {
    score += Math.min(25, nameMatches * 8)
    reasons.push('Item name match')
  }

  const specMatches = countTokenMatches(input.modelSpec, itemText)
  if (specMatches > 0) {
    score += Math.min(15, specMatches * 5)
    reasons.push('Model and specification match')
  }

  if (input.customerName && normalizeText(order.inquiryCompany) === normalizeText(input.customerName)) {
    score += 10
    reasons.push('Same customer')
  }

  const quantityScore = quantitySimilarityScore(input.quantity, decimalToNumber(item.quantity))
  if (quantityScore > 0) {
    score += quantityScore
    reasons.push('Similar quantity')
  }

  const inquiryDate = order.inquiryDate instanceof Date ? order.inquiryDate : new Date(order.inquiryDate)
  if (!Number.isNaN(inquiryDate.getTime())) {
    const days = Math.abs(now.getTime() - inquiryDate.getTime()) / 86400000

    if (days <= 366) {
      score += 5
      reasons.push('Historical data from the past year')
    }
  }

  return { score, reasons }
}

export async function executeSearchSimilarWonOrders(args: SimilarWonOrdersArgs, context: ToolContext, db: any = prisma) {
  const limit = args.limit || 10
  let input = args

  if (args.orderId && (!args.materialCode && !args.materialName && !args.modelSpec)) {
    const currentOrder = await db.order.findFirst({
      where: { AND: [getOrderReadScope(context.user), { id: args.orderId }] },
      include: { items: { orderBy: { lineNo: 'asc' } } }
    })

    if (currentOrder) {
      const firstItem = currentOrder.items?.[0]
      input = {
        ...args,
        materialCode: firstItem?.materialCode || currentOrder.productCode || args.materialCode,
        materialName: firstItem?.materialDescription || currentOrder.productNameCn || args.materialName,
        modelSpec: firstItem?.remark || currentOrder.modelSpec || args.modelSpec,
        quantity: decimalToNumber(firstItem?.quantity || currentOrder.quantity) || args.quantity,
        customerName: currentOrder.inquiryCompany || args.customerName
      }
    }
  }

  const orders = await db.order.findMany({
    where: {
      AND: [
        getOrderReadScope(context.user),
        { bidResult: 'WON' }
      ]
    },
    orderBy: { inquiryDate: 'desc' },
    take: 200,
    include: {
      items: {
        orderBy: { lineNo: 'asc' }
      }
    }
  })

  const matches = orders.flatMap((order: any) => (order.items || []).map((item: any) => {
    const scored = scoreCandidate(input, order, item)
    const quantity = decimalToNumber(item.quantity)
    const winningAmount = decimalToNumber(item.winningAmount) || decimalToNumber(order.winningAmount)
    const unitPrice = decimalToNumber(item.quotedPrice) || (winningAmount && quantity ? winningAmount / quantity : null)

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      inquiryCompany: order.inquiryCompany,
      inquiryDate: order.inquiryDate,
      materialCode: item.materialCode,
      materialName: item.materialDescription || order.productNameCn,
      modelSpec: item.remark || order.modelSpec,
      quantity,
      quotedPrice: decimalToNumber(item.quotedPrice) || decimalToNumber(order.quotedAmount),
      winningAmount,
      unitPrice,
      purchaseCost: decimalToNumber(item.purchaseTotal),
      score: scored.score,
      reasons: scored.reasons
    }
  }))
    .filter((match: { score: number }) => match.score > 0)
    .sort((left: { score: number }, right: { score: number }) => right.score - left.score)
    .slice(0, limit)

  return {
    matches,
    message: matches.length ? 'Similar historical won orders found.' : 'Insufficient data available: no similar historical won orders found.'
  }
}

export function createSimilarWonOrdersTool(): AgentTool<SimilarWonOrdersArgs, Awaited<ReturnType<typeof executeSearchSimilarWonOrders>>> {
  return {
    name: 'search_similar_won_orders',
    description: 'Find similar historical won orders within the permitted scope using item code, name, model, quantity and customer.',
    parameters: similarWonOrdersSchema,
    execute: (args, context) => executeSearchSimilarWonOrders(args, context)
  }
}
