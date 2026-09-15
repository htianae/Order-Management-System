import assert from 'node:assert/strict'
import test from 'node:test'

type ShippingApplicationModule = {
  normalizeShippingBatchIds: (batchIds: string[]) => string[]
  getGroupedShippingTransition: (decision: 'APPROVE' | 'REJECT') => {
    fromStatus: string
    nextStatus: string
    applicationStatus: string
    note: string
  }
}

async function loadRules() {
  try {
    return await import('./shippingApplication.js') as ShippingApplicationModule
  } catch {
    return {} as Partial<ShippingApplicationModule>
  }
}

test('normalizes batch ids and rejects duplicate purchase batches', async () => {
  const rules = await loadRules()
  assert.equal(typeof rules.normalizeShippingBatchIds, 'function')
  assert.deepEqual(rules.normalizeShippingBatchIds!([' batch-1 ', 'batch-2']), ['batch-1', 'batch-2'])
  assert.throws(
    () => rules.normalizeShippingBatchIds!(['batch-1', ' batch-1 ']),
    /Purchase batches must be unique/
  )
})

test('approves every selected batch through the grouped transition', async () => {
  const rules = await loadRules()
  assert.equal(typeof rules.getGroupedShippingTransition, 'function')
  assert.deepEqual(rules.getGroupedShippingTransition!('APPROVE'), {
    fromStatus: 'ARRIVED_COMPANY',
    nextStatus: 'CUSTOMER_PAID',
    applicationStatus: 'APPROVED',
    note: 'Combined shipping request approved'
  })
})

test('rejects every selected batch back to logistics resubmission', async () => {
  const rules = await loadRules()
  assert.equal(typeof rules.getGroupedShippingTransition, 'function')
  assert.deepEqual(rules.getGroupedShippingTransition!('REJECT'), {
    fromStatus: 'ARRIVED_COMPANY',
    nextStatus: 'SHIPPED_TO_CUSTOMER',
    applicationStatus: 'REJECTED',
    note: 'Combined shipping request rejected. Please revise and resubmit'
  })
})
