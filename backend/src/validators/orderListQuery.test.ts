import assert from 'node:assert/strict'
import test from 'node:test'

import {
  orderListPageQuerySchema,
  orderListQuerySchema
} from './order.validator.js'

test('accepts deliveryTime as an order list sort field', () => {
  const result = orderListPageQuerySchema.safeParse({
    sortBy: 'deliveryTime',
    sortOrder: 'asc'
  })

  assert.equal(result.success, true)
})

test('keeps deliveryTime sorting isolated from shared order queries', () => {
  const result = orderListQuerySchema.safeParse({ sortBy: 'deliveryTime' })

  assert.equal(result.success, false)
})

test('accepts an exact order status filter', () => {
  const result = orderListQuerySchema.parse({ status: 'PURCHASING' })

  assert.equal(result.status, 'PURCHASING')
})

test('rejects unknown order statuses', () => {
  const result = orderListQuerySchema.safeParse({ status: 'UNKNOWN_STATUS' })

  assert.equal(result.success, false)
})
