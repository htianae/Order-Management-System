export interface BossSummary {
  totalOrderCount: number
  totalWinningAmount: string
  totalProfit: string
  averageProfitRate: string
  receivedAmount: string
  recoveryRate: string
}

export interface BossDashboardQuery {
  inquiryAnalysisMonth?: string
  inquiryAnalysisSortBy?: 'orderCount' | 'wonCount' | 'winRate'
  inquiryAnalysisSortOrder?: 'asc' | 'desc'
  profitRankingSortBy?: 'winningAmount' | 'profit' | 'profitRate'
  profitRankingSortOrder?: 'asc' | 'desc'
}

export interface BusinessTrendPoint {
  label: string
  year: number
  month?: number
  orderCount: number
  winningAmount: string
  profit: string
}

export interface BusinessAnalysisQuery {
  inquiryAnalysisMonth?: string
  inquiryAnalysisSortBy?: 'orderCount' | 'wonCount' | 'winRate'
  inquiryAnalysisSortOrder?: 'asc' | 'desc'
}

export interface AnnualPurchaseContractQuery {
  year: number
  inquiryCompany?: string
}

export interface AnnualPurchaseContractCompaniesResponse {
  items: string[]
}

export interface AnnualInquirySummaryQuery {
  year: number
}

export interface EmployeeRankingItem {
  userId: string
  username: string
  realName: string | null
  orderCount: number
  winningAmount: string
  profit: string
}

export interface CompanyRankingItem {
  companyName: string
  orderCount: number
  winningAmount: string
  profit: string
}

export interface ProfitRateRankingItem {
  id: string
  orderNo: string
  inquiryCompany: string
  productNameCn: string | null
  winningAmount: string
  profit: string
  profitRate: string
}

export interface PurchaseCompanyRankingItem {
  companyName: string
  orderCount: number
  purchaseAmount: string
}

export interface InquiryCompanyAnalysisItem {
  companyName: string
  orderCount: number
  wonCount: number
  winRate: string
}

export interface ReminderOrderItem {
  id: string
  orderNo: string
  inquiryCompany: string
  productNameCn: string | null
  currentStatus: string
  createdAt: string
}

export interface PendingApprovalItem {
  id: string
  orderId: string
  orderNo: string
  inquiryCompany: string
  supplierName: string | null
  type: 'PAYMENT' | 'SHIPPING'
  submittedAt: string | null
  purchaseCost: string
  deliveryTime: string | null
  paymentPercent: string | null
  advancePaymentAmount: string
  arrivalPaymentAmount: string
  bankName: string | null
  bankAccount: string | null
  itemCount: number
  shippingApplicationFile: {
    id: string
    originalName: string
    targetId: string | null
  } | null
  groupedShipping?: boolean
  logisticsCompany?: string | null
  trackingNo?: string | null
  purchaseBatchIds?: string[]
  purchaseBatches?: Array<{
    id: string
    supplierName: string | null
    items: Array<{
      id: string
      lineNo: number
      materialCode: string | null
      materialDescription: string | null
      currentStatus: string
    }>
  }>
  items: Array<{
    id: string
    lineNo: number
    materialCode: string | null
    materialDescription: string | null
    currentStatus: string
  }>
}

export interface PendingApprovalsResponse {
  count: number
  totalCount: number
  items: PendingApprovalItem[]
}

export interface PendingApprovalsQuery {
  type?: 'PAYMENT' | 'SHIPPING'
  orderNo?: string
  submittedDate?: string
}

export interface BossDashboardResponse {
  summary: BossSummary
  trend: {
    monthly: BusinessTrendPoint[]
    yearly: BusinessTrendPoint[]
  }
  rankings: {
    employees: EmployeeRankingItem[]
    companies: CompanyRankingItem[]
    profitRates: ProfitRateRankingItem[]
    purchaseCompanies: PurchaseCompanyRankingItem[]
    inquiryCompanyAnalysis: InquiryCompanyAnalysisItem[]
  }
  reminders: {
    unfinishedOrders: ReminderOrderItem[]
    unpaidOrders: ReminderOrderItem[]
    invoicePendingOrders: ReminderOrderItem[]
  }
}

export type PaymentApplicationSummaryStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED_PARTIAL' | 'APPROVED_FULL'

export interface PaymentApplicationSummaryItem {
  id: string
  orderId: string
  orderNo: string
  inquiryCompany: string
  creatorName: string
  supplierName: string | null
  purchaseCost: string
  deliveryTime: string | null
  itemCount: number
  itemDescriptions: Array<{
    id: string
    lineNo: number
    materialCode: string | null
    materialDescription: string | null
    deliveryTime: string | null
    currentStatus: string
  }>
  status: PaymentApplicationSummaryStatus
  applicationCount: number
  pendingPercent: string
  approvedPercent: string
  remainingPercent: string
  latestPaymentPercent: string | null
  latestApplicationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  latestApplicationAt: string | null
  bankName: string | null
  bankAccount: string | null
}

export interface PaymentApplicationSummaryResponse {
  summary: {
    total: number
    notSubmitted: number
    pending: number
    approvedPartial: number
    approvedFull: number
    submitted: number
  }
  items: PaymentApplicationSummaryItem[]
}

export interface BusinessAnalysisResponse {
  rankings: {
    companies: CompanyRankingItem[]
    profitRates: ProfitRateRankingItem[]
    purchaseCompanies: PurchaseCompanyRankingItem[]
    inquiryCompanyAnalysis: InquiryCompanyAnalysisItem[]
  }
}
