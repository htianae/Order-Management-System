import assert from 'node:assert/strict'
import test from 'node:test'

import { updateCustomerPaymentSchema } from './order.validator.js'

function parseAmount(customerPaymentAmount: number) {
  return updateCustomerPaymentSchema.safeParse({
    customerPaymentStatus: 'UNPAID',
    customerPaymentAmount
  })
}

test('accepts customer payment amounts with at most two decimal places', () => {
  assert.equal(parseAmount(4450).success, true)
  assert.equal(parseAmount(0.01).success, true)
  assert.equal(parseAmount(999999999999.99).success, true)
})

test('rejects sub-cent and out-of-range customer payment amounts', () => {
  assert.equal(parseAmount(0.001).success, false)
  assert.equal(parseAmount(1000000000000).success, false)
})
