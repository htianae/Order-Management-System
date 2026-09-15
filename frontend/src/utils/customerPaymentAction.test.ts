import assert from 'node:assert/strict'
import test from 'node:test'

import { getCustomerPaymentAction, resolveCustomerPaymentStatus } from './customerPaymentAction.js'

test('keeps the existing save-and-complete action before an order is completed', () => {
  assert.equal(getCustomerPaymentAction('CUSTOMER_PAID'), 'SAVE_AND_COMPLETE')
})

test('allows payment-only updates after an order is completed', () => {
  assert.equal(getCustomerPaymentAction('COMPLETED'), 'SAVE')
})

test('does not offer customer payment actions in unrelated stages', () => {
  assert.equal(getCustomerPaymentAction('PURCHASING'), 'NONE')
})

test('derives customer payment status from the paid amount', () => {
  assert.equal(resolveCustomerPaymentStatus(4450), 'PAID')
  assert.equal(resolveCustomerPaymentStatus(0), 'UNPAID')
  assert.equal(resolveCustomerPaymentStatus(0.001), 'UNPAID')
  assert.equal(resolveCustomerPaymentStatus(undefined), 'UNPAID')
})
