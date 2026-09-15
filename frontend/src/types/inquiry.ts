export type InquiryResult = 'PENDING' | 'WON' | 'LOST'

export interface InquiryItemPayload {
  materialCode?: string
  materialName: string
  modelSpec?: string
  manufacturer?: string
  supplierName?: string
  unit?: string
  quantity?: number
  quotedPrice?: number
  totalAmount?: number
  deliveryTime?: string
  result?: InquiryResult
  winningPrice?: number
  remark?: string
}

export interface CreateInquiryPayload {
  inquiryNo?: string
  inquiryCompany: string
  inquiryPerson?: string
  inquiryDate: string
  remark?: string
  overwrite?: boolean
  items: InquiryItemPayload[]
}

export interface InquiryListQuery {
  page: number
  pageSize: number
  sortBy?: 'companyName' | 'inquiryDate' | 'materialCode' | 'materialName' | 'modelSpec' | 'manufacturer' | 'quotedPrice' | 'supplierName' | 'result'
  sortOrder?: 'asc' | 'desc'
  search?: string
  companyName?: string
  manufacturer?: string
  supplier?: string
  deliveryTime?: string
  inquiryDate?: string
  result?: InquiryResult | ''
  year?: number
}

export interface InquiryHistoryItem {
  id: string
  inquiryId: string
  lineNo: number
  materialCode: string | null
  materialName: string
  modelSpec: string | null
  manufacturer: string | null
  supplierName: string | null
  unit: string | null
  quantity: string | null
  quotedPrice: string | null
  totalAmount: string | null
  deliveryTime: string | null
  result: InquiryResult
  winningPrice: string | null
  remark: string | null
  inquiry: {
    id: string
    inquiryNo: string | null
    inquiryCompany: string
    inquiryPerson: string | null
    inquiryDate: string
    remark: string | null
    creator: {
      id: string
      username: string
      realName: string | null
    }
  }
}

export interface InquiryListResponse {
  items: InquiryHistoryItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}
