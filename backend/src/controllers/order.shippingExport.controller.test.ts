import assert from 'node:assert/strict'
import test from 'node:test'

import { OrderStatus, UserRole } from '@prisma/client'
import ExcelJS from 'exceljs'

import {
  approveShippingApplication,
  createShippingApplication,
  exportShippingApplication,
  rejectShippingApplication
} from './order.controller.js'
import { prisma } from '../utils/prisma.js'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value)
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    }
  }
}

function employeeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'employee-1',
      username: 'employee-user',
      realName: '当前导出员工',
      role: UserRole.EMPLOYEE
    },
    params: { id: 'order-1' },
    query: {},
    body: {},
    ...overrides
  } as any
}

function installPrismaMock(t: test.TestContext, overrides: Record<string, unknown>) {
  const originalTransaction = prisma.$transaction
  const originalOrderFindUnique = prisma.order.findUnique
  const originalPurchaseInfoFindMany = prisma.purchaseInfo.findMany

  if (overrides.$transaction) {
    prisma.$transaction = overrides.$transaction as typeof prisma.$transaction
  }
  if (overrides.order) {
    Object.assign(prisma.order, overrides.order)
  }
  if (overrides.purchaseInfo) {
    Object.assign(prisma.purchaseInfo, overrides.purchaseInfo)
  }

  t.after(() => {
    prisma.$transaction = originalTransaction
    prisma.order.findUnique = originalOrderFindUnique
    prisma.purchaseInfo.findMany = originalPurchaseInfoFindMany
  })
}

test('employee can submit a shipping application for another employee order but the application records the submitter', async (t) => {
  let createData: any
  const tx = {
    order: {
      findUnique: async () => ({ id: 'order-1', creatorId: 'employee-2', ownerId: 'employee-2' }),
      update: async () => ({ id: 'order-1' })
    },
    file: {
      findFirst: async () => ({ id: 'file-1', uploaderId: 'employee-1', originalName: 'shipping.xlsx' })
    },
    purchaseInfo: {
      findMany: async () => [{
        id: 'batch-1',
        batchItems: [{ id: 'item-1', currentStatus: OrderStatus.SHIPPED_TO_CUSTOMER }]
      }]
    },
    shippingApplication: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createData = data
        return { id: 'application-1', ...data }
      }
    },
    orderItem: {
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [{ currentStatus: OrderStatus.ARRIVED_COMPANY, winningAmount: null }]
    },
    orderItemStatusRecord: { createMany: async () => ({ count: 1 }) }
  }

  installPrismaMock(t, {
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx)
  })

  const res = createResponse()
  await createShippingApplication(employeeRequest({
    body: {
      batchIds: ['batch-1'],
      fileId: 'file-1',
      logisticsCompany: '测试物流',
      trackingNo: 'TEST-001'
    }
  }), res as any)

  assert.equal(res.statusCode, 201)
  assert.equal(createData.createdById, 'employee-1')
  assert.deepEqual(createData.batches.create, [{ purchaseInfoId: 'batch-1' }])
})

test('shipping application submission requires login', async () => {
  const res = createResponse()

  await createShippingApplication({ params: { id: 'order-1' }, body: {} } as any, res as any)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { message: 'Please sign in' })
})

test('employee submitting another employee order still cannot use somebody else uploaded Excel', async (t) => {
  const tx = {
    order: { findUnique: async () => ({ id: 'order-1' }) },
    file: {
      findFirst: async () => ({ id: 'file-1', uploaderId: 'employee-2', originalName: 'shipping.xlsx' })
    },
    purchaseInfo: { findMany: async () => [] },
    shippingApplication: { findFirst: async () => null }
  }
  installPrismaMock(t, {
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx)
  })

  const res = createResponse()
  await createShippingApplication(employeeRequest({
    body: {
      batchIds: ['batch-1'],
      fileId: 'file-1',
      logisticsCompany: '测试物流',
      trackingNo: 'TEST-002'
    }
  }), res as any)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { message: 'You can only use shipping approval Excel files that you uploaded' })
})

test('employee cannot approve another employee shipping application', async () => {
  const approveRes = createResponse()
  const rejectRes = createResponse()

  await approveShippingApplication(employeeRequest({ params: { id: 'order-1', applicationId: 'application-1' } }), approveRes as any)
  await rejectShippingApplication(employeeRequest({ params: { id: 'order-1', applicationId: 'application-1' } }), rejectRes as any)

  for (const res of [approveRes, rejectRes]) {
    assert.equal(res.statusCode, 403)
    assert.deepEqual(res.body, { message: 'Only managers can approve shipping requests' })
  }
})

test('shipping application submission rejects a purchase batch with a pending application', async (t) => {
  const tx = {
    order: { findUnique: async () => ({ id: 'order-1' }) },
    file: {
      findFirst: async () => ({ id: 'file-1', uploaderId: 'employee-1', originalName: 'shipping.xlsx' })
    },
    purchaseInfo: {
      findMany: async () => [{
        id: 'batch-1',
        batchItems: [{ id: 'item-1', currentStatus: OrderStatus.SHIPPED_TO_CUSTOMER }]
      }]
    },
    shippingApplication: { findFirst: async () => ({ id: 'pending-1' }) }
  }
  installPrismaMock(t, {
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx)
  })

  const res = createResponse()
  await createShippingApplication(employeeRequest({
    body: {
      batchIds: ['batch-1'],
      fileId: 'file-1',
      logisticsCompany: '测试物流',
      trackingNo: 'TEST-003'
    }
  }), res as any)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, { message: 'Selected purchase batches already have a pending shipping request' })
})

test('shipping application submission rejects a purchase batch outside the shipping stage', async (t) => {
  const tx = {
    order: { findUnique: async () => ({ id: 'order-1' }) },
    file: {
      findFirst: async () => ({ id: 'file-1', uploaderId: 'employee-1', originalName: 'shipping.xlsx' })
    },
    purchaseInfo: {
      findMany: async () => [{
        id: 'batch-1',
        batchItems: [{ id: 'item-1', currentStatus: OrderStatus.PURCHASE_PAYMENT }]
      }]
    },
    shippingApplication: { findFirst: async () => null }
  }
  installPrismaMock(t, {
    $transaction: async (operation: (client: unknown) => Promise<unknown>) => operation(tx)
  })

  const res = createResponse()
  await createShippingApplication(employeeRequest({
    body: {
      batchIds: ['batch-1'],
      fileId: 'file-1',
      logisticsCompany: '测试物流',
      trackingNo: 'TEST-004'
    }
  }), res as any)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, { message: 'Only batches with all items in shipping can be selected' })
})

test('shipping application submission maps a Serializable P2034 conflict to 409', async (t) => {
  const conflict = new (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError(
    'write conflict',
    { code: 'P2034', clientVersion: '6.2.1' }
  )
  installPrismaMock(t, {
    $transaction: async () => { throw conflict }
  })

  const res = createResponse()
  await createShippingApplication(employeeRequest({
    body: {
      batchIds: ['batch-1'],
      fileId: 'file-1',
      logisticsCompany: '测试物流',
      trackingNo: 'TEST-005'
    }
  }), res as any)

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, { message: 'Purchase batch status was updated by another operation. Please refresh and retry' })
})

test('shipping application export requires login', async () => {
  const res = createResponse()

  await exportShippingApplication({ params: { id: 'order-1' }, query: { batchIds: 'batch-1' } } as any, res as any)

  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { message: 'Please sign in' })
})

test('shipping application export requires a non-empty unique batchIds list', async () => {
  for (const batchIds of ['', 'batch-1,batch-1']) {
    const res = createResponse()
    await exportShippingApplication(employeeRequest({ query: { batchIds } }), res as any)
    assert.equal(res.statusCode, 400)
  }
})

test('shipping application export rejects batches outside the requested order and empty batches', async (t) => {
  installPrismaMock(t, {
    order: {
      findUnique: async () => ({ id: 'order-1', orderNo: 'A/001', declarationCompany: '申报公司' })
    },
    purchaseInfo: {
      findMany: async () => [{ id: 'batch-1', batchItems: [] }]
    }
  })

  const crossOrderRes = createResponse()
  await exportShippingApplication(employeeRequest({ query: { batchIds: 'batch-1,batch-2' } }), crossOrderRes as any)
  assert.equal(crossOrderRes.statusCode, 404)
  assert.deepEqual(crossOrderRes.body, { message: 'Some purchase batches were not found or do not belong to this order' })

  const emptyBatchRes = createResponse()
  await exportShippingApplication(employeeRequest({ query: { batchIds: 'batch-1' } }), emptyBatchRes as any)
  assert.equal(emptyBatchRes.statusCode, 400)
  assert.deepEqual(emptyBatchRes.body, { message: 'Selected purchase batches have no items to export' })
})

test('shipping application export rejects every selection containing an empty purchase batch', async (t) => {
  installPrismaMock(t, {
    order: {
      findUnique: async () => ({ id: 'order-1', orderNo: 'A/001', declarationCompany: '申报公司' })
    },
    purchaseInfo: {
      findMany: async () => [
        {
          id: 'batch-1',
          batchItems: [{
            id: 'item-1', lineNo: 1, materialCode: 'M-1', materialDescription: '第一项', remark: null,
            supplierRemark: null, deliveryTime: null, unit: '件', quantity: 1,
            manufacturer: null, quotedPrice: 10, taxIncludedTotal: 10, applicantDepartment: null
          }]
        },
        { id: 'batch-2', batchItems: [] }
      ]
    }
  })

  const res = createResponse()
  await exportShippingApplication(employeeRequest({ query: { batchIds: 'batch-1,batch-2' } }), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Selected purchase batches have no items to export' })
})

test('any logged-in employee exports only the selected purchase batch items once per material', async (t) => {
  let purchaseInfoQuery: any
  installPrismaMock(t, {
    order: {
      findUnique: async () => ({
        id: 'order-1',
        orderNo: 'A/001',
        inquiryCompany: '测试购货单位',
        creator: { username: 'creator-user', displayName: '订单创建人' }
      })
    },
    purchaseInfo: {
      findMany: async (args: any) => {
        purchaseInfoQuery = args
        return [
          {
            id: 'batch-1',
            supplierName: '供应商 A',
            deliveryTime: '2026-08-30',
            batchItems: [
              {
                id: 'item-2', lineNo: 2, materialDescription: '第二项',
                deliveryTime: '2026-08-20', quantity: 2, purchaseQuantity: 2,
                manufacturer: '厂家 B', winningAmount: 40, taxIncludedTotal: 99,
                shippingInfo: null
              },
              {
                id: 'item-1', lineNo: 1, materialDescription: '第一项',
                deliveryTime: '2026-08-19', quantity: 1, purchaseQuantity: 1,
                manufacturer: '厂家 A', winningAmount: 10, taxIncludedTotal: 88,
                shippingInfo: { weight: '100公斤', route: '统一路线' }
              }
            ]
          },
          {
            id: 'batch-2',
            supplierName: '供应商 B',
            deliveryTime: '2026-08-31',
            batchItems: [{
              id: 'item-1', lineNo: 1, materialDescription: '第一项',
              deliveryTime: '2026-08-19', quantity: 1, purchaseQuantity: 1,
              manufacturer: '厂家 A', winningAmount: 10, taxIncludedTotal: 88,
              shippingInfo: { weight: '100公斤', route: '统一路线' }
            }]
          }
        ]
      }
    }
  })

  const res = createResponse()
  await exportShippingApplication(employeeRequest({ query: { batchIds: 'batch-2,batch-1' } }), res as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(purchaseInfoQuery.where, {
    id: { in: ['batch-2', 'batch-1'] },
    orderId: 'order-1'
  })
  assert.equal(purchaseInfoQuery.include.batchItems.select.shippingInfo.select.weight, true)
  assert.equal(purchaseInfoQuery.include.batchItems.select.winningAmount, true)
  assert.equal(purchaseInfoQuery.include.batchItems.select.purchaseQuantity, true)
  assert.match(res.headers.get('Content-Disposition') || '', /A_001/)
  assert.ok(Buffer.isBuffer(res.body))

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(res.body as any)
  const sheet = workbook.getWorksheet('Shipping Request')!
  assert.equal(sheet.getCell('A3').value, '测试购货单位')
  assert.equal(sheet.getCell('B3').value, 50)
  assert.equal(sheet.getCell('C3').value, '100公斤')
  assert.equal(sheet.getCell('A5').value, 'A/001')
  assert.equal(sheet.getCell('B5').value, '订单创建人')
  assert.equal(sheet.getCell('C5').value, '第一项')
  assert.equal(sheet.getCell('D5').value, '供应商 A/厂家 A')
  assert.equal(sheet.getCell('E5').value, 1)
  assert.equal(sheet.getCell('F5').value, '2026-08-19')
  assert.equal(sheet.getCell('C6').value, '第二项')
  assert.equal(sheet.getCell('B13').value, '当前导出员工')
})

test('shipping application export rejects inconsistent shared logistics fields', async (t) => {
  installPrismaMock(t, {
    order: {
      findUnique: async () => ({
        id: 'order-1',
        orderNo: 'A/001',
        inquiryCompany: '测试购货单位',
        creator: { username: 'creator-user', displayName: '订单创建人' }
      })
    },
    purchaseInfo: {
      findMany: async () => [{
        id: 'batch-1',
        supplierName: '供应商 A',
        deliveryTime: null,
        batchItems: [
          {
            id: 'item-1', lineNo: 1, materialDescription: '第一项', manufacturer: null,
            deliveryTime: null, quantity: 1, purchaseQuantity: 1,
            winningAmount: 10, taxIncludedTotal: 10,
            shippingInfo: { weight: '100公斤' }
          },
          {
            id: 'item-2', lineNo: 2, materialDescription: '第二项', manufacturer: null,
            deliveryTime: null, quantity: 1, purchaseQuantity: 1,
            winningAmount: 10, taxIncludedTotal: 10,
            shippingInfo: { weight: '200公斤' }
          }
        ]
      }]
    }
  })

  const res = createResponse()
  await exportShippingApplication(employeeRequest({ query: { batchIds: 'batch-1' } }), res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Selected items have inconsistent Weight. Please align the shipping details first' })
})
