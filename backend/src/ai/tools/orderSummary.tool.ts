import { z } from 'zod'

import type { AgentTool, ToolContext } from './tool-types.js'
import { executeGetOrderDetail } from './orderDetail.tool.js'

const orderSummarySchema = z.object({
  orderId: z.string().trim().optional().describe('Order database ID. If the user provides the current page order ID, pass it here unchanged.'),
  orderNo: z.string().trim().optional().describe('Order number. Use only when the user explicitly supplies an order number; do not put a database order ID here.')
}).refine((value) => Boolean(value.orderId || value.orderNo), {
  message: 'At least one of orderId or orderNo is required'
})

export type OrderSummaryArgs = z.infer<typeof orderSummarySchema>

export async function executeGenerateOrderSummary(args: OrderSummaryArgs, context: ToolContext) {
  const detail = await executeGetOrderDetail(args, context)

  if (!detail.found || !('order' in detail)) {
    return detail
  }

  const order = detail.order as any
  const itemStatuses = new Set((order.items || []).map((item: any) => item.currentStatus))
  const completedSteps = [
    order.bidResult === 'WON' ? 'Won' : '',
    order.purchaseInfos?.length ? 'Purchase details available' : '',
    order.shippingInfos?.length ? 'Shipping details available' : '',
    order.customerPayments?.length ? 'Customer payment records available' : ''
  ].filter(Boolean)
  const pendingSteps = [
    order.bidResult !== 'WON' ? 'Award details incomplete' : '',
    !order.purchaseInfos?.length ? 'Purchase details incomplete' : '',
    !order.shippingInfos?.length ? 'Shipping details incomplete' : '',
    !order.customerPayments?.length ? 'Customer payment incomplete' : ''
  ].filter(Boolean)

  return {
    found: true,
    orderNo: order.orderNo,
    currentStatus: order.currentStatus,
    itemStatuses: Array.from(itemStatuses),
    completedSteps,
    pendingSteps,
    risks: pendingSteps.length ? pendingSteps.map((step) => `${step}; follow-up required`) : ['No apparent incomplete workflow steps'],
    nextActions: pendingSteps.slice(0, 3)
  }
}

export function createOrderSummaryTool(): AgentTool<OrderSummaryArgs, Awaited<ReturnType<typeof executeGenerateOrderSummary>>> {
  return {
    name: 'generate_order_summary',
    description: 'Generate a structured order summary, current risks and next steps from real order data. Pass the current page order ID unchanged as orderId.',
    parameters: orderSummarySchema,
    execute: (args, context) => executeGenerateOrderSummary(args, context)
  }
}
