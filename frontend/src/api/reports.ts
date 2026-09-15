import { http } from './http'
import type {
  AnnualInquirySummaryQuery,
  AnnualPurchaseContractCompaniesResponse,
  AnnualPurchaseContractQuery,
  BossDashboardQuery,
  BossDashboardResponse,
  BusinessAnalysisQuery,
  BusinessAnalysisResponse,
  PaymentApplicationSummaryResponse,
  PendingApprovalsQuery,
  PendingApprovalsResponse
} from '@/types/report'

export function getBossDashboardApi(params?: BossDashboardQuery) {
  return http.get<BossDashboardResponse>('/reports/boss', { params })
}

export function getBusinessAnalysisApi(params?: BusinessAnalysisQuery) {
  return http.get<BusinessAnalysisResponse>('/reports/business-analysis', { params })
}

export function getPaymentApplicationSummaryApi() {
  return http.get<PaymentApplicationSummaryResponse>('/reports/payment-applications')
}

export function getPendingApprovalsApi(params?: PendingApprovalsQuery) {
  return http.get<PendingApprovalsResponse>('/reports/pending-approvals', { params })
}

export function getAnnualPurchaseContractCompaniesApi(params: Pick<AnnualPurchaseContractQuery, 'year'>) {
  return http.get<AnnualPurchaseContractCompaniesResponse>('/reports/annual-purchase-contracts/companies', {
    params
  })
}

export function exportAnnualPurchaseContractsApi(params: Required<AnnualPurchaseContractQuery>) {
  return http.get<Blob>('/reports/annual-purchase-contracts/export', {
    params,
    responseType: 'blob'
  })
}

export function exportAnnualInquirySummaryApi(params: AnnualInquirySummaryQuery) {
  return http.get<Blob>('/reports/annual-business/inquiry-summary/export', {
    params,
    responseType: 'blob'
  })
}
