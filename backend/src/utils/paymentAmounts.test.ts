import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'

import { calculatePaymentAmounts } from './paymentAmounts.js'
import * as paymentAmounts from './paymentAmounts.js'

test('calculates an advance-only amount for prepayment applications', () => {
  const amounts = calculatePaymentAmounts(new Prisma.Decimal(102000), 30)

  assert.equal(amounts.advancePaymentAmount?.toString(), '30600')
  assert.equal(amounts.arrivalPaymentAmount?.toString(), '0')
})

test('calculates an arrival-only amount for tail payment applications', () => {
  const amounts = calculatePaymentAmounts(new Prisma.Decimal(102000), 70)

  assert.equal(amounts.advancePaymentAmount?.toString(), '0')
  assert.equal(amounts.arrivalPaymentAmount?.toString(), '71400')
})

test('calculates full payment as a single advance amount', () => {
  const amounts = calculatePaymentAmounts(new Prisma.Decimal(9800), 100)

  assert.equal(amounts.advancePaymentAmount?.toString(), '9800')
  assert.equal(amounts.arrivalPaymentAmount?.toString(), '0')
})

test('matches a payment snapshot regardless of material id order', () => {
  const matchesPaymentApplicationSnapshot = (
    paymentAmounts as typeof paymentAmounts & {
      matchesPaymentApplicationSnapshot?: (
        snapshotCost: Prisma.Decimal | null,
        snapshotItemIds: unknown,
        currentCost: Prisma.Decimal,
        currentItemIds: string[]
      ) => boolean
    }
  ).matchesPaymentApplicationSnapshot

  assert.equal(typeof matchesPaymentApplicationSnapshot, 'function')
  assert.equal(matchesPaymentApplicationSnapshot!(
    new Prisma.Decimal(28600),
    ['item-2', 'item-1'],
    new Prisma.Decimal(28600),
    ['item-1', 'item-2']
  ), true)
})

test('rejects a payment snapshot when cost or material membership changed', () => {
  const matchesPaymentApplicationSnapshot = (
    paymentAmounts as typeof paymentAmounts & {
      matchesPaymentApplicationSnapshot?: (
        snapshotCost: Prisma.Decimal | null,
        snapshotItemIds: unknown,
        currentCost: Prisma.Decimal,
        currentItemIds: string[]
      ) => boolean
    }
  ).matchesPaymentApplicationSnapshot

  assert.equal(typeof matchesPaymentApplicationSnapshot, 'function')
  assert.equal(matchesPaymentApplicationSnapshot!(
    new Prisma.Decimal(9800),
    ['item-1'],
    new Prisma.Decimal(28600),
    ['item-1']
  ), false)
  assert.equal(matchesPaymentApplicationSnapshot!(
    new Prisma.Decimal(28600),
    ['item-1', 'item-2'],
    new Prisma.Decimal(28600),
    ['item-1']
  ), false)
})

test('allows legacy payment applications without a stored snapshot', () => {
  const matchesPaymentApplicationSnapshot = (
    paymentAmounts as typeof paymentAmounts & {
      matchesPaymentApplicationSnapshot?: (
        snapshotCost: Prisma.Decimal | null,
        snapshotItemIds: unknown,
        currentCost: Prisma.Decimal,
        currentItemIds: string[]
      ) => boolean
    }
  ).matchesPaymentApplicationSnapshot

  assert.equal(typeof matchesPaymentApplicationSnapshot, 'function')
  assert.equal(matchesPaymentApplicationSnapshot!(
    null,
    null,
    new Prisma.Decimal(28600),
    ['item-1']
  ), true)
})
