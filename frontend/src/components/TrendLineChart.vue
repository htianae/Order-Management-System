<template>
  <section class="trend-chart">
    <div class="trend-chart-header">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="trend-chart-legend">
        <span v-for="series in seriesDefinitions" :key="series.key">
          <i :style="{ backgroundColor: series.color }" />
          {{ series.label }}
        </span>
      </div>
    </div>

    <svg class="trend-chart-svg" viewBox="0 0 720 300" role="img" :aria-label="title">
      <line class="trend-axis" x1="46" y1="244" x2="684" y2="244" />
      <line class="trend-axis" x1="46" y1="36" x2="46" y2="244" />
      <line
        v-for="lane in laneMarkers"
        :key="lane.label"
        class="trend-grid-line"
        x1="46"
        :y1="lane.bottom"
        x2="684"
        :y2="lane.bottom"
      />
      <text
        v-for="lane in laneMarkers"
        :key="`label-${lane.label}`"
        class="trend-lane-label"
        x="56"
        :y="lane.top + 14"
        :fill="lane.color"
      >
        {{ lane.label }}
      </text>

      <g v-for="point in axisPoints" :key="point.label">
        <text class="trend-axis-label" :x="point.x" y="272" text-anchor="middle">{{ point.label }}</text>
      </g>

      <g v-for="series in seriesDefinitions" :key="series.key">
        <polyline
          class="trend-line"
          :points="getPolylinePoints(series.key)"
          :stroke="series.color"
        />
        <g v-for="point in getSeriesPoints(series.key)" :key="`${series.key}-${point.label}`">
          <circle
            class="trend-dot"
            :cx="point.x"
            :cy="point.y"
            r="6"
            :fill="series.color"
            tabindex="0"
            @mouseenter="showTooltip(point, series)"
            @focus="showTooltip(point, series)"
            @mouseleave="hideTooltip"
            @blur="hideTooltip"
          >
            <title>{{ point.label }} {{ series.label }}：{{ formatSeriesValue(series.key, point.value) }}</title>
          </circle>
        </g>
      </g>

      <g v-if="activeTooltip" class="trend-tooltip" :transform="`translate(${tooltipPosition.x}, ${tooltipPosition.y})`">
        <rect width="168" height="56" rx="6" />
        <text x="12" y="22">{{ activeTooltip.label }} {{ activeTooltip.seriesLabel }}</text>
        <text x="12" y="43" class="trend-tooltip-value">{{ activeTooltip.formattedValue }}</text>
      </g>
    </svg>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import type { BusinessTrendPoint } from '@/types/report'
import {
  buildTrendSeriesPoints,
  getTrendLaneBounds,
  type TrendChartBounds,
  type TrendSeriesKey,
  type TrendSeriesPoint
} from '@/utils/trendChart'

interface SeriesDefinition {
  key: TrendSeriesKey
  label: string
  color: string
}

const props = defineProps<{
  title: string
  subtitle: string
  points: BusinessTrendPoint[]
}>()

const chart: TrendChartBounds = {
  left: 46,
  right: 684,
  top: 36,
  bottom: 244
}
const seriesDefinitions: SeriesDefinition[] = [
  { key: 'orderCount', label: 'Order Volume', color: '#2563eb' },
  { key: 'winningAmount', label: 'Revenue', color: '#16a34a' },
  { key: 'profit', label: 'Profit', color: '#f59e0b' }
]
const activeTooltip = ref<{
  label: string
  seriesLabel: string
  formattedValue: string
  x: number
  y: number
} | null>(null)

const axisPoints = computed(() => {
  const points = props.points.length ? props.points : []
  const width = chart.right - chart.left

  return points.map((point, index) => ({
    label: point.label,
    x: points.length === 1 ? chart.left + width / 2 : chart.left + width * index / (points.length - 1)
  }))
})

const laneMarkers = computed(() => seriesDefinitions.map((series, index) => ({
  ...getTrendLaneBounds(index, seriesDefinitions.length, chart),
  label: series.label,
  color: series.color
})))

const tooltipPosition = computed(() => {
  if (!activeTooltip.value) {
    return {
      x: 0,
      y: 0
    }
  }

  return {
    x: Math.min(Math.max(activeTooltip.value.x + 12, chart.left), chart.right - 168),
    y: Math.min(Math.max(activeTooltip.value.y - 68, chart.top - 22), chart.bottom - 56)
  }
})

function getSeriesPoints(key: TrendSeriesKey) {
  const seriesIndex = seriesDefinitions.findIndex((series) => series.key === key)
  return buildTrendSeriesPoints(props.points, key, Math.max(seriesIndex, 0), seriesDefinitions.length, chart)
}

function getPolylinePoints(key: TrendSeriesKey) {
  return getSeriesPoints(key).map((point) => `${point.x},${point.y}`).join(' ')
}

function formatSeriesValue(key: TrendSeriesKey, value: number) {
  if (key === 'orderCount') {
    return `${value}  orders`
  }

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
}

function showTooltip(point: TrendSeriesPoint, series: SeriesDefinition) {
  activeTooltip.value = {
    label: point.label,
    seriesLabel: series.label,
    formattedValue: formatSeriesValue(series.key, point.value),
    x: point.x,
    y: point.y
  }
}

function hideTooltip() {
  activeTooltip.value = null
}
</script>
