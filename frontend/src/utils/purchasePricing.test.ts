import assert from 'node:assert/strict'
import test from 'node:test'

import { calculatePurchaseTotal, sumPurchaseTotals } from './purchasePricing'

test('calculates purchase total from quantity and unit price', () => {
  assert.equal(calculatePurchaseTotal(3, 12.345), 37.04)
})

test('does not calculate a total when quantity or unit price is missing', () => {
  assert.equal(calculatePurchaseTotal(undefined, 12), undefined)
  assert.equal(calculatePurchaseTotal(3, undefined), undefined)
})

test('sums only defined purchase totals', () => {
  assert.equal(sumPurchaseTotals([12.5, undefined, 7.25]), 19.75)
})
