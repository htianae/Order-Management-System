import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampPaymentDraft,
  getOrderPaymentDraftState,
  getOrderPaymentDraftTagType,
  getOrderPaymentDisplayState,
  getPaymentDraftError,
  getRemainingPaymentAmount
} from './orderCustomerPayment.js'

test('maps backend order payment states to the customer-facing labels', () => {
  assert.equal(getOrderPaymentDisplayState({ state: 'UNPAID' }), 'Unpaid')
  assert.equal(getOrderPaymentDisplayState({ state: 'PARTIAL' }), 'Partially Paid')
  assert.equal(getOrderPaymentDisplayState({ state: 'PAID' }), 'Paid in Full')
})

test('derives the current payment state from the editable payment draft', () => {
  assert.equal(getOrderPaymentDraftState(0, 100), 'UNPAID')
  assert.equal(getOrderPaymentDraftState(35.5, 100), 'PARTIAL')
  assert.equal(getOrderPaymentDraftState(100, 100), 'PAID')
})

test('marks over-total payment drafts as an amount error with a danger tag', () => {
  const state = getOrderPaymentDraftState(100.01, 100)

  assert.equal(state, 'INVALID')
  assert.equal(getOrderPaymentDisplayState({ state }), 'Invalid Amount')
  assert.equal(getOrderPaymentDraftTagType(state), 'danger')
})

test('marks negative and non-finite payment drafts as amount errors', () => {
  assert.equal(getOrderPaymentDraftState(-0.01, 100), 'INVALID')
  assert.equal(getOrderPaymentDraftState(Number.NaN, 100), 'INVALID')
  assert.equal(getOrderPaymentDraftState(Number.POSITIVE_INFINITY, 100), 'INVALID')
})

test('keeps legal payment draft tag types unchanged', () => {
  assert.equal(getOrderPaymentDraftTagType('UNPAID'), 'info')
  assert.equal(getOrderPaymentDraftTagType('PARTIAL'), 'warning')
  assert.equal(getOrderPaymentDraftTagType('PAID'), 'success')
})

test('clamps negative and non-numeric payment drafts to zero', () => {
  assert.equal(clampPaymentDraft(-0.01, 100), 0)
  assert.equal(clampPaymentDraft(Number.NaN, 100), 0)
})

test('keeps partial and exact-full payment drafts unchanged', () => {
  assert.equal(clampPaymentDraft(45.5, 100), 45.5)
  assert.equal(clampPaymentDraft(100, 100), 100)
})

test('clamps payment drafts above the order total to the order total', () => {
  assert.equal(clampPaymentDraft(100.01, 100), 100)
})

test('treats a zero or negative order total as a zero payment ceiling', () => {
  assert.equal(clampPaymentDraft(1, 0), 0)
  assert.equal(clampPaymentDraft(1, -10), 0)
})

test('calculates a non-negative remaining order balance', () => {
  assert.equal(getRemainingPaymentAmount(100, 35.25), 64.75)
  assert.equal(getRemainingPaymentAmount(100, 100), 0)
  assert.equal(getRemainingPaymentAmount(100, 120), 0)
})

test('rejects negative and over-total order payment drafts', () => {
  assert.equal(getPaymentDraftError(-0.01, 100), 'Actual payment cannot be less than 0')
  assert.equal(getPaymentDraftError(100.01, 100), 'Actual payment cannot exceed the order total')
  assert.equal(getPaymentDraftError(100, 100), null)
})
