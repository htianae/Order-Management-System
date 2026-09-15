export type InquiryAnalysisSortBy = 'orderCount' | 'wonCount' | 'winRate'
export type SortOrder = 'asc' | 'desc'

export interface InquiryCompanySourceItem {
  result: 'PENDING' | 'WON' | 'LOST'
  inquiry: {
    inquiryCompany: string
  }
}

export interface InquiryCompanyAnalysisItem {
  companyName: string
  orderCount: number
  wonCount: number
  winRate: string
}

export function compareInquiryAnalysis(
  left: { orderCount: number; wonCount: number; winRate: string },
  right: { orderCount: number; wonCount: number; winRate: string },
  sortBy: string,
  sortOrder: SortOrder
) {
  const direction = sortOrder === 'asc' ? 1 : -1
  const leftValue = sortBy === 'winRate' ? Number(left.winRate) : left[sortBy as 'orderCount' | 'wonCount']
  const rightValue = sortBy === 'winRate' ? Number(right.winRate) : right[sortBy as 'orderCount' | 'wonCount']
  const primaryCompare = (leftValue - rightValue) * direction

  if (primaryCompare !== 0) {
    return primaryCompare
  }

  if (right.orderCount !== left.orderCount) {
    return right.orderCount - left.orderCount
  }

  if (right.wonCount !== left.wonCount) {
    return right.wonCount - left.wonCount
  }

  return Number(right.winRate) - Number(left.winRate)
}

export function buildInquiryCompanyAnalysis(
  inquiryItems: InquiryCompanySourceItem[],
  sortBy: InquiryAnalysisSortBy,
  sortOrder: SortOrder,
  limit = 50
): InquiryCompanyAnalysisItem[] {
  const analysisMap = new Map<string, InquiryCompanyAnalysisItem>()

  inquiryItems.forEach((item) => {
    const key = item.inquiry.inquiryCompany
    const existing = analysisMap.get(key) || {
      companyName: key,
      orderCount: 0,
      wonCount: 0,
      winRate: '0'
    }

    existing.orderCount += 1
    if (item.result === 'WON') {
      existing.wonCount += 1
    }
    analysisMap.set(key, existing)
  })

  return Array.from(analysisMap.values())
    .map((item) => ({
      ...item,
      winRate: item.orderCount ? (item.wonCount / item.orderCount).toString() : '0'
    }))
    .sort((left, right) => compareInquiryAnalysis(left, right, sortBy, sortOrder))
    .slice(0, limit)
}
