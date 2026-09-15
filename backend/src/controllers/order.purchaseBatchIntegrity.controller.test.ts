import assert from 'node:assert/strict'
import test from 'node:test'

import { OrderStatus, PaymentApplicationStatus, Prisma, UserRole } from '@prisma/client'

import { updatePurchaseBatch, updatePurchaseBatchBasicInfo } from './order.controller.js'
import { prisma } from '../utils/prisma.js'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
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

function employeeRequest() {
  return {
    user: {
      id: 'employee-1',
      username: 'employee-user',
      role: UserRole.EMPLOYEE
    },
    params: {
      id: 'order-1',
      batchId: 'batch-1'
    },
    body: {
      itemIds: ['item-1'],
      purchaseCost: 100,
      supplierName: '测试厂家',
      submitForApproval: false
    }
  } as any
}

test('cannot remove a material from a purchase batch with a pending payment application', async (t) => {
  const originals = {
    transaction: prisma.$transaction,
    selectedItems: prisma.orderItem.findMany,
    purchaseInfos: prisma.purchaseInfo.findMany,
    orderFindUnique: prisma.order.findUnique,
    orderUpdate: prisma.order.update
  }

  prisma.orderItem.findMany = (async () => [{
    id: 'item-1',
    currentStatus: OrderStatus.PURCHASE_PAYMENT,
    purchaseBatchId: 'batch-1'
  }]) as unknown as typeof prisma.orderItem.findMany
  prisma.purchaseInfo.findMany = (async () => []) as unknown as typeof prisma.purchaseInfo.findMany
  prisma.order.findUnique = (async () => ({
    winningAmount: new Prisma.Decimal(0),
    purchaseCost: new Prisma.Decimal(0),
    logisticsCost: new Prisma.Decimal(0),
    otherCost: new Prisma.Decimal(0),
    taxFee: new Prisma.Decimal(0)
  })) as unknown as typeof prisma.order.findUnique
  prisma.order.update = (async () => ({})) as unknown as typeof prisma.order.update

  const tx = {
    purchaseInfo: {
      findUnique: async () => ({ purchaseCost: new Prisma.Decimal(100) }),
      update: async () => ({ id: 'batch-1' })
    },
    orderItem: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [{ currentStatus: OrderStatus.PURCHASE_PAYMENT, winningAmount: null }]
    },
    order: {
      update: async () => ({})
    }
  }
  prisma.$transaction = (async (operation: (client: unknown) => Promise<unknown>) => operation(tx)) as unknown as typeof prisma.$transaction

  t.after(() => {
    prisma.$transaction = originals.transaction
    prisma.orderItem.findMany = originals.selectedItems
    prisma.purchaseInfo.findMany = originals.purchaseInfos
    prisma.order.findUnique = originals.orderFindUnique
    prisma.order.update = originals.orderUpdate
  })

  const pendingFindMany = prisma.purchasePaymentApplication.findMany
  const batchFindFirst = prisma.purchaseInfo.findFirst
  prisma.purchasePaymentApplication.findMany = (async () => [{
    paymentPercent: new Prisma.Decimal(100),
    status: PaymentApplicationStatus.PENDING
  }]) as unknown as typeof prisma.purchasePaymentApplication.findMany
  prisma.purchaseInfo.findFirst = (async () => ({
    id: 'batch-1',
    purchaseCost: new Prisma.Decimal(100),
    batchItems: [{ id: 'item-1' }, { id: 'item-2' }]
  })) as unknown as typeof prisma.purchaseInfo.findFirst

  t.after(() => {
    prisma.purchasePaymentApplication.findMany = pendingFindMany
    prisma.purchaseInfo.findFirst = batchFindFirst
  })

  const res = createResponse()
  await updatePurchaseBatch(employeeRequest(), res as any)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    message: 'This batch has a pending payment request. A manager must reject it before items or total cost can be changed'
  })
})

test('cannot change purchase batch cost after a payment application was approved', async (t) => {
  const findFirst = prisma.purchaseInfo.findFirst
  const update = prisma.purchaseInfo.update
  const findMany = prisma.purchaseInfo.findMany
  const orderFindUnique = prisma.order.findUnique
  const orderUpdate = prisma.order.update

  prisma.purchaseInfo.findFirst = (async () => ({
    id: 'batch-1',
    purchaseCost: new Prisma.Decimal(100),
    batchItems: [{ id: 'item-1' }],
    paymentApplications: [{ status: PaymentApplicationStatus.APPROVED }]
  })) as unknown as typeof prisma.purchaseInfo.findFirst
  prisma.purchaseInfo.update = (async () => ({ id: 'batch-1' })) as unknown as typeof prisma.purchaseInfo.update
  prisma.purchaseInfo.findMany = (async () => []) as unknown as typeof prisma.purchaseInfo.findMany
  prisma.order.findUnique = (async () => ({
    winningAmount: new Prisma.Decimal(0),
    purchaseCost: new Prisma.Decimal(0),
    logisticsCost: new Prisma.Decimal(0),
    otherCost: new Prisma.Decimal(0),
    taxFee: new Prisma.Decimal(0)
  })) as unknown as typeof prisma.order.findUnique
  prisma.order.update = (async () => ({})) as unknown as typeof prisma.order.update

  t.after(() => {
    prisma.purchaseInfo.findFirst = findFirst
    prisma.purchaseInfo.update = update
    prisma.purchaseInfo.findMany = findMany
    prisma.order.findUnique = orderFindUnique
    prisma.order.update = orderUpdate
  })

  const res = createResponse()
  await updatePurchaseBatchBasicInfo({
    user: {
      id: 'employee-1',
      username: 'employee-user',
      role: UserRole.EMPLOYEE
    },
    params: {
      id: 'order-1',
      batchId: 'batch-1'
    },
    body: {
      purchaseCost: 120,
      supplierName: '测试厂家'
    }
  } as any, res as any)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    message: 'This batch has approved payments. Total cost cannot be changed'
  })
})
