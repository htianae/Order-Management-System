import assert from 'node:assert/strict'
import test from 'node:test'

import { BidResult, Prisma } from '@prisma/client'

import { getItemWinningAmount, getItemWinningAmountUpdateData } from './orderWinningAmount.js'

test('uses tax-included total for a won item', () => {
  assert.equal(getItemWinningAmount(BidResult.WON, new Prisma.Decimal('123.45'))?.toString(), '123.45')
})

test('excludes a lost or pending item from order amount', () => {
  assert.equal(getItemWinningAmount(BidResult.LOST, new Prisma.Decimal('123.45')), null)
  assert.equal(getItemWinningAmount(BidResult.PENDING, new Prisma.Decimal('123.45')), null)
})

test('writes a supplied winning price to both tax-included total and winning amount', () => {
  const data = getItemWinningAmountUpdateData(BidResult.WON, new Prisma.Decimal('100'), 120)

  assert.equal(data.taxIncludedTotal?.toString(), '120')
  assert.equal(data.winningAmount?.toString(), '120')
})

test('keeps the existing tax-included total when a won-item amount is omitted', () => {
  const data = getItemWinningAmountUpdateData(BidResult.WON, new Prisma.Decimal('123.45'), undefined)

  assert.equal(data.taxIncludedTotal?.toString(), '123.45')
  assert.equal(data.winningAmount?.toString(), '123.45')
})
