import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMyOrdersSummary } from './myOrdersSummary.js'

test('builds yearly purchase amount from the purchase cost aggregate', () => {
  const summary = buildMyOrdersSummary(2026, 12, {
    winningAmount: { toString: () => '98000.50' },
    purchaseCost: { toString: () => '61500.25' }
  })

  assert.deepEqual(summary, {
    year: 2026,
    orderCount: 12,
    winningAmount: '98000.50',
    purchaseAmount: '61500.25'
  })
})

test('uses zero when the yearly purchase cost is empty', () => {
  const summary = buildMyOrdersSummary(2026, 0, {
    winningAmount: null,
    purchaseCost: null
  })

  assert.equal(summary.purchaseAmount, '0')
})
