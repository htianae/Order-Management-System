import type { OrderCustomerPaymentSummary } from '@/types/order'

export type OrderPaymentDraftState = OrderCustomerPaymentSummary['state'] | 'INVALID'

const ORDER_PAYMENT_STATE_TEXT: Record<OrderPaymentDraftState, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid in Full',
  INVALID: 'Invalid Amount'
}

export function getOrderPaymentDisplayState(summary: { state: OrderPaymentDraftState }) {
  return ORDER_PAYMENT_STATE_TEXT[summary.state]
}

export function getOrderPaymentDraftState(amount: number, orderTotal: number): OrderPaymentDraftState {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(orderTotal) || orderTotal < 0 || amount > orderTotal) {
    return 'INVALID'
  }

  if (orderTotal > 0 && amount === orderTotal) {
    return 'PAID'
  }

  return amount > 0 ? 'PARTIAL' : 'UNPAID'
}

export function getOrderPaymentDraftTagType(state: OrderPaymentDraftState) {
  if (state === 'INVALID') {
    return 'danger'
  }

  if (state === 'PAID') {
    return 'success'
  }

  return state === 'PARTIAL' ? 'warning' : 'info'
}

export function clampPaymentDraft(amount: number, orderTotal: number) {
  const normalizedTotal = Number.isFinite(orderTotal) ? Math.max(orderTotal, 0) : 0
  const normalizedAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0

  return Math.min(normalizedAmount, normalizedTotal)
}

export function getRemainingPaymentAmount(orderTotal: number, paidAmount: number) {
  const normalizedTotal = Number.isFinite(orderTotal) ? Math.max(orderTotal, 0) : 0
  const normalizedPaidAmount = Number.isFinite(paidAmount) ? Math.max(paidAmount, 0) : 0

  return Math.max(Math.round((normalizedTotal - normalizedPaidAmount) * 100) / 100, 0)
}

export function getPaymentDraftError(amount: number, orderTotal: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    return 'Actual payment cannot be less than 0'
  }

  if (amount > Math.max(orderTotal, 0)) {
    return 'Actual payment cannot exceed the order total'
  }

  return null
}
