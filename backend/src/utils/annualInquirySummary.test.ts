import { UserRole } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAnnualInquirySummary,
  buildAnnualInquirySummaryWhere
} from './annualInquirySummary.js'

test('uses the Shanghai range through December 25 and scopes employees to their own inquiries', () => {
  const where = buildAnnualInquirySummaryWhere({
    year: 2026,
    role: UserRole.EMPLOYEE,
    userId: 'employee-1'
  })

  assert.deepEqual(where, {
    inquiry: {
      inquiryDate: {
        gte: new Date('2025-12-31T16:00:00.000Z'),
        lt: new Date('2026-12-25T16:00:00.000Z')
      },
      creatorId: 'employee-1'
    }
  })
})

test('does not restrict boss or admin inquiry summaries to one creator', () => {
  for (const role of [UserRole.BOSS, UserRole.ADMIN]) {
    const where = buildAnnualInquirySummaryWhere({
      year: 2026,
      role,
      userId: 'manager-1'
    })

    assert.equal('creatorId' in (where.inquiry as Record<string, unknown>), false)
  }
})

test('counts inquiry items, won items and win rates for every company', () => {
  const summary = buildAnnualInquirySummary([
    { result: 'WON', inquiry: { inquiryCompany: '甲公司' } },
    { result: 'LOST', inquiry: { inquiryCompany: '甲公司' } },
    { result: 'WON', inquiry: { inquiryCompany: '乙公司' } },
    { result: 'WON', inquiry: { inquiryCompany: '乙公司' } },
    { result: 'PENDING', inquiry: { inquiryCompany: '丁公司' } },
    { result: 'LOST', inquiry: { inquiryCompany: '丙公司' } }
  ])

  assert.deepEqual(summary, [
    { companyName: '乙公司', orderCount: 2, wonCount: 2, winRate: '1' },
    { companyName: '甲公司', orderCount: 2, wonCount: 1, winRate: '0.5' },
    { companyName: '丙公司', orderCount: 1, wonCount: 0, winRate: '0' },
    { companyName: '丁公司', orderCount: 1, wonCount: 0, winRate: '0' }
  ])
})

test('does not truncate the annual company list at the dashboard limit', () => {
  const items = Array.from({ length: 75 }, (_, index) => ({
    result: 'PENDING' as const,
    inquiry: { inquiryCompany: `公司-${String(index).padStart(2, '0')}` }
  }))

  assert.equal(buildAnnualInquirySummary(items).length, 75)
})

test('merges company names that differ only by surrounding whitespace', () => {
  const summary = buildAnnualInquirySummary([
    { result: 'WON', inquiry: { inquiryCompany: ' 测试公司' } },
    { result: 'LOST', inquiry: { inquiryCompany: '测试公司 ' } },
    { result: 'PENDING', inquiry: { inquiryCompany: '   ' } }
  ])

  assert.deepEqual(summary, [
    { companyName: '测试公司', orderCount: 2, wonCount: 1, winRate: '0.5' }
  ])
})
