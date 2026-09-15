interface DecimalLike {
  toString(): string
}

export interface BusinessTrendSourceOrder {
  inquiryDate: Date
  winningAmount: DecimalLike | null
  profit: DecimalLike | null
}

export interface MonthlyBusinessTrendPoint {
  label: string
  year: number
  month: number
  orderCount: number
  winningAmount: string
  profit: string
}

export interface YearlyBusinessTrendPoint {
  label: string
  year: number
  orderCount: number
  winningAmount: string
  profit: string
}

function toNumber(value: DecimalLike | null | undefined) {
  const parsed = Number(value?.toString() || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toMoneyString(value: number) {
  return (Math.round(value * 100) / 100).toString()
}

export function buildBusinessTrend(orders: BusinessTrendSourceOrder[], currentYear = new Date().getFullYear()) {
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]!,
    year: currentYear,
    month: index + 1,
    orderCount: 0,
    winningAmountValue: 0,
    profitValue: 0
  }))
  const yearlyMap = new Map<number, {
    label: string
    year: number
    orderCount: number
    winningAmountValue: number
    profitValue: number
  }>()

  orders.forEach((order) => {
    const year = order.inquiryDate.getUTCFullYear()
    const month = order.inquiryDate.getUTCMonth() + 1
    const winningAmount = toNumber(order.winningAmount)
    const profit = toNumber(order.profit)
    const yearly = yearlyMap.get(year) || {
      label: String(year),
      year,
      orderCount: 0,
      winningAmountValue: 0,
      profitValue: 0
    }

    yearly.orderCount += 1
    yearly.winningAmountValue += winningAmount
    yearly.profitValue += profit
    yearlyMap.set(year, yearly)

    if (year === currentYear) {
      const monthlyPoint = monthly[month - 1]
      monthlyPoint.orderCount += 1
      monthlyPoint.winningAmountValue += winningAmount
      monthlyPoint.profitValue += profit
    }
  })

  if (!yearlyMap.has(currentYear)) {
    yearlyMap.set(currentYear, {
      label: String(currentYear),
      year: currentYear,
      orderCount: 0,
      winningAmountValue: 0,
      profitValue: 0
    })
  }

  return {
    monthly: monthly.map((point) => ({
      label: point.label,
      year: point.year,
      month: point.month,
      orderCount: point.orderCount,
      winningAmount: toMoneyString(point.winningAmountValue),
      profit: toMoneyString(point.profitValue)
    })),
    yearly: Array.from(yearlyMap.values())
      .sort((left, right) => left.year - right.year)
      .map((point) => ({
        label: point.label,
        year: point.year,
        orderCount: point.orderCount,
        winningAmount: toMoneyString(point.winningAmountValue),
        profit: toMoneyString(point.profitValue)
      }))
  }
}
