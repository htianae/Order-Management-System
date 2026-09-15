export type CustomerPaymentAction = 'SAVE_AND_COMPLETE' | 'SAVE' | 'NONE'
export type CustomerPaymentStatus = 'PAID' | 'UNPAID'

export function resolveCustomerPaymentStatus(
  amount: number | null | undefined
): CustomerPaymentStatus {
  const paidCents = Math.round(Number(amount || 0) * 100)
  return paidCents > 0 ? 'PAID' : 'UNPAID'
}

export function getCustomerPaymentAction(status: string): CustomerPaymentAction {
  if (status === 'CUSTOMER_PAID') {
    return 'SAVE_AND_COMPLETE'
  }

  if (status === 'COMPLETED') {
    return 'SAVE'
  }

  return 'NONE'
}
