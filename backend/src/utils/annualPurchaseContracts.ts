import { BidResult, Prisma, UserRole } from '@prisma/client'

export interface AnnualPurchaseContractFilter {
  year: number
  role: UserRole
  userId: string
  inquiryCompany?: string
}

export function getShanghaiCalendarYear(value = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'Asia/Shanghai'
  }).format(value))
}

export function parseAnnualPurchaseContractYear(
  value: unknown,
  currentYear = getShanghaiCalendarYear()
): number | null {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const normalized = typeof value === 'string' ? value.trim() : value
  if (typeof normalized !== 'number' && (typeof normalized !== 'string' || !/^\d{4}$/.test(normalized))) {
    return null
  }

  const year = typeof normalized === 'number' ? normalized : Number(normalized)
  return Number.isInteger(year) && year >= 2000 && year <= currentYear ? year : null
}

export function getAnnualPurchaseContractRange(year: number) {
  return {
    start: new Date(Date.UTC(year - 1, 11, 31, 16)),
    end: new Date(Date.UTC(year, 11, 25, 16))
  }
}

export function buildAnnualPurchaseContractWhere(
  input: AnnualPurchaseContractFilter
): Prisma.OrderWhereInput {
  const range = getAnnualPurchaseContractRange(input.year)

  return {
    createdAt: {
      gte: range.start,
      lt: range.end
    },
    bidResult: BidResult.WON,
    ...(input.inquiryCompany ? { inquiryCompany: input.inquiryCompany } : {}),
    ...(input.role === UserRole.EMPLOYEE ? { creatorId: input.userId } : {}),
    items: {
      some: {
        OR: [
          { purchaseInfo: { isNot: null } },
          { purchaseBatchId: { not: null } }
        ]
      }
    }
  }
}
