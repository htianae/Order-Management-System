import { BidResult, Prisma } from '@prisma/client'

export function getItemWinningAmount(
  bidResult: BidResult,
  taxIncludedTotal: Prisma.Decimal | number | string | null | undefined
) {
  if (bidResult !== BidResult.WON || taxIncludedTotal === null || taxIncludedTotal === undefined) {
    return null
  }

  return taxIncludedTotal instanceof Prisma.Decimal
    ? taxIncludedTotal
    : new Prisma.Decimal(taxIncludedTotal)
}

export function getItemWinningAmountUpdateData(
  bidResult: BidResult,
  existingTaxIncludedTotal: Prisma.Decimal | null,
  taxIncludedTotal: Prisma.Decimal | number | string | null | undefined
) {
  const nextTaxIncludedTotal = taxIncludedTotal === undefined
    ? existingTaxIncludedTotal
    : taxIncludedTotal === null
      ? null
      : new Prisma.Decimal(taxIncludedTotal)

  return {
    taxIncludedTotal: nextTaxIncludedTotal,
    winningAmount: getItemWinningAmount(bidResult, nextTaxIncludedTotal)
  }
}
