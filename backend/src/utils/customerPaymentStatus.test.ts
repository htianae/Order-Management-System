import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCustomerPaymentStatus } from './customerPaymentStatus.js'

test('forces paid status when the saved amount is positive', () => {
  assert.equal(resolveCustomerPaymentStatus(4450), 'PAID')
  assert.equal(resolveCustomerPaymentStatus(0.01), 'PAID')
})

test('keeps unpaid status when the saved amount is zero or absent', () => {
  assert.equal(resolveCustomerPaymentStatus(0), 'UNPAID')
  assert.equal(resolveCustomerPaymentStatus(0.001), 'UNPAID')
  assert.equal(resolveCustomerPaymentStatus(undefined), 'UNPAID')
})
