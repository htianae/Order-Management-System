import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInquiryCompanyAnalysis } from './inquiryCompanyAnalysis.js'

test('counts won inquiry items at the same material granularity as all inquiry items', () => {
  const analysis = buildInquiryCompanyAnalysis(
    Array.from({ length: 23 }, () => ({
      result: 'WON' as const,
      inquiry: {
        inquiryCompany: '新疆金脉国际物流有限公司'
      }
    })),
    'orderCount',
    'desc'
  )

  assert.deepEqual(analysis, [
    {
      companyName: '新疆金脉国际物流有限公司',
      orderCount: 23,
      wonCount: 23,
      winRate: '1'
    }
  ])
})

test('calculates win rate from each inquiry item result', () => {
  const analysis = buildInquiryCompanyAnalysis(
    [
      {
        result: 'WON',
        inquiry: {
          inquiryCompany: '历史客户'
        }
      },
      {
        result: 'LOST',
        inquiry: {
          inquiryCompany: '历史客户'
        }
      },
      {
        result: 'PENDING',
        inquiry: {
          inquiryCompany: '历史客户'
        }
      }
    ],
    'orderCount',
    'desc'
  )

  assert.equal(analysis[0].orderCount, 3)
  assert.equal(analysis[0].wonCount, 1)
  assert.equal(analysis[0].winRate, String(1 / 3))
})
