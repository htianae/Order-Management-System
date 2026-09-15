import assert from 'node:assert/strict'
import test from 'node:test'

import { getShippingApprovalTransition } from './shippingApproval.js'

test('approving shipping moves the batch to customer payment', () => {
  assert.deepEqual(getShippingApprovalTransition('APPROVE'), {
    nextStatus: 'CUSTOMER_PAID',
    note: 'Shipping request approved'
  })
})

test('rejecting shipping returns the batch for logistics resubmission', () => {
  assert.deepEqual(getShippingApprovalTransition('REJECT'), {
    nextStatus: 'SHIPPED_TO_CUSTOMER',
    note: 'Shipping request rejected. Please revise and resubmit'
  })
})
