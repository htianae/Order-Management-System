import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrendSeriesPoints } from './trendChart'

const chart = {
  left: 46,
  right: 684,
  top: 36,
  bottom: 244
}

const points = [
  { label: '5月', year: 2026, month: 5, orderCount: 2, winningAmount: '1000', profit: '100' },
  { label: '6月', year: 2026, month: 6, orderCount: 5, winningAmount: '5000', profit: '800' }
]

test('places series with different units into separate vertical lanes', () => {
  const orderCountPoint = buildTrendSeriesPoints(points, 'orderCount', 0, 3, chart)[1]
  const winningAmountPoint = buildTrendSeriesPoints(points, 'winningAmount', 1, 3, chart)[1]
  const profitPoint = buildTrendSeriesPoints(points, 'profit', 2, 3, chart)[1]

  assert.equal(orderCountPoint.x, winningAmountPoint.x)
  assert.equal(winningAmountPoint.x, profitPoint.x)
  assert.notEqual(orderCountPoint.y, winningAmountPoint.y)
  assert.notEqual(winningAmountPoint.y, profitPoint.y)
  assert.ok(orderCountPoint.y < winningAmountPoint.y)
  assert.ok(winningAmountPoint.y < profitPoint.y)
})

test('scales each metric inside its own lane', () => {
  const seriesPoints = buildTrendSeriesPoints(points, 'winningAmount', 1, 3, chart)

  assert.ok(seriesPoints[0].y > seriesPoints[1].y)
})
