import assert from 'node:assert/strict'
import test from 'node:test'

type ResolverModule = {
  resolvePendingShippingExportBatchIds: (input: {
    id: string
    type: 'PAYMENT' | 'SHIPPING'
    groupedShipping?: boolean
    purchaseBatchIds?: string[]
  }) => string[] | null
}

async function loadResolver() {
  try {
    return await import('./pendingShippingExport') as ResolverModule
  } catch {
    return {} as Partial<ResolverModule>
  }
}

test('uses explicit purchase batch ids for a grouped shipping application', async () => {
  const resolver = await loadResolver()
  assert.equal(typeof resolver.resolvePendingShippingExportBatchIds, 'function')
  assert.deepEqual(resolver.resolvePendingShippingExportBatchIds!({
    id: 'shipping-application-1',
    type: 'SHIPPING',
    groupedShipping: true,
    purchaseBatchIds: [' batch-2 ', 'batch-1', 'batch-2']
  }), ['batch-2', 'batch-1'])
})

test('uses the legacy pending record id only when it represents a purchase batch', async () => {
  const resolver = await loadResolver()
  assert.equal(typeof resolver.resolvePendingShippingExportBatchIds, 'function')
  assert.deepEqual(resolver.resolvePendingShippingExportBatchIds!({
    id: 'legacy-batch-1',
    type: 'SHIPPING'
  }), ['legacy-batch-1'])
})

test('refuses export when a grouped shipping record has no usable batch ids', async () => {
  const resolver = await loadResolver()
  assert.equal(typeof resolver.resolvePendingShippingExportBatchIds, 'function')
  assert.equal(resolver.resolvePendingShippingExportBatchIds!({
    id: 'shipping-application-1',
    type: 'SHIPPING',
    groupedShipping: true,
    purchaseBatchIds: []
  }), null)
  assert.equal(resolver.resolvePendingShippingExportBatchIds!({
    id: 'payment-1',
    type: 'PAYMENT'
  }), null)
})
