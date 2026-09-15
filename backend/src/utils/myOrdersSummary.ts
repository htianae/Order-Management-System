interface StringableAmount {
  toString(): string
}

interface MyOrdersYearlySums {
  winningAmount: StringableAmount | null | undefined
  purchaseCost: StringableAmount | null | undefined
}

export function buildMyOrdersSummary(year: number, orderCount: number, sums: MyOrdersYearlySums) {
  return {
    year,
    orderCount,
    winningAmount: sums.winningAmount?.toString() || '0',
    purchaseAmount: sums.purchaseCost?.toString() || '0'
  }
}
