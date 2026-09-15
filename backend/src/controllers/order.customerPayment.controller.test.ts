import { CustomerPaymentStatus, OrderStatus, Prisma } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import * as orderController from './order.controller.js'

const { createUpdateCustomerPaymentHandler } = orderController

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    }
  }
}

function createRequest(params: Record<string, string>, amount: number, status: CustomerPaymentStatus) {
  return {
    user: { id: 'user-1' },
    params,
    body: {
      customerPaymentStatus: status,
      customerPaymentAmount: amount
    }
  } as any
}

function createRepository(overrides: Record<string, (...args: any[]) => Promise<any>> = {}) {
  return {
    findFirst: async () => null,
    upsert: async (args: any) => args.create,
    update: async (args: any) => args.data,
    create: async (args: any) => args.data,
    ...overrides
  } as any
}

interface DependencyOptions {
  orderExists?: boolean
  orderTotal?: string
  existingOrderPaymentId?: string | null
  eligibleItemIds?: string[]
  completedItemIds?: string[]
  customerPayments?: Array<{
    id: string
    orderItemId: string | null
    paidAmount: string
    updatedAt?: Date
  }>
  itemExists?: boolean
  repositoryOverrides?: Record<string, (...args: any[]) => Promise<any>>
}

function createDependencies(options: DependencyOptions = {}) {
  const savedPaymentCalls: any[] = []
  const completedItemCalls: any[][] = []
  const refreshedOrderCalls: string[] = []
  const repositoryCalls: string[] = []
  const transactionUpsertCalls: any[] = []
  const events: string[] = []
  let insideTransaction = false
  const transactionClient = {
    order: {
      findUnique: async () => {
        assert.equal(insideTransaction, true)
        events.push('order:find')
        return options.orderExists === false
          ? null
          : { winningAmount: new Prisma.Decimal(options.orderTotal ?? '1000') }
      }
    },
    customerPayment: {
      findFirst: async () => {
        assert.equal(insideTransaction, true)
        events.push('payment:find')
        return options.existingOrderPaymentId
          ? { id: options.existingOrderPaymentId }
          : null
      },
      findMany: async () => {
        assert.equal(insideTransaction, true)
        events.push('payments:find')
        return (options.customerPayments ?? []).map((payment) => ({
          ...payment,
          paidAmount: new Prisma.Decimal(payment.paidAmount),
          updatedAt: payment.updatedAt ?? new Date('2026-08-01T00:00:00.000Z')
        }))
      },
      upsert: async (args: any) => {
        assert.equal(insideTransaction, true)
        events.push('payment:upsert')
        transactionUpsertCalls.push(args)
        return { id: args.where.orderItemId, ...args.create, ...args.update }
      }
    },
    orderItem: {
      findFirst: async () => {
        assert.equal(insideTransaction, true)
        events.push('item:find')
        return options.itemExists === false ? null : { id: 'item-1' }
      },
      findMany: async (args: any) => {
        assert.equal(insideTransaction, true)
        if (args.where?.currentStatus === OrderStatus.COMPLETED) {
          events.push('completed-items:find')
          return (options.completedItemIds ?? []).map((id) => ({ id }))
        }

        events.push('items:find')
        return (options.eligibleItemIds ?? []).map((id) => ({ id }))
      }
    }
  }

  const repository = createRepository({
    findFirst: async (...args: any[]) => {
      repositoryCalls.push('findFirst')
      return options.repositoryOverrides?.findFirst?.(...args) ?? null
    },
    upsert: async (...args: any[]) => {
      repositoryCalls.push('upsert')
      return options.repositoryOverrides?.upsert?.(...args) ?? args[0].create
    },
    update: async (...args: any[]) => {
      repositoryCalls.push('update')
      return options.repositoryOverrides?.update?.(...args) ?? args[0].data
    },
    create: async (...args: any[]) => {
      repositoryCalls.push('create')
      return options.repositoryOverrides?.create?.(...args) ?? args[0].data
    }
  })

  const dependencies = {
    transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      events.push('transaction:start')
      insideTransaction = true
      try {
        return await operation(transactionClient)
      } finally {
        insideTransaction = false
        events.push('transaction:end')
      }
    },
    saveOrderPayment: async (client: unknown, input: any) => {
      assert.equal(insideTransaction, true)
      assert.equal(client, transactionClient)
      events.push('save')
      savedPaymentCalls.push(input)
      return {
        id: input.existingPaymentId ?? 'payment-new',
        orderId: input.orderId,
        orderItemId: null,
        status: input.status,
        paidAmount: input.paidAmount,
        paidAt: input.paidAt,
        remark: input.remark,
        createdById: input.operatorId
      }
    },
    completeEligibleItems: async (client: unknown, input: any) => {
      assert.equal(insideTransaction, true)
      assert.equal(client, transactionClient)
      events.push('complete')
      completedItemCalls.push(input.itemIds)
    },
    refreshOrderSummary: async (orderId: string) => {
      assert.equal(insideTransaction, false)
      events.push('refresh')
      refreshedOrderCalls.push(orderId)
    },
    customerPayment: repository,
    ensureOrderItem: async () => options.itemExists === false ? null : { id: 'item-1' },
    savedPaymentCalls,
    completedItemCalls,
    refreshedOrderCalls,
    repositoryCalls,
    transactionUpsertCalls,
    events
  }

  return dependencies
}

test('rejects a negative customer payment amount', async () => {
  const dependencies = createDependencies()
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, -0.01, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 400)
  assert.equal(dependencies.savedPaymentCalls.length, 0)
})

test('returns not found when an order-level payment targets a missing order', async () => {
  const dependencies = createDependencies({ orderExists: false })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'missing-order' }, 0, CustomerPaymentStatus.UNPAID), res as any)

  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { message: 'Order not found' })
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'transaction:end'
  ])
})

test('rejects an order payment greater than the order total', async () => {
  const dependencies = createDependencies({ orderTotal: '1000' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 1000.01, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Payment amount cannot exceed the order total' })
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'payment:find',
    'transaction:end'
  ])
})

test('rejects a positive payment when the order total is zero', async () => {
  const dependencies = createDependencies({ orderTotal: '0' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 0.01, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Payment amount cannot exceed the order total' })
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'payment:find',
    'transaction:end'
  ])
})

test('creates a new authoritative order-level cumulative payment', async () => {
  const dependencies = createDependencies({ orderTotal: '1000' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 300, CustomerPaymentStatus.UNPAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(dependencies.savedPaymentCalls.length, 1)
  assert.equal(dependencies.savedPaymentCalls[0].existingPaymentId, null)
  assert.equal(dependencies.savedPaymentCalls[0].paidAmount.toString(), '300')
  assert.equal(dependencies.savedPaymentCalls[0].status, CustomerPaymentStatus.PAID)
  assert.deepEqual(res.body.summary, {
    orderTotal: '1000',
    paidAmount: '300',
    remainingAmount: '700',
    state: 'PARTIAL'
  })
})

test('updates the existing authoritative order-level cumulative payment', async () => {
  const dependencies = createDependencies({
    orderTotal: '1000',
    existingOrderPaymentId: 'payment-existing'
  })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 450, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(dependencies.savedPaymentCalls.length, 1)
  assert.equal(dependencies.savedPaymentCalls[0].existingPaymentId, 'payment-existing')
  assert.equal(dependencies.savedPaymentCalls[0].paidAmount.toString(), '450')
})

test('keeps legacy item payment records untouched on an order-level save', async () => {
  const dependencies = createDependencies({ orderTotal: '1000' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 250, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(dependencies.repositoryCalls, [])
  assert.equal(res.body.customerPayment.orderItemId, null)
})

test('partial payment does not complete customer-payment items', async () => {
  const dependencies = createDependencies({ orderTotal: '1000', eligibleItemIds: ['item-1'] })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 300, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(dependencies.completedItemCalls, [])
  assert.deepEqual(dependencies.refreshedOrderCalls, ['order-1'])
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'payment:find',
    'completed-items:find',
    'save',
    'transaction:end',
    'refresh'
  ])
})

test('full payment completes every CUSTOMER_PAID item once', async () => {
  const dependencies = createDependencies({
    orderTotal: '1000',
    eligibleItemIds: ['item-1', 'item-2']
  })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 1000, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(dependencies.completedItemCalls, [[
    'item-1',
    'item-2'
  ]])
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'payment:find',
    'items:find',
    'save',
    'complete',
    'transaction:end',
    'refresh'
  ])
  assert.deepEqual(res.body.summary, {
    orderTotal: '1000',
    paidAmount: '1000',
    remainingAmount: '0',
    state: 'PAID'
  })
})

test('completed order rejects lowering cumulative payment below the order total', async () => {
  const dependencies = createDependencies({
    orderTotal: '1000',
    existingOrderPaymentId: 'payment-existing',
    completedItemIds: ['item-completed']
  })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 999.99, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Total payments for a completed order must equal the order total' })
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.events, [
    'transaction:start',
    'order:find',
    'payment:find',
    'completed-items:find',
    'transaction:end'
  ])
})

test('completed order allows saving the same full amount with revised payment details', async () => {
  const dependencies = createDependencies({
    orderTotal: '1000',
    existingOrderPaymentId: 'payment-existing',
    completedItemIds: ['item-completed']
  })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()
  const request = createRequest({ id: 'order-1' }, 1000, CustomerPaymentStatus.PAID)
  request.body.paidAt = '2026-08-17T08:30:00.000Z'
  request.body.remark = '更正付款Remarks'

  await handler(request, res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(dependencies.savedPaymentCalls.length, 1)
  assert.equal(dependencies.savedPaymentCalls[0].paidAmount.toString(), '1000')
  assert.equal(dependencies.savedPaymentCalls[0].paidAt.toISOString(), '2026-08-17T08:30:00.000Z')
  assert.equal(dependencies.savedPaymentCalls[0].remark, '更正付款Remarks')
})

test('order-level zero payment stays authoritative and unpaid', async () => {
  const dependencies = createDependencies({ orderTotal: '1000' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(createRequest({ id: 'order-1' }, 0, CustomerPaymentStatus.PAID), res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(dependencies.savedPaymentCalls[0].paidAmount.toString(), '0')
  assert.equal(dependencies.savedPaymentCalls[0].status, CustomerPaymentStatus.UNPAID)
  assert.equal(res.body.summary.state, 'UNPAID')
})

test('legacy item-level customer payment write endpoint is disabled without any write', async () => {
  const dependencies = createDependencies()
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(
    createRequest({ id: 'order-1', itemId: 'item-1' }, 100, CustomerPaymentStatus.UNPAID),
    res as any
  )

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Customer payments are recorded per order; per-item payments are no longer supported' })
  assert.equal(dependencies.transactionUpsertCalls.length, 0)
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.repositoryCalls, [])
  assert.deepEqual(dependencies.events, [])
})

test('legacy item-level customer payment endpoint also rejects an over-total amount without upsert', async () => {
  const dependencies = createDependencies({ orderTotal: '1000' })
  const handler = createUpdateCustomerPaymentHandler(dependencies as any)
  const res = createResponse()

  await handler(
    createRequest({ id: 'order-1', itemId: 'item-1' }, 1000.01, CustomerPaymentStatus.PAID),
    res as any
  )

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Customer payments are recorded per order; per-item payments are no longer supported' })
  assert.equal(dependencies.transactionUpsertCalls.length, 0)
  assert.equal(dependencies.savedPaymentCalls.length, 0)
  assert.deepEqual(dependencies.events, [])
})

test('order detail selects the order-level record and does not double count legacy items', () => {
  const mapPaymentDetails = (orderController as any).mapOrderCustomerPaymentDetails
  assert.equal(typeof mapPaymentDetails, 'function')
  const orderPayment = {
    id: 'payment-order',
    orderItemId: null,
    paidAmount: new Prisma.Decimal(300),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: { id: 'user-1', username: 'tester', displayName: 'Tester' }
  }
  const itemPayment = {
    id: 'payment-item',
    orderItemId: 'item-1',
    paidAmount: new Prisma.Decimal(700),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', username: 'tester', displayName: 'Tester' }
  }

  const result = mapPaymentDetails({
    winningAmount: new Prisma.Decimal(1000),
    customerPayments: [itemPayment, orderPayment]
  })

  assert.equal(result.customerPayment.id, 'payment-order')
  assert.deepEqual(result.customerPayment.createdBy, {
    id: 'user-1',
    username: 'tester',
    realName: 'Tester'
  })
  assert.deepEqual(result.customerPaymentSummary, {
    orderTotal: '1000',
    paidAmount: '300',
    remainingAmount: '700',
    state: 'PARTIAL',
    source: 'ORDER'
  })
})

test('order detail falls back to the legacy item payment total when no order-level record exists', () => {
  const mapPaymentDetails = (orderController as any).mapOrderCustomerPaymentDetails
  assert.equal(typeof mapPaymentDetails, 'function')
  const itemPayment = {
    id: 'payment-item',
    orderItemId: 'item-1',
    paidAmount: new Prisma.Decimal(250),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', username: 'tester', displayName: 'Tester' }
  }

  const result = mapPaymentDetails({
    winningAmount: new Prisma.Decimal(1000),
    customerPayments: [itemPayment]
  })

  assert.equal(result.customerPayment, null)
  assert.deepEqual(result.customerPaymentSummary, {
    orderTotal: '1000',
    paidAmount: '250',
    remainingAmount: '750',
    state: 'PARTIAL',
    source: 'LEGACY_ITEMS'
  })
})

function createOrderPaymentInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'order-1',
    existingPaymentId: null,
    status: CustomerPaymentStatus.PAID,
    paidAmount: new Prisma.Decimal(300),
    paidAt: new Date('2026-08-17T00:00:00.000Z'),
    remark: '累计付款',
    operatorId: 'user-1',
    ...overrides
  }
}

test('real order payment save creates through the supplied transaction client', async () => {
  const savePayment = (orderController as any).saveOrderCustomerPayment
  assert.equal(typeof savePayment, 'function')
  const createCalls: any[] = []
  const updateCalls: any[] = []
  const client = {
    customerPayment: {
      create: async (args: any) => {
        createCalls.push(args)
        return { id: 'payment-new', ...args.data }
      },
      update: async (args: any) => {
        updateCalls.push(args)
        return { id: args.where.id, ...args.data }
      }
    }
  }

  const result = await savePayment(client, createOrderPaymentInput())

  assert.equal(result.id, 'payment-new')
  assert.equal(updateCalls.length, 0)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0].data.orderId, 'order-1')
  assert.equal(createCalls[0].data.orderItemId, null)
  assert.equal(createCalls[0].data.createdById, 'user-1')
  assert.equal(createCalls[0].data.paidAmount.toString(), '300')
})

test('real order payment save updates the authoritative record through the supplied transaction client', async () => {
  const savePayment = (orderController as any).saveOrderCustomerPayment
  assert.equal(typeof savePayment, 'function')
  const createCalls: any[] = []
  const updateCalls: any[] = []
  const client = {
    customerPayment: {
      create: async (args: any) => {
        createCalls.push(args)
        return { id: 'payment-new', ...args.data }
      },
      update: async (args: any) => {
        updateCalls.push(args)
        return { id: args.where.id, ...args.data }
      }
    }
  }

  const result = await savePayment(client, createOrderPaymentInput({
    existingPaymentId: 'payment-existing',
    paidAmount: new Prisma.Decimal(450)
  }))

  assert.equal(result.id, 'payment-existing')
  assert.equal(createCalls.length, 0)
  assert.equal(updateCalls.length, 1)
  assert.deepEqual(updateCalls[0].where, { id: 'payment-existing' })
  assert.equal(updateCalls[0].data.paidAmount.toString(), '450')
  assert.equal('createdById' in updateCalls[0].data, false)
})

test('real completion guards every update and records only successfully transitioned items', async () => {
  const completeItems = (orderController as any).completeOrderCustomerPaymentItems
  assert.equal(typeof completeItems, 'function')
  const updateCalls: any[] = []
  const statusRecordCalls: any[] = []
  const updateCounts = [1, 0]
  const client = {
    orderItem: {
      updateMany: async (args: any) => {
        updateCalls.push(args)
        return { count: updateCounts.shift() }
      }
    },
    orderItemStatusRecord: {
      create: async (args: any) => {
        statusRecordCalls.push(args)
        return { id: 'status-1', ...args.data }
      }
    }
  }

  await completeItems(client, {
    orderId: 'order-1',
    operatorId: 'user-1',
    itemIds: ['item-1', 'item-2']
  })

  assert.equal(updateCalls.length, 2)
  assert.deepEqual(updateCalls[0], {
    where: {
      id: 'item-1',
      orderId: 'order-1',
      currentStatus: OrderStatus.CUSTOMER_PAID
    },
    data: { currentStatus: OrderStatus.COMPLETED }
  })
  assert.equal(statusRecordCalls.length, 1)
  assert.deepEqual(statusRecordCalls[0].data, {
    orderId: 'order-1',
    orderItemId: 'item-1',
    fromStatus: OrderStatus.CUSTOMER_PAID,
    toStatus: OrderStatus.COMPLETED,
    note: 'Customer has paid in full. Order completed',
    operatorId: 'user-1'
  })
})

test('real completion propagates a status-record failure to the transaction', async () => {
  const completeItems = (orderController as any).completeOrderCustomerPaymentItems
  assert.equal(typeof completeItems, 'function')
  const failure = new Error('status record write failed')
  const client = {
    orderItem: {
      updateMany: async () => ({ count: 1 })
    },
    orderItemStatusRecord: {
      create: async () => {
        throw failure
      }
    }
  }

  await assert.rejects(
    completeItems(client, {
      orderId: 'order-1',
      operatorId: 'user-1',
      itemIds: ['item-1']
    }),
    failure
  )
})

test('Serializable transaction retries P2034 at most three times and reruns all reads', async () => {
  const runTransaction = (orderController as any).runSerializableTransactionWithRetry
  assert.equal(typeof runTransaction, 'function')
  const isolationLevels: unknown[] = []
  const readAttempts: number[] = []
  let attempts = 0
  const client = {
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>, options: any) => {
      attempts += 1
      isolationLevels.push(options?.isolationLevel)
      const result = await operation({ attempt: attempts })
      if (attempts < 3) {
        throw { code: 'P2034' }
      }
      return result
    }
  }

  const result = await runTransaction(client, async (transaction: any) => {
    readAttempts.push(transaction.attempt)
    return `saved-${transaction.attempt}`
  })

  assert.equal(result, 'saved-3')
  assert.equal(attempts, 3)
  assert.deepEqual(readAttempts, [1, 2, 3])
  assert.deepEqual(isolationLevels, [
    Prisma.TransactionIsolationLevel.Serializable,
    Prisma.TransactionIsolationLevel.Serializable,
    Prisma.TransactionIsolationLevel.Serializable
  ])

  attempts = 0
  await assert.rejects(
    runTransaction({
      $transaction: async (operation: (transaction: unknown) => Promise<unknown>, options: any) => {
        attempts += 1
        assert.equal(options?.isolationLevel, Prisma.TransactionIsolationLevel.Serializable)
        await operation({ attempt: attempts })
        throw { code: 'P2034' }
      }
    }, async () => 'never committed'),
    (error: any) => error?.code === 'P2034'
  )
  assert.equal(attempts, 3)
})

test('Serializable transaction does not retry non-P2034 failures', async () => {
  const runTransaction = (orderController as any).runSerializableTransactionWithRetry
  assert.equal(typeof runTransaction, 'function')
  const failure = new Error('write failed')
  let attempts = 0

  await assert.rejects(
    runTransaction({
      $transaction: async () => {
        attempts += 1
        throw failure
      }
    }, async () => undefined),
    failure
  )

  assert.equal(attempts, 1)
})

test('order detail deterministically selects the newest order-level payment', () => {
  const mapPaymentDetails = (orderController as any).mapOrderCustomerPaymentDetails
  const olderPayment = {
    id: 'payment-older',
    orderItemId: null,
    paidAmount: new Prisma.Decimal(100),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', username: 'tester', displayName: 'Tester' }
  }
  const newerPayment = {
    id: 'payment-newer',
    orderItemId: null,
    paidAmount: new Prisma.Decimal(400),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', username: 'tester', displayName: 'Tester' }
  }

  const firstResult = mapPaymentDetails({
    winningAmount: new Prisma.Decimal(1000),
    customerPayments: [olderPayment, newerPayment]
  })
  const reversedResult = mapPaymentDetails({
    winningAmount: new Prisma.Decimal(1000),
    customerPayments: [newerPayment, olderPayment]
  })

  assert.equal(firstResult.customerPayment.id, 'payment-newer')
  assert.equal(firstResult.customerPaymentSummary.paidAmount, '400')
  assert.equal(reversedResult.customerPayment.id, 'payment-newer')
})
