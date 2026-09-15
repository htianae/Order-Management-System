import { Prisma } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPurchaseContractWorkbook,
  type PurchaseContractOrder
} from './purchaseContractWorkbook.js'

const baseHeaders = [
  'No.',
  'Customer',
  'Order Contact',
  'Sales Contract No.',
  'Product Name',
  'Model / Specification',
  'Customer Notes',
  'End User',
  'Manufacturer',
  'Quantity',
  '',
  'Unit Price (CNY, Tax Incl.)',
  'Amount (CNY, Tax Incl.)',
  'Contract Date',
  'Delivery Date',
  'Supplier',
  'Purchase Contract No.',
  'Quantity',
  'Unit Price (CNY, Tax Incl.)',
  'Amount (CNY, Tax Incl.)',
  'Contract Amount (CNY)',
  'Lead Time'
]

function createOrder(input: {
  id: string
  orderNo: string
  createdAt: string
  quantity: number
  quotedPrice: number
  purchaseQuantity: number
  purchaseUnitPrice: number
}): PurchaseContractOrder {
  return {
    id: input.id,
    orderNo: input.orderNo,
    inquiryCompany: '测试客户',
    inquiryPerson: '',
    inquiryDate: new Date('2026-01-01T16:00:00.000Z'),
    productNameCn: null,
    modelSpec: null,
    createdAt: new Date(input.createdAt),
    creator: {
      username: 'employee-1',
      displayName: '员工一'
    },
    items: [
      {
        id: `${input.id}-item`,
        lineNo: 1,
        materialCode: 'MODEL-1',
        materialDescription: '测试物料',
        remark: '客户备注',
        applicantDepartment: '使用部门',
        manufacturer: '生产厂家',
        quantity: new Prisma.Decimal(input.quantity),
        unit: '件',
        quotedPrice: new Prisma.Decimal(input.quotedPrice),
        purchaseQuantity: new Prisma.Decimal(input.purchaseQuantity),
        purchaseUnitPrice: new Prisma.Decimal(input.purchaseUnitPrice),
        purchaseTotal: null,
        deliveryTime: '2026-02-01',
        purchaseInfo: null,
        purchaseBatch: {
          supplierName: '采购公司',
          deliveryTime: '2026-01-20',
          purchaseCost: new Prisma.Decimal(input.purchaseQuantity * input.purchaseUnitPrice),
          batchItems: [{ id: `${input.id}-item` }]
        }
      }
    ]
  } as unknown as PurchaseContractOrder
}

const laterOrder = createOrder({
  id: 'order-2',
  orderNo: 'ORDER-2',
  createdAt: '2026-02-01T01:00:00.000Z',
  quantity: 1,
  quotedPrice: 50,
  purchaseQuantity: 1,
  purchaseUnitPrice: 30
})

const earlierOrder = createOrder({
  id: 'order-1',
  orderNo: 'ORDER-1',
  createdAt: '2026-01-02T01:30:00.000Z',
  quantity: 2,
  quotedPrice: 100,
  purchaseQuantity: 3,
  purchaseUnitPrice: 40
})

test('builds an annual workbook with created time, stable ordering and shifted formulas', () => {
  const workbook = buildPurchaseContractWorkbook([laterOrder, earlierOrder], { includeCreatedAt: true })
  const sheet = workbook.getWorksheet('Purchase Contracts')!
  const headers = sheet.getRow(1).values

  assert.equal(sheet.columnCount, 23)
  assert.ok(Array.isArray(headers))
  assert.deepEqual(headers.slice(1), ['Order Created At', ...baseHeaders])
  assert.equal(sheet.getCell('A1').value, 'Order Created At')
  assert.equal(sheet.getCell('B1').value, 'No.')
  assert.equal(sheet.getCell('E1').value, 'Sales Contract No.')
  assert.equal(sheet.getCell('A2').value, '2026-01-02 09:30')
  assert.equal(sheet.getCell('B2').value, 1)
  assert.equal(sheet.getCell('E2').value, 'ORDER-1')
  assert.deepEqual(sheet.getCell('N2').value, { formula: 'M2*K2', result: 200 })
  assert.deepEqual(sheet.getCell('U2').value, { formula: 'T2*S2', result: 120 })
  assert.deepEqual(sheet.getCell('V2').value, { formula: 'U2', result: 120 })
  assert.equal(sheet.getCell('B3').value, 2)
  assert.equal(sheet.getCell('E3').value, 'ORDER-2')
  assert.deepEqual(sheet.autoFilter, { from: 'A1', to: 'W3' })
})

test('keeps the existing single-order purchase contract columns and formulas', () => {
  const workbook = buildPurchaseContractWorkbook([earlierOrder])
  const sheet = workbook.getWorksheet('Purchase Contracts')!
  const headers = sheet.getRow(1).values

  assert.equal(sheet.columnCount, 22)
  assert.ok(Array.isArray(headers))
  assert.deepEqual(headers.slice(1), baseHeaders)
  assert.equal(sheet.getCell('A1').value, 'No.')
  assert.equal(sheet.getCell('D1').value, 'Sales Contract No.')
  assert.equal(sheet.getCell('A2').value, 1)
  assert.deepEqual(sheet.getCell('M2').value, { formula: 'L2*J2', result: 200 })
  assert.deepEqual(sheet.getCell('T2').value, { formula: 'S2*R2', result: 120 })
  assert.deepEqual(sheet.getCell('U2').value, { formula: 'T2', result: 120 })
  assert.deepEqual(sheet.autoFilter, { from: 'A1', to: 'V2' })
})

test('keeps the legacy local-calendar signing date behavior', () => {
  const order = createOrder({
    id: 'date-order',
    orderNo: 'DATE-ORDER',
    createdAt: '2026-01-01T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 1,
    purchaseUnitPrice: 1
  })
  order.inquiryDate = new Date('2026-01-01T16:30:00.000Z')
  const expected = `${order.inquiryDate.getFullYear()}.${order.inquiryDate.getMonth() + 1}.${order.inquiryDate.getDate()}`
  const workbook = buildPurchaseContractWorkbook([order])
  const sheet = workbook.getWorksheet('Purchase Contracts')!

  assert.equal(sheet.getCell('N2').value, expected)
})

test('uses purchase unit price before purchase info and single-item batch fallbacks', () => {
  const explicitZeroOrder = createOrder({
    id: 'zero-order',
    orderNo: 'ZERO-ORDER',
    createdAt: '2026-01-01T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 2,
    purchaseUnitPrice: 0
  })
  explicitZeroOrder.items[0].purchaseInfo = {
    purchaseCost: new Prisma.Decimal(25)
  } as PurchaseContractOrder['items'][number]['purchaseInfo']
  explicitZeroOrder.items[0].purchaseBatch!.purchaseCost = new Prisma.Decimal(30)

  const purchaseInfoOrder = createOrder({
    id: 'info-order',
    orderNo: 'INFO-ORDER',
    createdAt: '2026-01-02T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 2,
    purchaseUnitPrice: 9
  })
  purchaseInfoOrder.items[0].purchaseUnitPrice = null
  purchaseInfoOrder.items[0].purchaseInfo = {
    purchaseCost: new Prisma.Decimal(25)
  } as PurchaseContractOrder['items'][number]['purchaseInfo']

  const batchOrder = createOrder({
    id: 'batch-order',
    orderNo: 'BATCH-ORDER',
    createdAt: '2026-01-03T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 2,
    purchaseUnitPrice: 9
  })
  batchOrder.items[0].purchaseUnitPrice = null
  batchOrder.items[0].purchaseBatch!.purchaseCost = new Prisma.Decimal(30)

  const workbook = buildPurchaseContractWorkbook([
    explicitZeroOrder,
    purchaseInfoOrder,
    batchOrder
  ], { includeCreatedAt: true })
  const sheet = workbook.getWorksheet('Purchase Contracts')!

  assert.equal(sheet.getCell('T2').value, 0)
  assert.deepEqual(sheet.getCell('U2').value, { formula: 'T2*S2' })
  assert.equal(sheet.getCell('T3').value, 25)
  assert.equal(sheet.getCell('T4').value, 30)
})

test('does not treat a multi-item batch total as one item unit price', () => {
  const order = createOrder({
    id: 'multi-batch-order',
    orderNo: 'MULTI-BATCH-ORDER',
    createdAt: '2026-01-01T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 2,
    purchaseUnitPrice: 9
  })
  order.items[0].purchaseUnitPrice = null
  order.items[0].purchaseBatch!.batchItems.push({ id: 'another-item' })
  const workbook = buildPurchaseContractWorkbook([order], { includeCreatedAt: true })
  const sheet = workbook.getWorksheet('Purchase Contracts')!

  assert.equal(sheet.getCell('T2').value, null)
  assert.equal(sheet.getCell('U2').value, null)
})

test('preserves an explicitly entered zero purchase total instead of replacing it with a formula', () => {
  const order = createOrder({
    id: 'zero-total-order',
    orderNo: 'ZERO-TOTAL-ORDER',
    createdAt: '2026-01-01T00:00:00.000Z',
    quantity: 1,
    quotedPrice: 1,
    purchaseQuantity: 2,
    purchaseUnitPrice: 9
  })
  order.items[0].purchaseTotal = new Prisma.Decimal(0)
  const workbook = buildPurchaseContractWorkbook([order], { includeCreatedAt: true })
  const sheet = workbook.getWorksheet('Purchase Contracts')!

  assert.equal(sheet.getCell('U2').value, 0)
  assert.equal(sheet.getCell('V2').value, 0)
})
