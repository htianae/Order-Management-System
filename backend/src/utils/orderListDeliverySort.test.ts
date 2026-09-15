import assert from 'node:assert/strict'
import test from 'node:test'

import { sortAndPaginateOrdersByDeliveryTime } from './orderListDeliverySort.js'

interface TestOrder {
  id: string
  createdAt: Date
  items: Array<{ deliveryTime: string | null }>
}

const orders: TestOrder[] = [
  {
    id: 'blank',
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    items: [{ deliveryTime: null }, { deliveryTime: '' }]
  },
  {
    id: 'far',
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    items: [{ deliveryTime: '2026-10-01' }]
  },
  {
    id: 'invalid',
    createdAt: new Date('2026-08-06T00:00:00.000Z'),
    items: [{ deliveryTime: '2026-02-31' }]
  },
  {
    id: 'middle',
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    items: [{ deliveryTime: '2026/09/15' }]
  },
  {
    id: 'nearest',
    createdAt: new Date('2026-08-02T00:00:00.000Z'),
    items: [{ deliveryTime: '2026-09-01' }, { deliveryTime: '2026-08-20' }]
  }
]

test('sorts all orders by their earliest valid delivery date before pagination', () => {
  const firstPage = sortAndPaginateOrdersByDeliveryTime(orders, 'asc', 0, 2)
  const secondPage = sortAndPaginateOrdersByDeliveryTime(orders, 'asc', 2, 2)

  assert.deepEqual(firstPage.map((order) => order.id), ['nearest', 'middle'])
  assert.deepEqual(secondPage.map((order) => order.id), ['far', 'invalid'])
})

test('sorts valid delivery dates from farthest to nearest while keeping missing dates last', () => {
  const result = sortAndPaginateOrdersByDeliveryTime(orders, 'desc', 0, 10)

  assert.deepEqual(result.map((order) => order.id), [
    'far',
    'middle',
    'nearest',
    'invalid',
    'blank'
  ])
})

test('uses creation time descending when orders have the same delivery date', () => {
  const tiedOrders: TestOrder[] = [
    {
      id: 'older',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      items: [{ deliveryTime: '2026-09-01' }]
    },
    {
      id: 'newer',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      items: [{ deliveryTime: '2026/09/01' }]
    }
  ]

  const result = sortAndPaginateOrdersByDeliveryTime(tiedOrders, 'asc', 0, 10)

  assert.deepEqual(result.map((order) => order.id), ['newer', 'older'])
})

test('treats non-standard date text as invalid', () => {
  const nonStandardOrders: TestOrder[] = [
    {
      id: 'valid',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      items: [{ deliveryTime: '2026-10-01' }]
    },
    {
      id: 'embedded',
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      items: [{ deliveryTime: '预计 2026-09-01 左右' }]
    },
    {
      id: 'trailing',
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      items: [{ deliveryTime: '2026-09-01abc' }]
    },
    {
      id: 'single-digit',
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
      items: [{ deliveryTime: '2026-9-1' }]
    },
    {
      id: 'mixed-separators',
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      items: [{ deliveryTime: '2026/09-01' }]
    }
  ]

  const result = sortAndPaginateOrdersByDeliveryTime(nonStandardOrders, 'asc', 0, 10)

  assert.deepEqual(result.map((order) => order.id), [
    'valid',
    'mixed-separators',
    'single-digit',
    'trailing',
    'embedded'
  ])
})
