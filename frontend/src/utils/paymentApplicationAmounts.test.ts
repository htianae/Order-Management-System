import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectApprovedPaymentApplications,
  collectCompletedPaymentSummaries,
  sumApprovedAdvancePaymentAmount
} from './paymentApplicationAmounts'
import * as paymentApplicationAmounts from './paymentApplicationAmounts'

test('allows a two-decimal remaining payment percentage despite floating-point drift', () => {
  const isPaymentPercentWithinRemaining = (
    paymentApplicationAmounts as typeof paymentApplicationAmounts & {
      isPaymentPercentWithinRemaining?: (requestedPercent: number, remainingPercent: number) => boolean
    }
  ).isPaymentPercentWithinRemaining

  assert.equal(typeof isPaymentPercentWithinRemaining, 'function')
  assert.equal(isPaymentPercentWithinRemaining!(77.79, 100 - 22.21), true)
})

test('sums approved advance payment amounts only', () => {
  const total = sumApprovedAdvancePaymentAmount([
    {
      paymentApplications: [
        { status: 'APPROVED', advancePaymentAmount: '825.00' },
        { status: 'PENDING', advancePaymentAmount: '100.00' },
        { status: 'REJECTED', advancePaymentAmount: '200.00' }
      ]
    },
    {
      paymentApplications: [
        { status: 'APPROVED', advancePaymentAmount: '300.50' }
      ]
    }
  ])

  assert.equal(total, 1125.5)
})

test('returns zero when there are no approved advance payments', () => {
  const total = sumApprovedAdvancePaymentAmount([
    {
      paymentApplications: [
        { status: 'PENDING', advancePaymentAmount: '825.00' }
      ]
    },
    {}
  ])

  assert.equal(total, 0)
})

test('collects approved payment applications with total amount sorted by payment time', () => {
  const records = collectApprovedPaymentApplications([
    {
      id: 'batch-1',
      supplierName: '供应商A',
      paymentApplications: [
        {
          id: 'payment-later',
          status: 'APPROVED',
          paymentPercent: '70',
          advancePaymentAmount: '0',
          arrivalPaymentAmount: '700',
          createdAt: '2026-07-02T08:00:00.000Z',
          approvedAt: '2026-07-03T08:00:00.000Z'
        },
        {
          id: 'payment-pending',
          status: 'PENDING',
          paymentPercent: '30',
          advancePaymentAmount: '300',
          arrivalPaymentAmount: '0',
          createdAt: '2026-07-01T08:00:00.000Z',
          approvedAt: null
        }
      ]
    },
    {
      id: 'batch-2',
      supplierName: '供应商B',
      paymentApplications: [
        {
          id: 'payment-earlier',
          status: 'APPROVED',
          paymentPercent: '30',
          advancePaymentAmount: '300.456',
          arrivalPaymentAmount: '0',
          createdAt: '2026-07-01T08:00:00.000Z',
          approvedAt: '2026-07-01T09:00:00.000Z'
        }
      ]
    }
  ])

  assert.deepEqual(records.map((record) => record.id), ['payment-earlier', 'payment-later'])
  assert.equal(records[0].supplierName, '供应商B')
  assert.equal(records[0].totalAmount, 300.46)
  assert.equal(records[1].totalAmount, 700)
})

test('normalizes legacy full-split amounts to the current payment application amount', () => {
  const records = collectApprovedPaymentApplications([
    {
      id: 'batch-1',
      supplierName: '供应商A',
      purchaseCost: '102000',
      paymentApplications: [
        {
          id: 'payment-70',
          status: 'APPROVED',
          paymentPercent: '70',
          advancePaymentAmount: '30600',
          arrivalPaymentAmount: '71400',
          createdAt: '2026-07-02T08:00:00.000Z',
          approvedAt: '2026-07-02T09:00:00.000Z'
        },
        {
          id: 'payment-30',
          status: 'APPROVED',
          paymentPercent: '30',
          advancePaymentAmount: '30600',
          arrivalPaymentAmount: '71400',
          createdAt: '2026-07-03T08:00:00.000Z',
          approvedAt: '2026-07-03T09:00:00.000Z'
        }
      ]
    }
  ])

  assert.deepEqual(records.map((record) => ({
    id: record.id,
    advancePaymentAmount: record.advancePaymentAmount,
    arrivalPaymentAmount: record.arrivalPaymentAmount,
    totalAmount: record.totalAmount
  })), [
    {
      id: 'payment-70',
      advancePaymentAmount: 0,
      arrivalPaymentAmount: 71400,
      totalAmount: 71400
    },
    {
      id: 'payment-30',
      advancePaymentAmount: 30600,
      arrivalPaymentAmount: 0,
      totalAmount: 30600
    }
  ])
})

test('groups advance and tail payments into one completed payment summary per batch', () => {
  const summaries = collectCompletedPaymentSummaries([
    {
      id: 'batch-1',
      supplierName: '供应商A',
      purchaseCost: '102000',
      paymentApplications: [
        {
          id: 'payment-70',
          status: 'APPROVED',
          paymentPercent: '70',
          advancePaymentAmount: '30600',
          arrivalPaymentAmount: '71400',
          createdAt: '2026-07-02T08:00:00.000Z',
          approvedAt: '2026-07-02T09:00:00.000Z',
          remark: '尾款70%'
        },
        {
          id: 'payment-30',
          status: 'APPROVED',
          paymentPercent: '30',
          advancePaymentAmount: '30600',
          arrivalPaymentAmount: '71400',
          createdAt: '2026-07-03T08:00:00.000Z',
          approvedAt: '2026-07-03T09:00:00.000Z',
          remark: '预付30%（全款）'
        }
      ]
    },
    {
      id: 'batch-2',
      supplierName: '供应商B',
      purchaseCost: '9800',
      paymentApplications: [
        {
          id: 'payment-full',
          status: 'APPROVED',
          paymentPercent: '100',
          advancePaymentAmount: '9800',
          arrivalPaymentAmount: '0',
          createdAt: '2026-07-01T08:00:00.000Z',
          approvedAt: '2026-07-01T09:00:00.000Z',
          remark: '全款额100%'
        }
      ]
    }
  ])

  assert.deepEqual(summaries.map((summary) => ({
    batchId: summary.batchId,
    supplierName: summary.supplierName,
    advancePaymentAmount: summary.advancePaymentAmount,
    advancePaymentTime: summary.advancePaymentTime,
    arrivalPaymentAmount: summary.arrivalPaymentAmount,
    arrivalPaymentTime: summary.arrivalPaymentTime,
    totalAmount: summary.totalAmount
  })), [
    {
      batchId: 'batch-2',
      supplierName: '供应商B',
      advancePaymentAmount: 9800,
      advancePaymentTime: '2026-07-01T09:00:00.000Z',
      arrivalPaymentAmount: null,
      arrivalPaymentTime: null,
      totalAmount: 9800
    },
    {
      batchId: 'batch-1',
      supplierName: '供应商A',
      advancePaymentAmount: 30600,
      advancePaymentTime: '2026-07-02T09:00:00.000Z',
      arrivalPaymentAmount: 71400,
      arrivalPaymentTime: '2026-07-03T09:00:00.000Z',
      totalAmount: 102000
    }
  ])
})

test('does not mark supplier payments complete when a purchased material is outside every batch', () => {
  const isSupplierPaymentCompletionAccurate = (
    paymentApplicationAmounts as typeof paymentApplicationAmounts & {
      isSupplierPaymentCompletionAccurate?: (
        items: Array<{ currentStatus: string; purchaseBatchId?: string | null }>,
        batches: Array<{
          id?: string
          purchaseCost?: string | number | null
          paymentApplications?: Array<{
            status: string
            paymentPercent?: string | number | null
            advancePaymentAmount?: string | number | null
            arrivalPaymentAmount?: string | number | null
          }>
        }>
      ) => boolean
    }
  ).isSupplierPaymentCompletionAccurate

  assert.equal(typeof isSupplierPaymentCompletionAccurate, 'function')
  assert.equal(isSupplierPaymentCompletionAccurate!(
    [
      { currentStatus: 'CUSTOMER_PAID', purchaseBatchId: 'batch-1' },
      { currentStatus: 'PURCHASE_PAYMENT', purchaseBatchId: null }
    ],
    [{
      id: 'batch-1',
      purchaseCost: 9800,
      paymentApplications: [{
        status: 'APPROVED',
        paymentPercent: 100,
        advancePaymentAmount: 9800,
        arrivalPaymentAmount: 0
      }]
    }]
  ), false)
})

test('does not mark supplier payments complete when approved money is below purchase cost', () => {
  const isSupplierPaymentCompletionAccurate = (
    paymentApplicationAmounts as typeof paymentApplicationAmounts & {
      isSupplierPaymentCompletionAccurate?: (
        items: Array<{ currentStatus: string; purchaseBatchId?: string | null }>,
        batches: Array<{
          id?: string
          purchaseCost?: string | number | null
          paymentApplications?: Array<{
            status: string
            paymentPercent?: string | number | null
            advancePaymentAmount?: string | number | null
            arrivalPaymentAmount?: string | number | null
          }>
        }>
      ) => boolean
    }
  ).isSupplierPaymentCompletionAccurate

  assert.equal(typeof isSupplierPaymentCompletionAccurate, 'function')
  assert.equal(isSupplierPaymentCompletionAccurate!(
    [{ currentStatus: 'SHIPPED_TO_CUSTOMER', purchaseBatchId: 'batch-1' }],
    [{
      id: 'batch-1',
      purchaseCost: 28600,
      paymentApplications: [{
        status: 'APPROVED',
        paymentPercent: 100,
        advancePaymentAmount: 9800,
        arrivalPaymentAmount: 0
      }]
    }]
  ), false)
})
