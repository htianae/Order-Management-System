import { Prisma } from '@prisma/client'

export type EffectivePaymentState = 'UNPAID' | 'PARTIAL' | 'PAID'
export type PaymentSource = 'ORDER' | 'LEGACY_ITEMS' | 'NONE'

export interface OrderCustomerPaymentInput {
  winningAmount: Prisma.Decimal | number | string | null | undefined
  orderPayment?: { paidAmount: Prisma.Decimal | number | string | null | undefined } | null
  itemPayments?: Array<{ paidAmount: Prisma.Decimal | number | string | null | undefined }>
}

export interface OrderCustomerPaymentSummary {
  orderTotal: Prisma.Decimal
  paidAmount: Prisma.Decimal
  remainingAmount: Prisma.Decimal
  state: EffectivePaymentState
  source: PaymentSource
}

export interface RecoverySummary {
  paidAmount: Prisma.Decimal
  winningAmount: Prisma.Decimal
  recoveryRate: number
}

function nonNegativeDecimal(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  const amount = new Prisma.Decimal(value ?? 0)
  return Prisma.Decimal.max(amount, 0)
}

function resolveSource(input: OrderCustomerPaymentInput): PaymentSource {
  if (input.orderPayment !== null && input.orderPayment !== undefined) {
    return 'ORDER'
  }
  if ((input.itemPayments ?? []).length > 0) {
    return 'LEGACY_ITEMS'
  }
  return 'NONE'
}

export function buildOrderCustomerPaymentSummary(
  input: OrderCustomerPaymentInput
): OrderCustomerPaymentSummary {
  const orderTotal = nonNegativeDecimal(input.winningAmount)
  const rawPaid = input.orderPayment !== null && input.orderPayment !== undefined
    ? nonNegativeDecimal(input.orderPayment.paidAmount)
    : (input.itemPayments ?? []).reduce(
        (total, payment) => total.plus(nonNegativeDecimal(payment.paidAmount)),
        new Prisma.Decimal(0)
      )
  const paidAmount = Prisma.Decimal.min(rawPaid, orderTotal)
  const remainingAmount = Prisma.Decimal.max(orderTotal.minus(paidAmount), 0)
  const state = paidAmount.equals(0)
    ? 'UNPAID'
    : paidAmount.greaterThanOrEqualTo(orderTotal) && orderTotal.greaterThan(0)
      ? 'PAID'
      : 'PARTIAL'

  return { orderTotal, paidAmount, remainingAmount, state, source: resolveSource(input) }
}

export function buildRecoverySummary(orders: OrderCustomerPaymentInput[]): RecoverySummary {
  const totals = orders.reduce<{ paidAmount: Prisma.Decimal; winningAmount: Prisma.Decimal }>(
    (summary, order) => {
      const orderSummary = buildOrderCustomerPaymentSummary(order)
      return {
        paidAmount: summary.paidAmount.plus(orderSummary.paidAmount),
        winningAmount: summary.winningAmount.plus(orderSummary.orderTotal),
      }
    },
    { paidAmount: new Prisma.Decimal(0), winningAmount: new Prisma.Decimal(0) }
  )

  return {
    ...totals,
    recoveryRate: totals.winningAmount.equals(0)
      ? 0
      : totals.paidAmount.dividedBy(totals.winningAmount).toNumber(),
  }
}
