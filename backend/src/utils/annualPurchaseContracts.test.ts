import { BidResult, UserRole } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAnnualPurchaseContractWhere,
  getShanghaiCalendarYear,
  getAnnualPurchaseContractRange,
  parseAnnualPurchaseContractYear
} from './annualPurchaseContracts.js'

test('accepts only supported annual purchase contract years', () => {
  assert.equal(parseAnnualPurchaseContractYear('2026', 2026), 2026)
  assert.equal(parseAnnualPurchaseContractYear(2000, 2026), 2000)
  assert.equal(parseAnnualPurchaseContractYear('2027', 2026), null)
  assert.equal(parseAnnualPurchaseContractYear('1999', 2026), null)
  assert.equal(parseAnnualPurchaseContractYear('2025.5', 2026), null)
  assert.equal(parseAnnualPurchaseContractYear('', 2026), null)
  assert.equal(parseAnnualPurchaseContractYear(['2026'], 2026), null)
  assert.equal(parseAnnualPurchaseContractYear({ year: 2026 }, 2026), null)
})

test('derives the current year from the Shanghai calendar', () => {
  assert.equal(getShanghaiCalendarYear(new Date('2026-12-31T15:59:59.999Z')), 2026)
  assert.equal(getShanghaiCalendarYear(new Date('2026-12-31T16:00:00.000Z')), 2027)
})

test('uses Shanghai calendar boundaries from January 1 through December 25', () => {
  assert.deepEqual(getAnnualPurchaseContractRange(2026), {
    start: new Date('2025-12-31T16:00:00.000Z'),
    end: new Date('2026-12-25T16:00:00.000Z')
  })
})

test('forces employee queries to the authenticated creator', () => {
  const where = buildAnnualPurchaseContractWhere({
    year: 2026,
    role: UserRole.EMPLOYEE,
    userId: 'employee-1',
    inquiryCompany: '测试公司'
  })

  assert.equal(where.creatorId, 'employee-1')
  assert.equal(where.inquiryCompany, '测试公司')
  assert.equal(where.bidResult, BidResult.WON)
  assert.deepEqual(where.createdAt, {
    gte: new Date('2025-12-31T16:00:00.000Z'),
    lt: new Date('2026-12-25T16:00:00.000Z')
  })
  assert.deepEqual(where.items, {
    some: {
      OR: [
        { purchaseInfo: { isNot: null } },
        { purchaseBatchId: { not: null } }
      ]
    }
  })
})

test('does not restrict boss or admin queries to one creator', () => {
  const bossWhere = buildAnnualPurchaseContractWhere({
    year: 2026,
    role: UserRole.BOSS,
    userId: 'boss-1'
  })
  const adminWhere = buildAnnualPurchaseContractWhere({
    year: 2026,
    role: UserRole.ADMIN,
    userId: 'admin-1'
  })

  assert.equal(bossWhere.creatorId, undefined)
  assert.equal(adminWhere.creatorId, undefined)
  assert.equal(bossWhere.inquiryCompany, undefined)
})
