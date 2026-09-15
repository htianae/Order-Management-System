import { Prisma, UserRole } from '@prisma/client'

import { getAnnualPurchaseContractRange } from './annualPurchaseContracts.js'
import {
  buildInquiryCompanyAnalysis,
  type InquiryCompanyAnalysisItem,
  type InquiryCompanySourceItem
} from './inquiryCompanyAnalysis.js'

export interface AnnualInquirySummaryFilter {
  year: number
  role: UserRole
  userId: string
}

export function buildAnnualInquirySummaryWhere(
  input: AnnualInquirySummaryFilter
): Prisma.InquiryItemWhereInput {
  const range = getAnnualPurchaseContractRange(input.year)

  return {
    inquiry: {
      inquiryDate: {
        gte: range.start,
        lt: range.end
      },
      ...(input.role === UserRole.EMPLOYEE ? { creatorId: input.userId } : {})
    }
  }
}

export function buildAnnualInquirySummary(
  items: InquiryCompanySourceItem[]
): InquiryCompanyAnalysisItem[] {
  const normalizedItems = items
    .map((item) => ({
      ...item,
      inquiry: {
        ...item.inquiry,
        inquiryCompany: item.inquiry.inquiryCompany.trim()
      }
    }))
    .filter((item) => Boolean(item.inquiry.inquiryCompany))

  return buildInquiryCompanyAnalysis(
    normalizedItems,
    'orderCount',
    'desc',
    Number.MAX_SAFE_INTEGER
  ).sort((left, right) => (
    right.orderCount - left.orderCount
    || right.wonCount - left.wonCount
    || left.companyName.localeCompare(right.companyName, 'zh-CN')
  ))
}
