import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'

import {
  buildOrderCustomerPaymentSummary,
  buildRecoverySummary,
} from './orderCustomerPayment.js'

test('uses order-level payment without adding legacy item payments', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(1000),
    orderPayment: { paidAmount: new Prisma.Decimal(300) },
    itemPayments: [{ paidAmount: new Prisma.Decimal(200) }],
  })

  assert.equal(summary.paidAmount.toString(), '300')
  assert.equal(summary.remainingAmount.toString(), '700')
  assert.equal(summary.state, 'PARTIAL')
  assert.equal(summary.source, 'ORDER')
})

test('merges legacy item payments only when order payment is absent', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(1000),
    orderPayment: null,
    itemPayments: [
      { paidAmount: new Prisma.Decimal(300) },
      { paidAmount: new Prisma.Decimal(700) },
    ],
  })

  assert.equal(summary.paidAmount.toString(), '1000')
  assert.equal(summary.remainingAmount.toString(), '0')
  assert.equal(summary.state, 'PAID')
  assert.equal(summary.source, 'LEGACY_ITEMS')
})

test('treats a zero order-level payment as authoritative', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(100),
    orderPayment: { paidAmount: new Prisma.Decimal(0) },
    itemPayments: [{ paidAmount: new Prisma.Decimal(100) }],
  })

  assert.equal(summary.paidAmount.toString(), '0')
  assert.equal(summary.remainingAmount.toString(), '100')
  assert.equal(summary.state, 'UNPAID')
  assert.equal(summary.source, 'ORDER')
})

test('normalizes negative legacy payments to zero', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(10),
    orderPayment: null,
    itemPayments: [{ paidAmount: new Prisma.Decimal(-5) }],
  })

  assert.equal(summary.paidAmount.toString(), '0')
  assert.equal(summary.remainingAmount.toString(), '10')
  assert.equal(summary.state, 'UNPAID')
})

test('caps historical overpayment at the order total', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(10),
    orderPayment: null,
    itemPayments: [{ paidAmount: new Prisma.Decimal(20) }],
  })

  assert.equal(summary.paidAmount.toString(), '10')
  assert.equal(summary.remainingAmount.toString(), '0')
  assert.equal(summary.state, 'PAID')
})

test('keeps zero-total orders unpaid with zero remaining amount', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal(0),
    orderPayment: null,
    itemPayments: [{ paidAmount: new Prisma.Decimal(20) }],
  })

  assert.equal(summary.orderTotal.toString(), '0')
  assert.equal(summary.paidAmount.toString(), '0')
  assert.equal(summary.remainingAmount.toString(), '0')
  assert.equal(summary.state, 'UNPAID')
})

test('preserves decimal-cent boundaries', () => {
  const summary = buildOrderCustomerPaymentSummary({
    winningAmount: new Prisma.Decimal('10.01'),
    orderPayment: null,
    itemPayments: [
      { paidAmount: new Prisma.Decimal('3.33') },
      { paidAmount: new Prisma.Decimal('6.67') },
    ],
  })

  assert.equal(summary.paidAmount.toString(), '10')
  assert.equal(summary.remainingAmount.toString(), '0.01')
  assert.equal(summary.state, 'PARTIAL')
})

test('builds recovery summary from each order once', () => {
  const summary = buildRecoverySummary([
    {
      winningAmount: new Prisma.Decimal('100.00'),
      orderPayment: { paidAmount: new Prisma.Decimal('25.50') },
      itemPayments: [{ paidAmount: new Prisma.Decimal('90') }],
    },
    {
      winningAmount: new Prisma.Decimal('50.00'),
      orderPayment: null,
      itemPayments: [{ paidAmount: new Prisma.Decimal('50') }],
    },
  ])

  assert.equal(summary.winningAmount.toString(), '150')
  assert.equal(summary.paidAmount.toString(), '75.5')
  assert.equal(summary.recoveryRate, 0.5033333333333333)
})

test('uses a zero recovery rate when the recovery denominator is zero', () => {
  const summary = buildRecoverySummary([])

  assert.equal(summary.winningAmount.toString(), '0')
  assert.equal(summary.paidAmount.toString(), '0')
  assert.equal(summary.recoveryRate, 0)
})
