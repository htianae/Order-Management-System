interface PendingPaymentRequestInput {
  type: 'PAYMENT' | 'SHIPPING'
  paymentPercent: string | null
  advancePaymentAmount: string
  arrivalPaymentAmount: string
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatPercent(value: string | null) {
  const percent = Number(value || 0)
  return Number.isFinite(percent) ? `${percent}%` : '-'
}

export function formatPendingPaymentRequest(input: PendingPaymentRequestInput) {
  if (input.type !== 'PAYMENT') {
    return '-'
  }

  const advanceAmount = Number(input.advancePaymentAmount || 0)
  const arrivalAmount = Number(input.arrivalPaymentAmount || 0)
  const percent = Number(input.paymentPercent || 0)
  const percentText = formatPercent(input.paymentPercent)

  if (advanceAmount > 0 && arrivalAmount > 0) {
    return `${formatMoney(advanceAmount + arrivalAmount)} (Payment ${percentText})`
  }

  if (arrivalAmount > 0) {
    return `${formatMoney(arrivalAmount)} (Balance ${percentText})`
  }

  if (percent >= 100) {
    return `${formatMoney(advanceAmount)} (Full Payment ${percentText})`
  }

  return `${formatMoney(advanceAmount)} (Advance ${percentText})`
}
