import { Prisma } from '@prisma/client'

export function calculatePaymentAmounts(purchaseCost: Prisma.Decimal, paymentPercent: number | undefined) {
  if (paymentPercent === undefined) {
    return {}
  }

  const percent = new Prisma.Decimal(paymentPercent)

  if (percent.equals(100)) {
    return {
      advancePaymentAmount: purchaseCost,
      arrivalPaymentAmount: new Prisma.Decimal(0)
    }
  }

  const currentPaymentAmount = purchaseCost.mul(percent).div(100)

  if (percent.greaterThan(50)) {
    return {
      advancePaymentAmount: new Prisma.Decimal(0),
      arrivalPaymentAmount: currentPaymentAmount
    }
  }

  return {
    advancePaymentAmount: currentPaymentAmount,
    arrivalPaymentAmount: new Prisma.Decimal(0)
  }
}

export function matchesPaymentApplicationSnapshot(
  snapshotCost: Prisma.Decimal | null,
  snapshotItemIds: unknown,
  currentCost: Prisma.Decimal,
  currentItemIds: string[]
) {
  if (snapshotCost === null && snapshotItemIds === null) {
    return true
  }

  if (snapshotCost === null || !Array.isArray(snapshotItemIds)) {
    return false
  }

  const storedItemIds = snapshotItemIds.filter((itemId): itemId is string => typeof itemId === 'string')
  if (storedItemIds.length !== snapshotItemIds.length || storedItemIds.length !== currentItemIds.length) {
    return false
  }

  const sortedStoredItemIds = [...storedItemIds].sort()
  const sortedCurrentItemIds = [...currentItemIds].sort()

  return snapshotCost.equals(currentCost)
    && sortedStoredItemIds.every((itemId, index) => itemId === sortedCurrentItemIds[index])
}
