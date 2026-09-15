import { OrderStatus } from '@prisma/client'

export type ShippingApprovalDecision = 'APPROVE' | 'REJECT'

export function getShippingApprovalTransition(decision: ShippingApprovalDecision) {
  if (decision === 'APPROVE') {
    return {
      nextStatus: OrderStatus.CUSTOMER_PAID,
      note: 'Shipping request approved'
    }
  }

  return {
    nextStatus: OrderStatus.SHIPPED_TO_CUSTOMER,
    note: 'Shipping request rejected. Please revise and resubmit'
  }
}
