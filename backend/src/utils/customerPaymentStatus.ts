import { CustomerPaymentStatus } from '@prisma/client'

export function resolveCustomerPaymentStatus(
  amount: number | null | undefined
): CustomerPaymentStatus {
  const paidCents = Math.round(Number(amount || 0) * 100)
  return paidCents > 0
    ? CustomerPaymentStatus.PAID
    : CustomerPaymentStatus.UNPAID
}
