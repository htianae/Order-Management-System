import assert from 'node:assert/strict'
import test from 'node:test'

import { OrderStatus, Prisma, UserRole } from '@prisma/client'

import {
  createUpdateOrderItemStatusHandler,
  createUpdateWinningInfoHandler
} from './order.controller.js'
import * as orderController from './order.controller.js'

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

function createStatusHandler(existingTaxIncludedTotal: string) {
  let itemUpdateData: any
  let orderUpdateData: any
  let profitUpdateData: any
  const recalculatedOrders: string[] = []
  const handler = createUpdateOrderItemStatusHandler({
    orderItem: {
      findFirst: async () => ({
        id: 'item-1',
        orderId: 'order-1',
        currentStatus: OrderStatus.QUOTED,
        taxIncludedTotal: new Prisma.Decimal(existingTaxIncludedTotal)
      })
    },
    transaction: async (operation: any) => operation({
      orderItem: {
        findFirst: async () => ({
          id: 'item-1',
          orderId: 'order-1',
          currentStatus: OrderStatus.QUOTED,
          taxIncludedTotal: new Prisma.Decimal(existingTaxIncludedTotal)
        }),
        update: async (args: any) => {
          itemUpdateData = args.data
          return { id: 'item-1', ...args.data }
        },
        findMany: async () => [{
          currentStatus: OrderStatus.BID_WON,
          winningAmount: itemUpdateData.winningAmount
        }]
      },
      orderItemStatusRecord: {
        create: async () => ({
          id: 'status-1',
          operator: { id: 'user-1', username: 'tester', displayName: 'Tester' }
        })
      },
      order: {
        findUnique: async (args: any) => args.select?.purchaseCost
          ? {
              winningAmount: orderUpdateData.winningAmount,
              purchaseCost: new Prisma.Decimal('0'),
              logisticsCost: new Prisma.Decimal('0'),
              otherCost: new Prisma.Decimal('0'),
              taxFee: new Prisma.Decimal('0')
            }
          : { winningAmount: new Prisma.Decimal(existingTaxIncludedTotal) },
        update: async (args: any) => {
          if (Object.prototype.hasOwnProperty.call(args.data, 'profit')) {
            profitUpdateData = args.data
          } else {
            orderUpdateData = args.data
          }
          return { id: 'order-1', ...args.data, updatedAt: new Date() }
        }
      },
      customerPayment: {
        findMany: async () => []
      }
    }),
    refreshOrderSummaryFromItems: (orderController as any).refreshOrderSummaryFromItems,
    recalculateOrderProfit: async (orderId: string) => {
      recalculatedOrders.push(orderId)
    },
    isStatusTransitionAllowed: () => true
  } as any)

  return {
    handler,
    getItemUpdateData: () => itemUpdateData,
    getOrderUpdateData: () => orderUpdateData,
    getProfitUpdateData: () => profitUpdateData,
    recalculatedOrders
  }
}

function createWinningHandler(existingTaxIncludedTotal: string) {
  let itemUpdateData: any
  const refreshedOrders: string[] = []
  const updateItem = async (args: any) => {
    itemUpdateData = args.data
    return { id: 'item-1', ...args.data }
  }
  const handler = createUpdateWinningInfoHandler({
    orderItem: {
      findFirst: async () => ({
        id: 'item-1',
        taxIncludedTotal: new Prisma.Decimal(existingTaxIncludedTotal)
      }),
      update: updateItem
    },
    transaction: async (operation: any) => operation({
      orderItem: {
        findFirst: async () => ({
          id: 'item-1',
          taxIncludedTotal: new Prisma.Decimal(existingTaxIncludedTotal)
        }),
        update: updateItem
      }
    }),
    refreshOrderSummaryFromItems: async (orderId: string) => {
      refreshedOrders.push(orderId)
    },
    recalculateOrderProfit: async () => undefined
  } as any)

  return { handler, getItemUpdateData: () => itemUpdateData, refreshedOrders }
}

function createStatusRequest(winningPrice?: number) {
  return {
    user: { id: 'user-1', role: UserRole.ADMIN },
    params: { id: 'order-1', itemId: 'item-1' },
    body: { status: OrderStatus.BID_WON, winningPrice }
  } as any
}

function createWinningRequest(winningPrice?: number) {
  return {
    params: { id: 'order-1', itemId: 'item-1' },
    body: { result: 'WON', winningPrice }
  } as any
}

test('item status handler co-writes a supplied winning price and refreshes the order summary', async () => {
  const fixture = createStatusHandler('100')
  const res = createResponse()

  await fixture.handler(createStatusRequest(120), res as any)

  assert.equal(fixture.getItemUpdateData().taxIncludedTotal.toString(), '120')
  assert.equal(fixture.getItemUpdateData().winningAmount.toString(), '120')
  assert.equal(fixture.getOrderUpdateData().winningAmount.toString(), '120')
  assert.equal(fixture.getProfitUpdateData().profit.toString(), '120')
  assert.deepEqual(fixture.recalculatedOrders, [])
})

test('item status handler keeps the existing total when winning price is omitted', async () => {
  const fixture = createStatusHandler('123.45')
  const res = createResponse()

  await fixture.handler(createStatusRequest(), res as any)

  assert.equal(fixture.getItemUpdateData().taxIncludedTotal.toString(), '123.45')
  assert.equal(fixture.getItemUpdateData().winningAmount.toString(), '123.45')
  assert.equal(fixture.getOrderUpdateData().winningAmount.toString(), '123.45')
  assert.equal(fixture.getProfitUpdateData().profit.toString(), '123.45')
})

test('item winning handler co-writes a supplied winning price and refreshes the order summary', async () => {
  const fixture = createWinningHandler('100')
  const res = createResponse()

  await fixture.handler(createWinningRequest(120), res as any)

  assert.equal(fixture.getItemUpdateData().taxIncludedTotal.toString(), '120')
  assert.equal(fixture.getItemUpdateData().winningAmount.toString(), '120')
  assert.deepEqual(fixture.refreshedOrders, ['order-1'])
})

test('item winning handler keeps the existing total when winning price is omitted', async () => {
  const fixture = createWinningHandler('123.45')
  const res = createResponse()

  await fixture.handler(createWinningRequest(), res as any)

  assert.equal(fixture.getItemUpdateData().taxIncludedTotal.toString(), '123.45')
  assert.equal(fixture.getItemUpdateData().winningAmount.toString(), '123.45')
  assert.deepEqual(fixture.refreshedOrders, ['order-1'])
})

interface SummaryClientOptions {
  newItemAmounts: Array<string | null>
  itemStatuses?: OrderStatus[]
  currentOrderTotal: string
  orderPaymentAmount?: string
  legacyItemPaymentAmounts?: string[]
  failProfitUpdate?: boolean
}

function createSummaryClient(options: SummaryClientOptions) {
  const events: string[] = []
  const orderUpdateCalls: any[] = []
  const paymentQueryCalls: any[] = []
  let persistedWinningAmount: Prisma.Decimal | null = new Prisma.Decimal(options.currentOrderTotal)
  const payments = options.orderPaymentAmount === undefined
    ? (options.legacyItemPaymentAmounts ?? []).map((paidAmount, index) => ({
        id: `legacy-${index + 1}`,
        orderItemId: `item-${index + 1}`,
        paidAmount: new Prisma.Decimal(paidAmount),
        updatedAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`)
      }))
    : [{
        id: 'payment-order',
        orderItemId: null,
        paidAmount: new Prisma.Decimal(options.orderPaymentAmount),
        updatedAt: new Date('2026-02-01T00:00:00.000Z')
      }]

  return {
    client: {
      orderItem: {
        findMany: async () => {
          events.push('items:find')
          return options.newItemAmounts.map((winningAmount, index) => ({
            currentStatus: options.itemStatuses?.[index] ?? OrderStatus.BID_WON,
            winningAmount: winningAmount === null ? null : new Prisma.Decimal(winningAmount)
          }))
        }
      },
      order: {
        findUnique: async (args: any) => {
          const isProfitRead = Boolean(args.select?.purchaseCost)
          events.push(isProfitRead ? 'profit:find' : 'order:find')
          return isProfitRead
            ? {
                winningAmount: persistedWinningAmount,
                purchaseCost: new Prisma.Decimal('100'),
                logisticsCost: new Prisma.Decimal('50'),
                otherCost: new Prisma.Decimal('25'),
                taxFee: new Prisma.Decimal('25')
              }
            : { winningAmount: persistedWinningAmount }
        },
        update: async (args: any) => {
          const isProfitUpdate = Object.prototype.hasOwnProperty.call(args.data, 'profit')
          events.push(isProfitUpdate ? 'profit:update' : 'order:update')
          orderUpdateCalls.push(args)

          if (isProfitUpdate && options.failProfitUpdate) {
            throw new Error('profit write failed')
          }

          if (Object.prototype.hasOwnProperty.call(args.data, 'winningAmount')) {
            persistedWinningAmount = args.data.winningAmount
          }

          return { id: 'order-1', ...args.data, updatedAt: new Date() }
        }
      },
      customerPayment: {
        findMany: async (args: any) => {
          events.push('payments:find')
          paymentQueryCalls.push(args)
          return payments
        }
      }
    } as any,
    events,
    orderUpdateCalls,
    paymentQueryCalls
  }
}

test('shared refresh rejects lowering the order total below an authoritative paid amount', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })

  await assert.rejects(
    refreshSummary('order-1', fixture.client, { recalculateProfit: false }),
    (error: any) => error?.message === 'Order total cannot be less than the amount received'
  )

  assert.deepEqual(fixture.events, ['items:find', 'order:find', 'payments:find'])
  assert.equal(fixture.orderUpdateCalls.length, 0)
  assert.deepEqual(fixture.paymentQueryCalls[0].orderBy, [
    { updatedAt: 'desc' },
    { id: 'desc' }
  ])
})

test('shared refresh allows an order total equal to the effective paid amount', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['1000'],
    currentOrderTotal: '1200',
    orderPaymentAmount: '1000'
  })

  await refreshSummary('order-1', fixture.client)

  assert.equal(fixture.orderUpdateCalls.length, 2)
  assert.equal(fixture.orderUpdateCalls[0].data.winningAmount.toString(), '1000')
  assert.equal(fixture.orderUpdateCalls[1].data.profit.toString(), '800')
  assert.equal(fixture.orderUpdateCalls[1].data.profitRate.toString(), '0.8')
  assert.deepEqual(fixture.events, [
    'items:find',
    'order:find',
    'payments:find',
    'order:update',
    'profit:find',
    'profit:update'
  ])
})

test('shared refresh locks a completed order total against increases', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['1200'],
    itemStatuses: [OrderStatus.COMPLETED],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })

  await assert.rejects(
    refreshSummary('order-1', fixture.client),
    (error: any) => error?.message === 'The total for a completed order is locked and cannot be changed'
  )

  assert.equal(fixture.orderUpdateCalls.length, 0)
})

test('shared refresh locks a completed order total against decreases before paid-amount checks', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['900'],
    itemStatuses: [OrderStatus.COMPLETED],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })

  await assert.rejects(
    refreshSummary('order-1', fixture.client),
    (error: any) => error?.message === 'The total for a completed order is locked and cannot be changed'
  )

  assert.equal(fixture.orderUpdateCalls.length, 0)
})

test('shared refresh allows unchanged completed order total despite historical partial payment', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['1000'],
    itemStatuses: [OrderStatus.COMPLETED],
    currentOrderTotal: '1000',
    orderPaymentAmount: '500'
  })

  await refreshSummary('order-1', fixture.client)

  assert.equal(fixture.orderUpdateCalls[0].data.winningAmount.toString(), '1000')
})

test('shared refresh allows lowering the order total when no payment exists', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000'
  })

  await refreshSummary('order-1', fixture.client)

  assert.equal(fixture.orderUpdateCalls.length, 2)
  assert.equal(fixture.orderUpdateCalls[0].data.winningAmount.toString(), '500')
})

test('shared refresh compares against capped legacy item payments when no order payment exists', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['900'],
    currentOrderTotal: '1000',
    legacyItemPaymentAmounts: ['700', '700']
  })

  await assert.rejects(
    refreshSummary('order-1', fixture.client, { recalculateProfit: false }),
    (error: any) => error?.message === 'Order total cannot be less than the amount received'
  )

  assert.equal(fixture.orderUpdateCalls.length, 0)
})

test('item basic-info amount update rolls back when the new total is below paid amount', async () => {
  const createHandler = (orderController as any).createUpdateOrderItemBasicInfoHandler
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof createHandler, 'function')
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })
  let itemUpdateAttempted = false
  let committed = false
  fixture.client.orderItem.findFirst = async () => ({
    id: 'item-1',
    bidResult: 'WON',
    taxIncludedTotal: new Prisma.Decimal('1000')
  })
  fixture.client.orderItem.update = async (args: any) => {
    itemUpdateAttempted = true
    return { id: 'item-1', ...args.data }
  }
  const handler = createHandler({
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => undefined
  })
  const res = createResponse()

  await handler({
    user: { id: 'user-1' },
    params: { id: 'order-1', itemId: 'item-1' },
    body: { taxIncludedTotal: 500 }
  } as any, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Order total cannot be less than the amount received' })
  assert.equal(itemUpdateAttempted, true)
  assert.equal(committed, false)
})

test('item basic-info does not refresh the order when the item is missing', async () => {
  const createHandler = (orderController as any).createUpdateOrderItemBasicInfoHandler
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000'
  })
  fixture.client.orderItem.findFirst = async () => null
  const handler = createHandler({
    transaction: async (operation: (client: unknown) => Promise<unknown>) =>
      operation(fixture.client),
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => undefined
  })
  const res = createResponse()

  await handler({
    user: { id: 'user-1' },
    params: { id: 'order-1', itemId: 'missing-item' },
    body: { taxIncludedTotal: 500 }
  } as any, res as any)

  assert.equal(res.statusCode, 404)
  assert.equal(fixture.orderUpdateCalls.length, 0)
})

test('item basic-info keeps amount equal to paid and recalculates profit inside its transaction', async () => {
  const createHandler = (orderController as any).createUpdateOrderItemBasicInfoHandler
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  const fixture = createSummaryClient({
    newItemAmounts: ['1000'],
    currentOrderTotal: '1200',
    orderPaymentAmount: '1000'
  })
  let committed = false
  let outsideProfitCalled = false
  fixture.client.orderItem.findFirst = async () => ({
    id: 'item-1',
    bidResult: 'WON',
    taxIncludedTotal: new Prisma.Decimal('1200')
  })
  fixture.client.orderItem.update = async (args: any) => ({ id: 'item-1', ...args.data })
  const handler = createHandler({
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => {
      outsideProfitCalled = true
    }
  })
  const res = createResponse()

  await handler({
    user: { id: 'user-1' },
    params: { id: 'order-1', itemId: 'item-1' },
    body: { taxIncludedTotal: 1000 }
  } as any, res as any)

  assert.equal(res.statusCode, 200)
  assert.equal(committed, true)
  assert.equal(outsideProfitCalled, false)
  assert.deepEqual(fixture.events.slice(-2), ['profit:find', 'profit:update'])
})

test('profit update failure escapes the amount transaction and prevents commit', async () => {
  const createHandler = (orderController as any).createUpdateOrderItemBasicInfoHandler
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  const fixture = createSummaryClient({
    newItemAmounts: ['1000'],
    currentOrderTotal: '1200',
    orderPaymentAmount: '1000',
    failProfitUpdate: true
  })
  let committed = false
  fixture.client.orderItem.findFirst = async () => ({
    id: 'item-1',
    bidResult: 'WON',
    taxIncludedTotal: new Prisma.Decimal('1200')
  })
  fixture.client.orderItem.update = async (args: any) => ({ id: 'item-1', ...args.data })
  const handler = createHandler({
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => {
      throw new Error('profit recalculation escaped transaction')
    }
  })
  const res = createResponse()

  await assert.rejects(
    handler({
      user: { id: 'user-1' },
      params: { id: 'order-1', itemId: 'item-1' },
      body: { taxIncludedTotal: 1000 }
    } as any, res as any),
    /profit write failed/
  )

  assert.equal(committed, false)
  assert.deepEqual(fixture.events.slice(-2), ['profit:find', 'profit:update'])
})

test('item status amount update and paid-amount guard share one transaction client', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })
  let committed = false
  let recalculated = false
  fixture.client.orderItem.update = async (args: any) => ({ id: 'item-1', ...args.data })
  fixture.client.orderItem.findFirst = async () => ({
    id: 'item-1',
    orderId: 'order-1',
    currentStatus: OrderStatus.BID_WON,
    taxIncludedTotal: new Prisma.Decimal('1000')
  })
  fixture.client.orderItemStatusRecord = {
    create: async () => ({
      id: 'status-1',
      operator: { id: 'user-1', username: 'tester', displayName: 'Tester' }
    })
  }
  const handler = createUpdateOrderItemStatusHandler({
    orderItem: {
      findFirst: async () => {
        throw new Error('status item read escaped the transaction')
      }
    },
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => {
      recalculated = true
    },
    isStatusTransitionAllowed: () => true
  } as any)
  const res = createResponse()

  await handler({
    user: { id: 'user-1', role: UserRole.ADMIN },
    params: { id: 'order-1', itemId: 'item-1' },
    body: {
      status: OrderStatus.BID_LOST,
      lostReason: '未中标'
    }
  } as any, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Order total cannot be less than the amount received' })
  assert.equal(committed, false)
  assert.equal(recalculated, false)
})

test('item winning amount update rolls back when the new total is below paid amount', async () => {
  const refreshSummary = (orderController as any).refreshOrderSummaryFromItems
  assert.equal(typeof refreshSummary, 'function')
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })
  let outsideUpdateCalled = false
  let committed = false
  fixture.client.orderItem.findFirst = async () => ({
    id: 'item-1',
    taxIncludedTotal: new Prisma.Decimal('1000')
  })
  fixture.client.orderItem.update = async (args: any) => ({ id: 'item-1', ...args.data })
  const handler = createUpdateWinningInfoHandler({
    orderItem: {
      findFirst: async () => ({
        id: 'item-1',
        taxIncludedTotal: new Prisma.Decimal('1000')
      }),
      update: async (args: any) => {
        outsideUpdateCalled = true
        return { id: 'item-1', ...args.data }
      }
    },
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: refreshSummary,
    recalculateOrderProfit: async () => undefined
  } as any)
  const res = createResponse()

  await handler(createWinningRequest(500), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Order total cannot be less than the amount received' })
  assert.equal(outsideUpdateCalled, false)
  assert.equal(committed, false)
})

test('legacy order winning endpoint rejects manual order total changes', async () => {
  const fixture = createSummaryClient({
    newItemAmounts: ['500'],
    currentOrderTotal: '1000',
    orderPaymentAmount: '1000'
  })
  let outsideUpdateCalled = false
  let committed = false
  fixture.client.order.update = async (args: any) => {
    fixture.orderUpdateCalls.push(args)
    return { id: 'order-1', ...args.data }
  }
  const handler = createUpdateWinningInfoHandler({
    orderItem: {
      findFirst: async () => null,
      update: async () => ({ id: 'unused' })
    },
    order: {
      update: async () => {
        outsideUpdateCalled = true
        return { id: 'order-1' }
      }
    },
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: async () => undefined,
    recalculateOrderProfit: async () => undefined
  } as any)
  const res = createResponse()

  await handler({
    params: { id: 'order-1' },
    body: { result: 'WON', winningPrice: 500 }
  } as any, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Update awarded item amounts to maintain the order total; the system calculates it automatically' })
  assert.equal(outsideUpdateCalled, false)
  assert.equal(fixture.orderUpdateCalls.length, 0)
  assert.equal(committed, false)
})

test('legacy order winning endpoint does not silently recalculate or persist a manual total', async () => {
  const fixture = createSummaryClient({
    newItemAmounts: ['1000'],
    currentOrderTotal: '1200',
    orderPaymentAmount: '1000'
  })
  let outsideUpdateCalled = false
  let outsideProfitCalled = false
  let committed = false
  const handler = createUpdateWinningInfoHandler({
    orderItem: {
      findFirst: async () => null,
      update: async () => ({ id: 'unused' })
    },
    order: {
      update: async () => {
        outsideUpdateCalled = true
        return { id: 'order-1' }
      }
    },
    transaction: async (operation: (client: unknown) => Promise<unknown>) => {
      const result = await operation(fixture.client)
      committed = true
      return result
    },
    refreshOrderSummaryFromItems: async () => undefined,
    recalculateOrderProfit: async () => {
      outsideProfitCalled = true
    }
  } as any)
  const res = createResponse()

  await handler({
    params: { id: 'order-1' },
    body: { result: 'WON', winningPrice: 1000 }
  } as any, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Update awarded item amounts to maintain the order total; the system calculates it automatically' })
  assert.equal(committed, false)
  assert.equal(outsideUpdateCalled, false)
  assert.equal(outsideProfitCalled, false)
  assert.deepEqual(fixture.events, [])
})
