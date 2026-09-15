export function calculatePurchaseTotal(quantity?: number, unitPrice?: number) {
  if (quantity === undefined || unitPrice === undefined) {
    return undefined
  }

  return Number((quantity * unitPrice).toFixed(2))
}

export function sumPurchaseTotals(totals: Array<number | undefined>) {
  return Number(totals.reduce<number>((sum, total) => sum + (total || 0), 0).toFixed(2))
}
