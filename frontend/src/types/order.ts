export interface CreateOrderItemPayload {
  materialCode?: string
  materialDescription?: string
  remark?: string
  supplierRemark?: string
  manufacturer?: string
  quantity?: number
  unit?: string
  quotedPrice?: number
  taxIncludedTotal?: number
  deliveryTime?: string
  inquiryRemark?: string
  applicantDepartment?: string
}

export interface CreateOrderPayload {
  orderNo: string
  inquiryCompany: string
  declarationCompany?: string
  inquiryPerson?: string
  inquiryDate: string
  inquiryNo?: string
  productCode?: string
  productNameCn?: string
  modelSpec?: string
  quantity?: number
  items: CreateOrderItemPayload[]
}

export interface CreateOrderResponse {
  message: string
  order: {
    id: string
    orderNo: string
  }
}

export type OrderSortBy =
  | 'orderNo'
  | 'inquiryCompany'
  | 'productNameCn'
  | 'currentStatus'
  | 'creatorName'
  | 'createdAt'
  | 'deliveryReminder'

export type OrderListPageSortBy = OrderSortBy | 'deliveryTime'

export type SortOrder = 'asc' | 'desc'

export interface OrderListQuery {
  page: number
  pageSize: number
  search?: string
  orderNo?: string
  companyName?: string
  productName?: string
  productCode?: string
  modelSpec?: string
  supplier?: string
  creator?: string
  status?: string
  bidResult?: 'PENDING' | 'WON' | 'LOST' | ''
  year?: number
  amountMin?: number
  amountMax?: number
  deliveryMonth?: string
  deliveryTime?: string
  sortBy?: OrderSortBy
  sortOrder?: SortOrder
}

export interface OrderListPageQuery extends Omit<OrderListQuery, 'sortBy'> {
  sortBy?: OrderListPageSortBy
}

export interface OrderListItem {
  id: string
  orderNo: string
  inquiryCompany: string
  declarationCompany: string
  productNameCn: string | null
  currentStatus: string
  bidResult: 'PENDING' | 'WON' | 'LOST'
  historyItems?: Array<{
    id: string
    lineNo: number
    materialCode: string | null
    materialName: string | null
    manufacturer: string | null
    quantity: string | null
    quotedPrice: string | null
    totalAmount: string | null
    deliveryTime: string | null
    winningPrice: string | null
    result: 'PENDING' | 'WON' | 'LOST'
  }>
  createdAt: string
  creator: {
    id: string
    username: string
    realName: string | null
  }
}

export interface OrderListResponse {
  items: OrderListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export interface BossFileListQuery {
  page: number
  pageSize: number
  search?: string
  category?: string
}

export interface BossOrderFile extends OrderFile {
  order: {
    id: string
    orderNo: string
    inquiryCompany: string
    productNameCn: string | null
    currentStatus: string
    createdAt: string
  } | null
}

export interface BossFileListResponse {
  items: BossOrderFile[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export interface MyOrdersSummary {
  year: number
  orderCount: number
  winningAmount: string
  purchaseAmount: string
  profit?: string
}

export interface MyOrdersResponse {
  summary: MyOrdersSummary
  items: OrderListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export interface OrderDetailItem {
  id: string
  lineNo: number
  materialCode: string | null
  materialDescription: string | null
  remark: string | null
  supplierRemark: string | null
  manufacturer: string | null
  quantity: string | null
  unit: string | null
  quotedPrice: string | null
  taxIncludedTotal: string | null
  purchaseQuantity: string | null
  purchaseUnitPrice: string | null
  purchaseTotal: string | null
  deliveryTime: string | null
  inquiryRemark: string | null
  applicantDepartment: string | null
  currentStatus: string
  bidResult: string
  winningAmount: string | null
  lostReason: string | null
  purchaseBatchId: string | null
  supplierQuotes: OrderSupplierQuote[]
  purchaseInfo: OrderPurchaseInfo | null
  purchaseBatch: OrderPurchaseInfo | null
  shippingInfo: OrderShippingInfo | null
  customerPayment: OrderCustomerPayment | null
}

export interface OrderDetailFileLite {
  id: string
  originalName: string
  storagePath: string
}

export interface OrderSupplierQuote {
  id: string
  orderItemId: string | null
  contactName: string | null
  phone: string | null
  quotedPrice: string
  deliveryTime: string | null
  remark: string | null
  decision: string
  isSelected: boolean
  createdAt: string
  supplier: {
    id: string
    name: string
  }
  quoteFile: OrderDetailFileLite | null
}

export interface OrderStatusRecord {
  id: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  createdAt: string
  operator: {
    id: string
    username: string
    realName: string | null
  }
}

export interface OrderItemStatusRecord extends OrderStatusRecord {
  orderItem: {
    id: string
    lineNo: number
    materialCode: string | null
    materialDescription: string | null
  }
}

export interface OrderPurchaseInfo {
  id: string
  orderItemId?: string | null
  purchaseCost: string
  supplierName: string | null
  deliveryTime: string | null
  paymentPercent: string | null
  bankName: string | null
  bankAccount: string | null
  advancePaymentAmount: string
  advancePaymentStatus: string
  arrivalPaymentAmount: string
  arrivalPaymentStatus: string
  supplierLogisticsCompany: string | null
  supplierTrackingNo: string | null
  invoiceStatus: string
  createdAt: string
  updatedAt: string
  purchaseContractFile: OrderDetailFileLite | null
  paymentApplicationFile: OrderDetailFileLite | null
  paymentApplications?: Array<{
    id: string
    paymentPercent: string
    advancePaymentAmount: string
    arrivalPaymentAmount: string
    bankName: string | null
    bankAccount: string | null
    remark: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    createdAt: string
    approvedAt: string | null
  }>
  batchItems?: Array<{
    id: string
    lineNo: number
    materialCode: string | null
    materialDescription: string | null
    purchaseQuantity: string | null
    purchaseUnitPrice: string | null
    purchaseTotal: string | null
    currentStatus: string
  }>
}

export interface OrderShippingApplication {
  id: string
  logisticsCompany: string
  trackingNo: string
  remark: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approvedAt: string | null
  createdAt: string
  file: {
    id: string
    originalName: string
    targetId: string | null
    category: string
  }
  batches: Array<{
    purchaseInfo: OrderPurchaseInfo
  }>
}

export interface OrderShippingInfo {
  id: string
  shippingDate: string | null
  buyerCompany: string | null
  shippingAmount: string | null
  weight: string | null
  packageCount: string | null
  packageSize: string | null
  contractNo: string | null
  salesperson: string | null
  goodsName: string | null
  supplierBrand: string | null
  shippingQuantity: string | null
  expectedDeliveryDate: string | null
  needsWoodenBox: boolean | null
  woodenBoxPrice: string | null
  woodenBoxFreight: string | null
  route: string | null
  needsTransfer: boolean | null
  transferLogistics: string | null
  estimatedTransferPrice: string | null
  billingWeight: string | null
  freightEstimate: string | null
  applicant: string | null
  approver: string | null
  arrivedAtCompanyAt: string | null
  shippedToCustomerAt: string | null
  customerLogisticsCompany: string | null
  customerTrackingNo: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
}

export interface OrderCustomerPayment {
  id: string
  status: string
  paidAmount: string
  paidAt: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    username: string
    realName: string | null
  }
}

export interface OrderCustomerPaymentSummary {
  orderTotal: string
  paidAmount: string
  remainingAmount: string
  state: 'UNPAID' | 'PARTIAL' | 'PAID'
  source: 'ORDER' | 'LEGACY_ITEMS' | 'NONE'
}

export interface OrderFile {
  id: string
  category: string
  targetType: string | null
  targetId: string | null
  originalName: string
  storagePath: string
  url: string
  mimeType: string
  size: number
  createdAt: string
  uploader: {
    id: string
    username: string
    realName: string | null
  }
}

export interface OrderDetail {
  id: string
  orderNo: string
  inquiryCompany: string
  declarationCompany: string
  inquiryPerson: string | null
  inquiryDate: string
  inquiryNo: string | null
  productCode: string | null
  productNameCn: string | null
  modelSpec: string | null
  quantity: string | null
  currentStatus: string
  quotedAmount: string | null
  winningAmount: string | null
  lostReason: string | null
  purchaseCost: string
  createdAt: string
  creator: {
    id: string
    username: string
    realName: string | null
  }
  items: OrderDetailItem[]
  supplierQuotes: OrderSupplierQuote[]
  statusRecords: OrderStatusRecord[]
  itemStatusRecords: OrderItemStatusRecord[]
  purchaseInfo: OrderPurchaseInfo | null
  purchaseInfos: OrderPurchaseInfo[]
  shippingApplications: OrderShippingApplication[]
  shippingInfo: OrderShippingInfo | null
  customerPayment: OrderCustomerPayment | null
  customerPaymentSummary: OrderCustomerPaymentSummary
  files: OrderFile[]
}

export interface OrderDetailResponse {
  order: OrderDetail
}

export interface UpdateOrderStatusPayload {
  status: string
  note?: string
}

export interface UpdateOrderBasicInfoPayload {
  orderNo?: string
  inquiryCompany?: string
  declarationCompany?: string
  inquiryPerson?: string
  inquiryDate?: string
  inquiryNo?: string
  arrivedAtCompanyAt?: string | null
  productCode?: string
  productNameCn?: string
  modelSpec?: string
  quantity?: number
}

export interface UpdateOrderItemBasicInfoPayload {
  materialCode?: string
  materialDescription?: string
  remark?: string
  supplierRemark?: string
  manufacturer?: string
  quantity?: number
  unit?: string
  quotedPrice?: number
  taxIncludedTotal?: number
  deliveryTime?: string
  inquiryRemark?: string
  applicantDepartment?: string
}

export interface UpdateOrderItemStatusPayload extends UpdateOrderStatusPayload {
  winningPrice?: number
  lostReason?: string
}

export interface UpdateOrderStatusResponse {
  message: string
  order: {
    id: string
    currentStatus: string
    bidResult: string
    updatedAt: string
  }
  statusRecord: OrderStatusRecord
}

export interface UpdateOrderItemStatusResponse {
  message: string
  item: OrderDetailItem
  order: {
    id: string
    currentStatus: string
    bidResult: string
    winningAmount: string | null
    updatedAt: string
  }
  statusRecord: OrderItemStatusRecord
}

export interface UploadOrderFileResponse {
  message: string
  file: OrderFile
}

export interface UpdateQuoteInfoPayload {
  supplierName: string
  contactName?: string
  phone?: string
  quotedPrice?: number
  deliveryTime?: string
  remark?: string
  quoteFileId?: string
  isSelected: boolean
}

export interface UpdateBidInfoPayload {
  bidPrice?: number
}

export interface UpdateWinningInfoPayload {
  result: 'WON' | 'LOST'
  winningPrice?: number
  winningContractFileId?: string
  lostReason?: string
}

export interface UpdatePurchaseInfoPayload {
  purchaseCost?: number
  purchaseContractFileId?: string
  paymentApplicationFileId?: string
  supplierName?: string
  deliveryTime?: string
  paymentPercent?: number
  bankName?: string
  bankAccount?: string
  advancePaymentAmount?: number
  advancePaymentStatus?: 'PAID' | 'UNPAID'
  arrivalPaymentAmount?: number
  arrivalPaymentStatus?: 'PAID' | 'UNPAID'
  paymentRemark?: string
  supplierLogisticsCompany?: string
  supplierLogisticsNo?: string
  invoiceStatus?: 'ISSUED' | 'NOT_RECEIVED'
}

export interface PurchaseItemPricingPayload {
  itemId: string
  purchaseQuantity?: number
  purchaseUnitPrice?: number
  purchaseTotal?: number
}

export interface UpdatePurchaseItemPricingPayload {
  items: PurchaseItemPricingPayload[]
}

export interface UpdatePurchaseBatchPayload extends UpdatePurchaseInfoPayload {
  itemIds: string[]
  itemPricing?: PurchaseItemPricingPayload[]
  submitForApproval?: boolean
}

export interface UpdatePurchaseBatchBasicInfoPayload {
  purchaseCost?: number
  supplierName?: string
  deliveryTime?: string
}

export interface CreateShippingApplicationPayload {
  batchIds: string[]
  fileId: string
  logisticsCompany: string
  trackingNo: string
  remark?: string
}

export interface UpdateDeliveryInfoPayload {
  productPhotoFileId?: string
  deliveryPhotoFileId?: string
  shippingDate?: string
  buyerCompany?: string
  shippingAmount?: number
  weight?: string
  packageCount?: string
  packageSize?: string
  contractNo?: string
  salesperson?: string
  goodsName?: string
  supplierBrand?: string
  shippingQuantity?: string
  expectedDeliveryDate?: string
  needsWoodenBox?: boolean
  woodenBoxPrice?: string
  woodenBoxFreight?: string
  route?: string
  needsTransfer?: boolean
  transferLogistics?: string
  estimatedTransferPrice?: string
  billingWeight?: string
  freightEstimate?: string
  applicant?: string
  approver?: string
  buyerLogisticsCompany?: string
  buyerLogisticsNo?: string
  remark?: string
}

export interface UpdateCustomerPaymentPayload {
  customerPaymentStatus: 'PAID' | 'UNPAID'
  customerPaymentAmount?: number
  paidAt?: string
  remark?: string
}
