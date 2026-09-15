import { z } from 'zod'

import { getOrderReadScope } from '../security/tool-permissions.js'
import { serializeForAi } from '../utils/serialize.js'
import { prisma } from '../../utils/prisma.js'
import { buildOrderCustomerPaymentSummary } from '../../utils/orderCustomerPayment.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const unpaidOrdersSchema = z.object({
  customerName: z.string().trim().optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export type UnpaidOrdersArgs = z.infer<typeof unpaidOrdersSchema>

export async function executeGetUnpaidOrders(args: UnpaidOrdersArgs, context: ToolContext, db: any = prisma) {
  const customerFilter = args.customerName
    ? { order: { inquiryCompany: { contains: args.customerName, mode: 'insensitive' } } }
    : {}
  const orderCustomerFilter = args.customerName
    ? { inquiryCompany: { contains: args.customerName, mode: 'insensitive' } }
    : {}

  const [supplierUnpaid, customerCandidates] = await Promise.all([
    db.purchaseInfo.findMany({
      where: {
        AND: [
          { order: getOrderReadScope(context.user) },
          customerFilter,
          {
            OR: [
              { advancePaymentStatus: { not: 'PAID' } },
              { arrivalPaymentStatus: { not: 'PAID' } },
              { paymentApplications: { some: { status: 'PENDING' } } }
            ]
          }
        ]
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            inquiryCompany: true
          }
        },
        batchItems: {
          select: {
            id: true,
            lineNo: true,
            materialDescription: true
          }
        },
        paymentApplications: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: args.limit
    }),
    db.order.findMany({
      where: {
        AND: [
          getOrderReadScope(context.user),
          orderCustomerFilter,
          { bidResult: 'WON' }
        ]
      },
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        winningAmount: true,
        currentStatus: true,
        customerPayments: {
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'desc' }
          ],
          select: {
            id: true,
            updatedAt: true,
            orderItemId: true,
            paidAmount: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  ])
  const effectiveCustomerUnpaid = customerCandidates.filter((order: any) => {
    const orderPayment = order.customerPayments.find(
      (payment: any) => payment.orderItemId === null
    ) || null
    const summary = buildOrderCustomerPaymentSummary({
      winningAmount: order.winningAmount,
      orderPayment,
      itemPayments: order.customerPayments.filter(
        (payment: any) => payment.orderItemId !== null
      )
    })

    return summary.state !== 'PAID'
  })
  const customerUnpaid = args.limit === undefined
    ? effectiveCustomerUnpaid
    : effectiveCustomerUnpaid.slice(0, args.limit)

  return {
    supplierUnpaid: serializeForAi(supplierUnpaid) as unknown[],
    customerUnpaid: serializeForAi(customerUnpaid) as unknown[],
    message: supplierUnpaid.length || customerUnpaid.length
      ? 'Orders with outstanding payments found.'
      : 'Insufficient data available: no unpaid orders found.'
  }
}

export function createUnpaidOrdersTool(): AgentTool<UnpaidOrdersArgs, Awaited<ReturnType<typeof executeGetUnpaidOrders>>> {
  return {
    name: 'get_unpaid_orders',
    description: 'Query supplier unpaid orders, pending payment requests and customer unpaid orders within the current user permission scope.',
    parameters: unpaidOrdersSchema,
    execute: (args, context) => executeGetUnpaidOrders(args, context)
  }
}
