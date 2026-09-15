import { OrderStatus, ShippingApplicationStatus } from '@prisma/client'

export type GroupedShippingDecision = 'APPROVE' | 'REJECT'

export function normalizeShippingBatchIds(batchIds: string[]) {
  const normalized = batchIds.map((batchId) => batchId.trim()).filter(Boolean)

  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Purchase batches must be unique')
  }

  return normalized
}

export function getGroupedShippingTransition(decision: GroupedShippingDecision) {
  if (decision === 'APPROVE') {
    return {
      fromStatus: OrderStatus.ARRIVED_COMPANY,
      nextStatus: OrderStatus.CUSTOMER_PAID,
      applicationStatus: ShippingApplicationStatus.APPROVED,
      note: 'Combined shipping request approved'
    }
  }

  return {
    fromStatus: OrderStatus.ARRIVED_COMPANY,
    nextStatus: OrderStatus.SHIPPED_TO_CUSTOMER,
    applicationStatus: ShippingApplicationStatus.REJECTED,
    note: 'Combined shipping request rejected. Please revise and resubmit'
  }
}
