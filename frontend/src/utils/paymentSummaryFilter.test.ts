import assert from 'node:assert/strict'
import test from 'node:test'

import { filterPaymentSummaryItems } from './paymentSummaryFilter'

const items = [
  { orderNo: '2A01/8500037265', status: 'NOT_SUBMITTED' },
  { orderNo: '266032N0206PNMKA01', status: 'PENDING' }
]

test('filters payment summaries by partial order number', () => {
  assert.deepEqual(
    filterPaymentSummaryItems(items, ' 8500037 '),
    [items[0]]
  )
})

test('combines order number and status filters', () => {
  assert.deepEqual(
    filterPaymentSummaryItems(items, 'pnmka', 'PENDING'),
    [items[1]]
  )
})
