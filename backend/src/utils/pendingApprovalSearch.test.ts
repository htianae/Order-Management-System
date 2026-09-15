import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterPendingApprovalItems,
  getPendingApprovalUnitCount,
  getPendingApprovalSubmittedAt,
  mergePendingApprovalItems,
  parsePendingApprovalType,
  parseSubmittedDateRange,
  resolveLegacyShippingValues,
  resolvePendingPaymentValues
} from './pendingApprovalSearch.js'

const approvals = [
  {
    id: 'payment-1',
    type: 'PAYMENT' as const,
    orderNo: '2B08/8500045854',
    submittedAt: '2026-08-05T16:00:00.000Z'
  },
  {
    id: 'shipping-1',
    type: 'SHIPPING' as const,
    orderNo: '2502/4500942027',
    submittedAt: '2026-08-06T15:59:59.999Z'
  },
  {
    id: 'next-day',
    type: 'PAYMENT' as const,
    orderNo: '2502/4500958877',
    submittedAt: '2026-08-06T16:00:00.000Z'
  },
  {
    id: 'legacy',
    type: 'SHIPPING' as const,
    orderNo: '2106/4500978615',
    submittedAt: null
  }
]

test('parses a submitted date as a China Standard Time calendar day', () => {
  const range = parseSubmittedDateRange('2026-08-06')

  assert.equal(range?.start.toISOString(), '2026-08-05T16:00:00.000Z')
  assert.equal(range?.end.toISOString(), '2026-08-06T16:00:00.000Z')
})

test('rejects invalid submitted dates instead of normalizing them', () => {
  assert.equal(parseSubmittedDateRange('2026-02-30'), null)
  assert.equal(parseSubmittedDateRange('06/08/2026'), null)
})

test('filters pending approvals by a partial order number', () => {
  const result = filterPendingApprovalItems(approvals, { orderNo: '450094' })

  assert.deepEqual(result.map((item) => item.id), ['shipping-1'])
})

test('filters both payment and shipping submissions by the selected China date', () => {
  const result = filterPendingApprovalItems(approvals, { submittedDate: '2026-08-06' })

  assert.deepEqual(result.map((item) => item.id), ['payment-1', 'shipping-1'])
})

test('combines order number and submitted date filters', () => {
  const result = filterPendingApprovalItems(approvals, {
    orderNo: '2502',
    submittedDate: '2026-08-06'
  })

  assert.deepEqual(result.map((item) => item.id), ['shipping-1'])
})

test('excludes records without submission time when a date is selected', () => {
  const result = filterPendingApprovalItems(approvals, { submittedDate: '2026-08-06' })

  assert.equal(result.some((item) => item.id === 'legacy'), false)
})

test('returns every record when no filters are provided', () => {
  assert.equal(filterPendingApprovalItems(approvals, {}).length, approvals.length)
})

test('filters payment and shipping approvals independently', () => {
  assert.deepEqual(
    filterPendingApprovalItems(approvals, { type: 'PAYMENT' }).map((item) => item.id),
    ['payment-1', 'next-day']
  )
  assert.deepEqual(
    filterPendingApprovalItems(approvals, { type: 'SHIPPING' }).map((item) => item.id),
    ['shipping-1', 'legacy']
  )
})

test('combines approval type with order number and submitted date filters', () => {
  const result = filterPendingApprovalItems(approvals, {
    type: 'SHIPPING',
    orderNo: '2502',
    submittedDate: '2026-08-06'
  })

  assert.deepEqual(result.map((item) => item.id), ['shipping-1'])
})

test('accepts only supported pending approval types', () => {
  assert.equal(parsePendingApprovalType('PAYMENT'), 'PAYMENT')
  assert.equal(parsePendingApprovalType('SHIPPING'), 'SHIPPING')
  assert.equal(parsePendingApprovalType('payment'), null)
  assert.equal(parsePendingApprovalType('OTHER'), null)
  assert.equal(parsePendingApprovalType(undefined), undefined)
})

test('uses payment application creation time for payment approvals', () => {
  const submittedAt = getPendingApprovalSubmittedAt(
    'PAYMENT',
    new Date('2026-08-06T01:20:00.000Z'),
    [new Date('2026-08-06T02:00:00.000Z')]
  )

  assert.equal(submittedAt?.toISOString(), '2026-08-06T01:20:00.000Z')
})

test('uses the latest item transition time for a shipping batch', () => {
  const submittedAt = getPendingApprovalSubmittedAt(
    'SHIPPING',
    new Date('2026-08-05T01:00:00.000Z'),
    [
      new Date('2026-08-06T02:00:00.000Z'),
      new Date('2026-08-06T02:00:03.000Z'),
      new Date('2026-08-06T02:00:01.000Z')
    ]
  )

  assert.equal(submittedAt?.toISOString(), '2026-08-06T02:00:03.000Z')
})

test('counts one grouped shipping application and removes its legacy per-batch rows', () => {
  const result = mergePendingApprovalItems(
    [
      { id: 'batch-1', type: 'SHIPPING', orderNo: 'A-1', submittedAt: null },
      { id: 'batch-2', type: 'SHIPPING', orderNo: 'A-1', submittedAt: null },
      { id: 'payment-1', type: 'PAYMENT', orderNo: 'A-2', submittedAt: null }
    ],
    [
      {
        id: 'shipping-app-1',
        type: 'SHIPPING',
        orderNo: 'A-1',
        submittedAt: '2026-08-14T02:00:00.000Z',
        purchaseBatchIds: ['batch-1', 'batch-2']
      }
    ]
  )

  assert.deepEqual(result.map((item) => item.id), ['shipping-app-1', 'payment-1'])
  assert.equal(getPendingApprovalUnitCount(result), 3)
})

test('uses only the current pending payment application without a history fallback', () => {
  const pendingApplication = {
    paymentPercent: '77.79',
    advancePaymentAmount: '0',
    arrivalPaymentAmount: '17760.23',
    bankName: '当前Bank',
    bankAccount: 'CURRENT'
  }
  const result = resolvePendingPaymentValues(pendingApplication)

  assert.deepEqual(result, pendingApplication)
  assert.equal(resolvePendingPaymentValues(null), null)
})

test('keeps legacy logistics fields only on shipping approvals', () => {
  assert.deepEqual(
    resolveLegacyShippingValues('SHIPPING', '顺丰速运', 'SF123'),
    { logisticsCompany: '顺丰速运', trackingNo: 'SF123' }
  )
  assert.deepEqual(
    resolveLegacyShippingValues('PAYMENT', '顺丰速运', 'SF123'),
    { logisticsCompany: null, trackingNo: null }
  )
})
