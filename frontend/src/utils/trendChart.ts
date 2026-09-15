import type { BusinessTrendPoint } from '@/types/report'

export type TrendSeriesKey = 'orderCount' | 'winningAmount' | 'profit'

export interface TrendChartBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export interface TrendSeriesPoint {
  label: string
  value: number
  x: number
  y: number
}

export interface TrendLaneBounds {
  top: number
  bottom: number
  middle: number
}

function getValue(point: BusinessTrendPoint, key: TrendSeriesKey) {
  if (key === 'orderCount') {
    return Number(point.orderCount || 0)
  }

  const value = Number(point[key] || 0)
  return Number.isFinite(value) ? value : 0
}

export function getTrendLaneBounds(
  seriesIndex: number,
  seriesCount: number,
  chart: TrendChartBounds,
  laneGap = 16
): TrendLaneBounds {
  const availableHeight = chart.bottom - chart.top - laneGap * Math.max(seriesCount - 1, 0)
  const laneHeight = availableHeight / Math.max(seriesCount, 1)
  const top = chart.top + seriesIndex * (laneHeight + laneGap)
  const bottom = top + laneHeight

  return {
    top,
    bottom,
    middle: top + laneHeight / 2
  }
}

export function buildTrendSeriesPoints(
  points: BusinessTrendPoint[],
  key: TrendSeriesKey,
  seriesIndex: number,
  seriesCount: number,
  chart: TrendChartBounds
): TrendSeriesPoint[] {
  const values = points.map((point) => getValue(point, key))
  const max = Math.max(...values, 0)
  const width = chart.right - chart.left
  const lane = getTrendLaneBounds(seriesIndex, seriesCount, chart)
  const laneHeight = lane.bottom - lane.top

  return points.map((point, index) => {
    const value = getValue(point, key)
    const x = points.length === 1 ? chart.left + width / 2 : chart.left + width * index / (points.length - 1)
    const y = max > 0 ? lane.top + laneHeight * (1 - value / max) : lane.bottom

    return {
      label: point.label,
      value,
      x,
      y
    }
  })
}
