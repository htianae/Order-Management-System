import { http } from './http'
import type { CreateInquiryPayload, InquiryListQuery, InquiryListResponse } from '@/types/inquiry'

export function getInquiriesApi(params: InquiryListQuery) {
  return http.get<InquiryListResponse>('/inquiries', { params })
}

export function createInquiryApi(payload: CreateInquiryPayload) {
  return http.post<{ message: string; inquiry: { id: string; inquiryCompany: string } }>('/inquiries', payload)
}

export function bulkCreateInquiriesApi(payload: { inquiries: CreateInquiryPayload[] }) {
  return http.post<{ message: string; inquiryCount: number; itemCount: number }>('/inquiries/bulk', payload)
}

export function deleteInquiryApi(id: string) {
  return http.delete<{ message: string; inquiry: { id: string; inquiryCompany: string } }>(`/inquiries/${id}`)
}
