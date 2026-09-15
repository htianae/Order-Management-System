import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAnnualPurchaseContractFilename,
  getShanghaiCalendarYear
} from './annualPurchaseContractDownload.js'

test('reads a UTF-8 annual purchase contract filename from content disposition', () => {
  const header = "attachment; filename*=UTF-8''2026-%E6%B5%8B%E8%AF%95%E5%85%AC%E5%8F%B8-%E5%B9%B4%E5%BA%A6.xlsx"

  assert.equal(
    getAnnualPurchaseContractFilename(header, 'fallback.xlsx'),
    '2026-测试公司-年度.xlsx'
  )
})

test('falls back when content disposition is absent or invalid', () => {
  assert.equal(getAnnualPurchaseContractFilename(undefined, 'fallback.xlsx'), 'fallback.xlsx')
  assert.equal(getAnnualPurchaseContractFilename("filename*=UTF-8''%E0%A4%A", 'fallback.xlsx'), 'fallback.xlsx')
})

test('uses the Shanghai calendar for the default year', () => {
  assert.equal(getShanghaiCalendarYear(new Date('2026-12-31T15:59:59.999Z')), 2026)
  assert.equal(getShanghaiCalendarYear(new Date('2026-12-31T16:00:00.000Z')), 2027)
})
