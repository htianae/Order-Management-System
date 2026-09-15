export interface PaymentApplicationAmountLite {
  status: string
  id?: string
  paymentPercent?: string | number | null
  advancePaymentAmount?: string | number | null
  arrivalPaymentAmount?: string | number | null
  bankName?: string | null
  bankAccount?: string | null
  remark?: string | null
  createdAt?: string | null
  approvedAt?: string | null
}

export interface PaymentApplicationBatchLite {
  id?: string
  supplierName?: string | null
  purchaseCost?: string | number | null
  paymentApplications?: PaymentApplicationAmountLite[]
}

export interface SupplierPaymentItemLite {
  currentStatus: string
  purchaseBatchId?: string | null
}

export interface ApprovedPaymentApplicationRecord extends PaymentApplicationAmountLite {
  id: string
  batchId: string | null
  supplierName: string | null
  purchaseCost: string | number | null
  totalAmount: number
  legacyFullSplitAmount?: boolean
}

export interface CompletedPaymentSummary {
  batchId: string | null
  supplierName: string | null
  purchaseCost: string | number | null
  advancePaymentAmount: number | null
  advancePaymentTime: string | null
  arrivalPaymentAmount: number | null
  arrivalPaymentTime: string | null
  totalAmount: number
  remarks: string[]
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function isPaymentPercentWithinRemaining(requestedPercent: number, remainingPercent: number) {
  return Math.round(requestedPercent * 100) <= Math.round(remainingPercent * 100)
}

export function calculatePaymentApplicationAmounts(purchaseCost: string | number | null | undefined, paymentPercent: string | number | null | undefined) {
  const cost = toNumber(purchaseCost)
  const percent = toNumber(paymentPercent)

  if (!percent) {
    return {
      advancePaymentAmount: 0,
      arrivalPaymentAmount: 0
    }
  }

  if (percent === 100) {
    return {
      advancePaymentAmount: roundMoney(cost),
      arrivalPaymentAmount: 0
    }
  }

  const currentAmount = roundMoney(cost * percent / 100)

  if (percent > 50) {
    return {
      advancePaymentAmount: 0,
      arrivalPaymentAmount: currentAmount
    }
  }

  return {
    advancePaymentAmount: currentAmount,
    arrivalPaymentAmount: 0
  }
}

export function sumApprovedAdvancePaymentAmount(batches: PaymentApplicationBatchLite[]) {
  return roundMoney(batches.reduce((batchTotal, batch) => {
    const approvedAdvance = (batch.paymentApplications || [])
      .filter((application) => application.status === 'APPROVED')
      .reduce((applicationTotal, application) => applicationTotal + toNumber(application.advancePaymentAmount), 0)

    return batchTotal + approvedAdvance
  }, 0))
}

function getRecordTime(value: PaymentApplicationAmountLite) {
  const time = new Date(value.approvedAt || value.createdAt || '').getTime()
  return Number.isNaN(time) ? 0 : time
}

function normalizeLegacyFullSplitAmount(batch: PaymentApplicationBatchLite, application: PaymentApplicationAmountLite) {
  const purchaseCost = toNumber(batch.purchaseCost)
  const paymentPercent = toNumber(application.paymentPercent)
  const advancePaymentAmount = toNumber(application.advancePaymentAmount)
  const arrivalPaymentAmount = toNumber(application.arrivalPaymentAmount)
  const storedTotal = roundMoney(advancePaymentAmount + arrivalPaymentAmount)

  if (
    purchaseCost > 0 &&
    paymentPercent > 0 &&
    paymentPercent < 100 &&
    advancePaymentAmount > 0 &&
    arrivalPaymentAmount > 0 &&
    Math.abs(storedTotal - purchaseCost) < 0.01
  ) {
    return {
      ...calculatePaymentApplicationAmounts(purchaseCost, paymentPercent),
      legacyFullSplitAmount: true
    }
  }

  return {
    advancePaymentAmount,
    arrivalPaymentAmount,
    legacyFullSplitAmount: false
  }
}

export function collectApprovedPaymentApplications(batches: PaymentApplicationBatchLite[]) {
  return batches
    .flatMap((batch) => (batch.paymentApplications || [])
      .filter((application) => application.status === 'APPROVED')
      .map((application) => {
        const normalizedAmounts = normalizeLegacyFullSplitAmount(batch, application)

        return {
          ...application,
          ...normalizedAmounts,
          id: application.id || `${batch.id || 'batch'}-${application.createdAt || application.approvedAt || 'payment'}`,
          batchId: batch.id || null,
          supplierName: batch.supplierName || null,
          purchaseCost: batch.purchaseCost ?? null,
          totalAmount: roundMoney(normalizedAmounts.advancePaymentAmount + normalizedAmounts.arrivalPaymentAmount)
        } satisfies ApprovedPaymentApplicationRecord
      }))
    .sort((first, second) => getRecordTime(first) - getRecordTime(second))
}

function recordPaymentTime(record: ApprovedPaymentApplicationRecord) {
  return record.approvedAt || record.createdAt || null
}

function mergePaymentPart(
  currentAmount: number | null,
  currentTime: string | null,
  record: ApprovedPaymentApplicationRecord,
  amount: number
) {
  const nextAmount = roundMoney((currentAmount || 0) + amount)
  const nextTime = recordPaymentTime(record)

  return {
    amount: nextAmount,
    time: nextTime || currentTime
  }
}

export function collectCompletedPaymentSummaries(batches: PaymentApplicationBatchLite[]) {
  const grouped = new Map<string, {
    summary: CompletedPaymentSummary
    legacyTimes: string[]
  }>()

  collectApprovedPaymentApplications(batches).forEach((record) => {
    const key = record.batchId || record.id
    const group = grouped.get(key) || {
      summary: {
        batchId: record.batchId,
        supplierName: record.supplierName,
        purchaseCost: record.purchaseCost,
        advancePaymentAmount: null,
        advancePaymentTime: null,
        arrivalPaymentAmount: null,
        arrivalPaymentTime: null,
        totalAmount: 0,
        remarks: []
      },
      legacyTimes: []
    }
    const { summary } = group

    const advancePaymentAmount = toNumber(record.advancePaymentAmount)
    const arrivalPaymentAmount = toNumber(record.arrivalPaymentAmount)

    if (record.legacyFullSplitAmount) {
      const legacyTime = recordPaymentTime(record)

      if (legacyTime) {
        group.legacyTimes.push(legacyTime)
      }
    }

    if (advancePaymentAmount > 0) {
      const merged = mergePaymentPart(summary.advancePaymentAmount, summary.advancePaymentTime, record, advancePaymentAmount)
      summary.advancePaymentAmount = merged.amount
      summary.advancePaymentTime = merged.time
    }

    if (arrivalPaymentAmount > 0) {
      const merged = mergePaymentPart(summary.arrivalPaymentAmount, summary.arrivalPaymentTime, record, arrivalPaymentAmount)
      summary.arrivalPaymentAmount = merged.amount
      summary.arrivalPaymentTime = merged.time
    }

    if (record.remark && !summary.remarks.includes(record.remark)) {
      summary.remarks.push(record.remark)
    }

    summary.totalAmount = roundMoney((summary.advancePaymentAmount || 0) + (summary.arrivalPaymentAmount || 0))
    grouped.set(key, group)
  })

  return Array.from(grouped.values()).map(({ summary, legacyTimes }) => {
    if (legacyTimes.length >= 2 && summary.advancePaymentAmount && summary.arrivalPaymentAmount) {
      const sortedTimes = legacyTimes.sort((first, second) => {
        const firstTime = new Date(first).getTime()
        const secondTime = new Date(second).getTime()

        return (Number.isNaN(firstTime) ? 0 : firstTime) - (Number.isNaN(secondTime) ? 0 : secondTime)
      })

      summary.advancePaymentTime = sortedTimes[0] || summary.advancePaymentTime
      summary.arrivalPaymentTime = sortedTimes[sortedTimes.length - 1] || summary.arrivalPaymentTime
    }

    return summary
  }).sort((first, second) => {
    const firstTime = new Date(first.advancePaymentTime || first.arrivalPaymentTime || '').getTime()
    const secondTime = new Date(second.advancePaymentTime || second.arrivalPaymentTime || '').getTime()

    return (Number.isNaN(firstTime) ? 0 : firstTime) - (Number.isNaN(secondTime) ? 0 : secondTime)
  })
}

const supplierPaymentRelevantStatuses = new Set([
  'BID_WON',
  'PURCHASING',
  'PURCHASE_PAYMENT',
  'SHIPPED_TO_CUSTOMER',
  'ARRIVED_COMPANY',
  'CUSTOMER_PAID',
  'COMPLETED'
])

export function isSupplierPaymentCompletionAccurate(
  items: SupplierPaymentItemLite[],
  batches: PaymentApplicationBatchLite[]
) {
  if (!batches.length) {
    return false
  }

  const batchIds = new Set(batches.map((batch) => batch.id).filter(Boolean))
  const hasUnbatchedPurchasedItem = items.some((item) =>
    supplierPaymentRelevantStatuses.has(item.currentStatus)
    && (!item.purchaseBatchId || !batchIds.has(item.purchaseBatchId))
  )

  if (hasUnbatchedPurchasedItem) {
    return false
  }

  const completedByBatchId = new Map(
    collectCompletedPaymentSummaries(batches).map((summary) => [summary.batchId, summary])
  )

  return batches.every((batch) => {
    const approvedPercent = (batch.paymentApplications || [])
      .filter((application) => application.status === 'APPROVED')
      .reduce((total, application) => total + toNumber(application.paymentPercent), 0)
    const paidAmount = completedByBatchId.get(batch.id || null)?.totalAmount || 0
    const purchaseCost = toNumber(batch.purchaseCost)

    return approvedPercent >= 100 && Math.abs(roundMoney(paidAmount - purchaseCost)) < 0.01
  })
}
