import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBusinessTrend } from './businessTrend.js'

test('builds twelve monthly points for the selected year', () => {
  const trend = buildBusinessTrend([
    {
      inquiryDate: new Date(Date.UTC(2026, 0, 10)),
      winningAmount: { toString: () => '1000' },
      profit: { toString: () => '120' }
    },
    {
      inquiryDate: new Date(Date.UTC(2026, 0, 20)),
      winningAmount: { toString: () => '500' },
      profit: { toString: () => '80' }
    },
    {
      inquiryDate: new Date(Date.UTC(2026, 2, 3)),
      winningAmount: { toString: () => '300' },
      profit: null
    },
    {
      inquiryDate: new Date(Date.UTC(2025, 11, 31)),
      winningAmount: { toString: () => '999' },
      profit: { toString: () => '99' }
    }
  ], 2026)

  assert.equal(trend.monthly.length, 12)
  assert.deepEqual(trend.monthly[0], {
    label: 'Jan',
    year: 2026,
    month: 1,
    orderCount: 2,
    winningAmount: '1500',
    profit: '200'
  })
  assert.deepEqual(trend.monthly[1], {
    label: 'Feb',
    year: 2026,
    month: 2,
    orderCount: 0,
    winningAmount: '0',
    profit: '0'
  })
  assert.equal(trend.monthly[2].orderCount, 1)
  assert.equal(trend.monthly[2].winningAmount, '300')
  assert.equal(trend.monthly[2].profit, '0')
})

test('builds yearly points and keeps only the current year when no previous data exists', () => {
  const trend = buildBusinessTrend([
    {
      inquiryDate: new Date(Date.UTC(2026, 6, 1)),
      winningAmount: { toString: () => '2000' },
      profit: { toString: () => '300' }
    }
  ], 2026)

  assert.deepEqual(trend.yearly, [
    {
      label: '2026',
      year: 2026,
      orderCount: 1,
      winningAmount: '2000',
      profit: '300'
    }
  ])
})

test('builds sorted yearly points across available years', () => {
  const trend = buildBusinessTrend([
    {
      inquiryDate: new Date(Date.UTC(2025, 5, 1)),
      winningAmount: { toString: () => '1000' },
      profit: { toString: () => '100' }
    },
    {
      inquiryDate: new Date(Date.UTC(2026, 5, 1)),
      winningAmount: { toString: () => '2000' },
      profit: { toString: () => '300' }
    }
  ], 2026)

  assert.deepEqual(trend.yearly.map((point) => point.year), [2025, 2026])
  assert.deepEqual(trend.yearly.map((point) => point.orderCount), [1, 1])
})
