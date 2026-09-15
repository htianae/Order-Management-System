export interface PendingApprovalSearchItem {
  type: 'PAYMENT' | 'SHIPPING'
  orderNo: string
  submittedAt: Date | string | null
}

export interface PendingApprovalSearchQuery {
  type?: unknown
  orderNo?: unknown
  submittedDate?: unknown
}

export interface MergePendingApprovalItem extends PendingApprovalSearchItem {
  id: string
  purchaseBatchIds?: string[]
}

export function mergePendingApprovalItems<
  TLegacy extends MergePendingApprovalItem,
  TGrouped extends MergePendingApprovalItem
>(legacyItems: TLegacy[], groupedItems: TGrouped[]): Array<TLegacy | TGrouped> {
  const groupedBatchIds = new Set(groupedItems.flatMap((item) => item.purchaseBatchIds || []))
  const remainingLegacyItems = legacyItems.filter((item) => (
    item.type !== 'SHIPPING' || !groupedBatchIds.has(item.id)
  ))

  return [...groupedItems, ...remainingLegacyItems]
}

export function getPendingApprovalUnitCount(items: MergePendingApprovalItem[]) {
  return items.reduce((total, item) => {
    if (item.type === 'SHIPPING' && item.purchaseBatchIds?.length) {
      return total + item.purchaseBatchIds.length
    }

    return total + 1
  }, 0)
}

export interface SubmittedDateRange {
  start: Date
  end: Date
}

export interface PendingPaymentValues {
  paymentPercent: string | null
  advancePaymentAmount: string
  arrivalPaymentAmount: string
  bankName: string | null
  bankAccount: string | null
}

export function resolveLegacyShippingValues(
  type: 'PAYMENT' | 'SHIPPING',
  logisticsCompany: string | null | undefined,
  trackingNo: string | null | undefined
) {
  return type === 'SHIPPING'
    ? {
        logisticsCompany: logisticsCompany || null,
        trackingNo: trackingNo || null
      }
    : {
        logisticsCompany: null,
        trackingNo: null
      }
}

export function resolvePendingPaymentValues(
  pendingApplication: PendingPaymentValues | null | undefined
) {
  return pendingApplication || null
}

export function getPendingApprovalSubmittedAt(
  type: 'PAYMENT' | 'SHIPPING',
  paymentSubmittedAt: Date | null | undefined,
  shippingSubmittedAts: Date[]
): Date | null {
  if (type === 'PAYMENT') {
    return paymentSubmittedAt || null
  }

  return shippingSubmittedAts.reduce<Date | null>((latest, current) => {
    return !latest || current > latest ? current : latest
  }, null)
}

export function parseSubmittedDateRange(value: unknown): SubmittedDateRange | null {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    return null
  }

  const start = new Date(`${text}T00:00:00+08:00`)
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000)
  }
}

export function parsePendingApprovalType(
  value: unknown
): 'PAYMENT' | 'SHIPPING' | null | undefined {
  if (value === undefined) {
    return undefined
  }

  return value === 'PAYMENT' || value === 'SHIPPING' ? value : null
}

export function filterPendingApprovalItems<T extends PendingApprovalSearchItem>(
  items: T[],
  query: PendingApprovalSearchQuery
): T[] {
  const type = parsePendingApprovalType(query.type)
  const orderNo = typeof query.orderNo === 'string' ? query.orderNo.trim().toLocaleLowerCase() : ''
  const submittedDate = typeof query.submittedDate === 'string' ? query.submittedDate.trim() : ''
  const submittedRange = submittedDate ? parseSubmittedDateRange(submittedDate) : null

  if (type === null || (submittedDate && !submittedRange)) {
    return []
  }

  return items.filter((item) => {
    if (type && item.type !== type) {
      return false
    }

    if (orderNo && !item.orderNo.toLocaleLowerCase().includes(orderNo)) {
      return false
    }

    if (!submittedRange) {
      return true
    }

    if (!item.submittedAt) {
      return false
    }

    const submittedAt = item.submittedAt instanceof Date ? item.submittedAt : new Date(item.submittedAt)
    return !Number.isNaN(submittedAt.getTime())
      && submittedAt >= submittedRange.start
      && submittedAt < submittedRange.end
  })
}
