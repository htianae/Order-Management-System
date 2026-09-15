interface PendingShippingExportInput {
  id: string
  type: 'PAYMENT' | 'SHIPPING'
  groupedShipping?: boolean
  purchaseBatchIds?: string[]
}

function normalizeBatchIds(batchIds: string[] | undefined) {
  const normalized = (batchIds || []).map((batchId) => batchId.trim()).filter(Boolean)
  return Array.from(new Set(normalized))
}

export function resolvePendingShippingExportBatchIds(input: PendingShippingExportInput) {
  if (input.type !== 'SHIPPING') {
    return null
  }

  const explicitBatchIds = normalizeBatchIds(input.purchaseBatchIds)
  if (explicitBatchIds.length) {
    return explicitBatchIds
  }

  if (input.groupedShipping) {
    return null
  }

  const legacyBatchId = input.id.trim()
  return legacyBatchId ? [legacyBatchId] : null
}
