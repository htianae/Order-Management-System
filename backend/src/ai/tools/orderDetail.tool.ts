import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { serializeForAi } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const orderDetailSchema = z.object({
  orderId: z.string().trim().optional().describe('Order database ID. If the user provides the current page order ID, pass it here unchanged.'),
  orderNo: z.string().trim().optional().describe('Order number. Use only when the user explicitly supplies an order number; do not put a database order ID here.')
}).refine((value) => Boolean(value.orderId || value.orderNo), {
  message: 'At least one of orderId or orderNo is required'
})

export type OrderDetailArgs = z.infer<typeof orderDetailSchema>

export async function executeGetOrderDetail(args: OrderDetailArgs, context: ToolContext, db: any = prisma) {
  const order = await db.order.findFirst({
    where: {
      AND: [
        getOrderReadScope(context.user),
        args.orderId ? { id: args.orderId } : { orderNo: args.orderNo }
      ]
    },
    include: {
      creator: { select: { id: true, username: true, displayName: true } },
      items: {
        include: {
          supplierQuotes: {
            include: { supplier: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' }
          },
          purchaseInfo: true,
          purchaseBatch: {
            include: {
              batchItems: {
                select: {
                  id: true,
                  lineNo: true,
                  materialCode: true,
                  materialDescription: true,
                  purchaseQuantity: true,
                  purchaseUnitPrice: true,
                  purchaseTotal: true,
                  currentStatus: true
                },
                orderBy: { lineNo: 'asc' }
              },
              paymentApplications: { orderBy: { createdAt: 'desc' } }
            }
          },
          shippingInfo: true,
          customerPayment: true
        },
        orderBy: { lineNo: 'asc' }
      },
      supplierQuotes: {
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' }
      },
      purchaseInfos: {
        include: {
          batchItems: {
            select: {
              id: true,
              lineNo: true,
              materialCode: true,
              materialDescription: true,
              purchaseQuantity: true,
              purchaseUnitPrice: true,
              purchaseTotal: true,
              currentStatus: true
            },
            orderBy: { lineNo: 'asc' }
          },
          paymentApplications: { orderBy: { createdAt: 'desc' } }
        }
      },
      shippingInfos: true,
      customerPayments: true,
      statusRecords: { orderBy: { createdAt: 'desc' }, take: 20 },
      itemStatusRecords: { orderBy: { createdAt: 'desc' }, take: 50 },
      files: {
        select: {
          id: true,
          category: true,
          targetType: true,
          targetId: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!order) {
    return {
      found: false,
      message: 'Insufficient data available: no accessible order found.'
    }
  }

  return {
    found: true,
    order: serializeForAi(order)
  }
}

export function createOrderDetailTool(): AgentTool<OrderDetailArgs, Awaited<ReturnType<typeof executeGetOrderDetail>>> {
  return {
    name: 'get_order_detail',
    description: 'Query complete accessible order details by database ID or order number. Pass the current page order ID unchanged as orderId.',
    parameters: orderDetailSchema,
    execute: (args, context) => executeGetOrderDetail(args, context)
  }
}
