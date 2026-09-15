interface ShippingBatchItemLite {
  id: string
  lineNo: number
  materialCode: string | null
  materialDescription: string | null
  currentStatus: string
}

interface PurchaseBatchLite {
  id: string
  supplierName: string | null
  batchItems?: ShippingBatchItemLite[]
}

interface OrderItemLite {
  id: string
  shippingInfo?: {
    buyerCompany?: string | null
  } | null
}

interface ItemStatusRecordLite {
  fromStatus: string | null
  toStatus: string
  createdAt: string
  orderItem: {
    id: string
  }
}

export interface ShippingApprovalFileLite {
  id: string
  category: string
  targetId: string | null
  originalName: string
}

export interface ApprovedShippingSummary {
  batchId: string
  supplierName: string | null
  buyerCompany: string | null
  purchasePackageText: string
  approvedAt: string
  file: ShippingApprovalFileLite | null
}

interface BuildApprovedShippingSummariesInput {
  inquiryCompany?: string | null
  purchaseBatches: PurchaseBatchLite[]
  orderItems: OrderItemLite[]
  itemStatusRecords: ItemStatusRecordLite[]
  files: ShippingApprovalFileLite[]
}

function getApprovalTime(records: ItemStatusRecordLite[], itemId: string) {
  return records
    .filter((record) => (
      record.orderItem.id === itemId &&
      record.fromStatus === 'ARRIVED_COMPANY' &&
      record.toStatus === 'CUSTOMER_PAID'
    ))
    .map((record) => record.createdAt)
    .sort((first, second) => new Date(first).getTime() - new Date(second).getTime())
    .at(-1) || null
}

function getPurchasePackageText(items: ShippingBatchItemLite[]) {
  return items
    .map((item) => `${item.lineNo}. ${item.materialDescription || item.materialCode || '-'}`)
    .join('；') || '-'
}

export function buildApprovedShippingSummaries(input: BuildApprovedShippingSummariesInput) {
  return input.purchaseBatches.flatMap((batch) => {
    const batchItems = batch.batchItems || []

    if (!batchItems.length) {
      return []
    }

    const approvalTimes = batchItems.map((item) => getApprovalTime(input.itemStatusRecords, item.id))

    if (approvalTimes.some((time) => !time)) {
      return []
    }

    const firstItemId = batchItems[0]?.id || ''
    const buyerCompany = input.inquiryCompany || null
    const approvedAt = approvalTimes
      .filter((time): time is string => !!time)
      .sort((first, second) => new Date(first).getTime() - new Date(second).getTime())
      .at(-1) || ''
    const file = input.files.find((currentFile) => (
      currentFile.category === 'SHIPPING_APPLICATION' &&
      currentFile.targetId === firstItemId
    )) || null

    return [{
      batchId: batch.id,
      supplierName: batch.supplierName,
      buyerCompany,
      purchasePackageText: getPurchasePackageText(batchItems),
      approvedAt,
      file
    }]
  }).sort((first, second) => new Date(first.approvedAt).getTime() - new Date(second.approvedAt).getTime())
}
