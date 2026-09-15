import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'

import { getBossDashboard } from './report.controller.js'
import { prisma } from '../utils/prisma.js'

type RecoveryOrder = {
  winningAmount: string
  customerPayments: Array<{
    id: string
    orderItemId: string | null
    paidAmount: string
    updatedAt: string
  }>
}

type ReminderOrder = RecoveryOrder & {
  id: string
  orderNo: string
  inquiryCompany: string
  productNameCn: string | null
  currentStatus: 'CUSTOMER_PAID' | 'COMPLETED'
  createdAt: string
}

function createResponse() {
  return {
    body: undefined as any,
    json(payload: unknown) {
      this.body = payload
      return this
    }
  }
}

async function runBossDashboard(
  orders: RecoveryOrder[],
  totalWinningAmount: string,
  reminderOrders: ReminderOrder[] = []
) {
  const originalTransaction = prisma.$transaction
  const originalUserFindMany = prisma.user.findMany
  const originalOrderCount = prisma.order.count
  const originalOrderAggregate = prisma.order.aggregate
  const originalOrderFindMany = prisma.order.findMany
  const originalOrderGroupBy = prisma.order.groupBy
  const originalPurchaseInfoGroupBy = prisma.purchaseInfo.groupBy
  const originalInquiryItemFindMany = prisma.inquiryItem.findMany
  let recoveryQuery: any
  let unpaidQuery: any

  ;(prisma as any).$transaction = async (operations: Promise<unknown>[]) => Promise.all(operations)
  ;(prisma.user as any).findMany = async () => []
  ;(prisma.order as any).count = async () => 2
  ;(prisma.order as any).aggregate = async () => ({
    _sum: {
      winningAmount: new Prisma.Decimal(totalWinningAmount),
      profit: new Prisma.Decimal(0)
    },
    _avg: {
      profitRate: new Prisma.Decimal(0)
    }
  })
  ;(prisma.order as any).findMany = async (query: any) => {
    if (query.select?.id && query.select?.customerPayments) {
      unpaidQuery = query
      return reminderOrders.map((order) => ({
        ...order,
        winningAmount: new Prisma.Decimal(order.winningAmount),
        createdAt: new Date(order.createdAt),
        customerPayments: order.customerPayments.map((payment) => ({
          id: payment.id,
          orderItemId: payment.orderItemId,
          paidAmount: new Prisma.Decimal(payment.paidAmount),
          updatedAt: new Date(payment.updatedAt)
        }))
      }))
    }

    if (query.select?.customerPayments) {
      recoveryQuery = query
      return orders.map((order) => ({
        winningAmount: new Prisma.Decimal(order.winningAmount),
        customerPayments: order.customerPayments.map((payment) => ({
          id: payment.id,
          orderItemId: payment.orderItemId,
          paidAmount: new Prisma.Decimal(payment.paidAmount),
          updatedAt: new Date(payment.updatedAt)
        }))
      }))
    }

    return []
  }
  ;(prisma.order as any).groupBy = async () => []
  ;(prisma.purchaseInfo as any).groupBy = async () => []
  ;(prisma.inquiryItem as any).findMany = async () => []

  try {
    const response = createResponse()
    await getBossDashboard({ query: {} } as any, response as any)
    return { response: response.body, recoveryQuery, unpaidQuery }
  } finally {
    ;(prisma as any).$transaction = originalTransaction
    ;(prisma.user as any).findMany = originalUserFindMany
    ;(prisma.order as any).count = originalOrderCount
    ;(prisma.order as any).aggregate = originalOrderAggregate
    ;(prisma.order as any).findMany = originalOrderFindMany
    ;(prisma.order as any).groupBy = originalOrderGroupBy
    ;(prisma.purchaseInfo as any).groupBy = originalPurchaseInfoGroupBy
    ;(prisma.inquiryItem as any).findMany = originalInquiryItemFindMany
  }
}

test('computes recovery once per dashboard order with order-level precedence', async () => {
  const { response, recoveryQuery } = await runBossDashboard([
    {
      winningAmount: '1000',
      customerPayments: [
        { id: 'payment-order', orderItemId: null, paidAmount: '300', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'payment-item-1', orderItemId: 'item-1', paidAmount: '200', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    },
    {
      winningAmount: '500',
      customerPayments: [{ id: 'payment-item-2', orderItemId: 'item-2', paidAmount: '500', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }
  ], '1500')

  assert.equal(response.summary.receivedAmount, '800')
  assert.equal(response.summary.recoveryRate, '0.5333333333333333')
  assert.equal(response.summary.totalWinningAmount, '1500')
  assert.deepEqual(recoveryQuery.where, undefined)
})

test('caps legacy overpayments at each order total', async () => {
  const { response } = await runBossDashboard([
    {
      winningAmount: '100',
      customerPayments: [
        { id: 'payment-item-1', orderItemId: 'item-1', paidAmount: '60', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'payment-item-2', orderItemId: 'item-2', paidAmount: '80', updatedAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
  ], '100')

  assert.equal(response.summary.receivedAmount, '100')
  assert.equal(response.summary.recoveryRate, '1')
})

test('returns zero recovery rate when the dashboard winning total is zero', async () => {
  const { response } = await runBossDashboard([], '0')

  assert.equal(response.summary.receivedAmount, '0')
  assert.equal(response.summary.recoveryRate, '0')
})

test('uses the newest order-level payment when the relation array is out of order', async () => {
  const { response, recoveryQuery } = await runBossDashboard([
    {
      winningAmount: '1000',
      customerPayments: [
        { id: 'payment-older', orderItemId: null, paidAmount: '100', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'payment-item', orderItemId: 'item-1', paidAmount: '200', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'payment-newer', orderItemId: null, paidAmount: '700', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
  ], '1000')

  assert.equal(response.summary.receivedAmount, '700')
  assert.deepEqual(recoveryQuery.select.customerPayments, {
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
  })
})

test('uses the highest id when order-level payments have the same update time', async () => {
  const { response } = await runBossDashboard([
    {
      winningAmount: '1000',
      customerPayments: [
        { id: 'payment-a', orderItemId: null, paidAmount: '100', updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'payment-b', orderItemId: null, paidAmount: '450', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
  ], '1000')

  assert.equal(response.summary.receivedAmount, '450')
})

test('boss unpaid reminders use effective amounts instead of stored payment statuses', async () => {
  const reminderBase = {
    inquiryCompany: '客户A',
    productNameCn: '产品A',
    currentStatus: 'CUSTOMER_PAID' as const,
    createdAt: '2026-08-01T00:00:00.000Z'
  }
  const { response, unpaidQuery } = await runBossDashboard([], '3000', [
    {
      ...reminderBase,
      id: 'fully-paid-order-level',
      orderNo: 'A001',
      winningAmount: '1000',
      customerPayments: [
        { id: 'order-payment', orderItemId: null, paidAmount: '1000', updatedAt: '2026-08-02T00:00:00.000Z' },
        { id: 'stale-item-payment', orderItemId: 'item-1', paidAmount: '0', updatedAt: '2026-08-01T00:00:00.000Z' }
      ]
    },
    {
      ...reminderBase,
      id: 'partial-order-level',
      orderNo: 'A002',
      winningAmount: '1000',
      customerPayments: [
        { id: 'order-payment-2', orderItemId: null, paidAmount: '300', updatedAt: '2026-08-03T00:00:00.000Z' }
      ]
    },
    {
      ...reminderBase,
      id: 'fully-paid-legacy',
      orderNo: 'A003',
      winningAmount: '1000',
      customerPayments: [
        { id: 'legacy-1', orderItemId: 'item-2', paidAmount: '600', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'legacy-2', orderItemId: 'item-3', paidAmount: '500', updatedAt: '2026-08-01T00:00:00.000Z' }
      ]
    }
  ])

  assert.deepEqual(
    response.reminders.unpaidOrders.map((order: { id: string }) => order.id),
    ['partial-order-level']
  )
  assert.equal(unpaidQuery.take, undefined)
})
