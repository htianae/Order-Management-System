import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAnnualInquirySummaryWorkbook } from './annualInquirySummaryWorkbook.js'

test('builds the annual inquiry summary workbook with numeric percentage values', () => {
  const workbook = buildAnnualInquirySummaryWorkbook([
    {
      companyName: '乙公司',
      orderCount: 8,
      wonCount: 6,
      winRate: '0.75'
    },
    {
      companyName: '甲公司',
      orderCount: 3,
      wonCount: 1,
      winRate: '0.3333333333333333'
    }
  ])
  const sheet = workbook.getWorksheet('Annual Inquiry Summary')!

  const headerValues = sheet.getRow(1).values
  const firstDataRowValues = sheet.getRow(2).values
  const secondDataRowValues = sheet.getRow(3).values

  assert.ok(Array.isArray(headerValues))
  assert.ok(Array.isArray(firstDataRowValues))
  assert.ok(Array.isArray(secondDataRowValues))
  assert.deepEqual(headerValues.slice(1), [
    'Customer',
    'Inquiry Lines',
    'Won Lines',
    'Win Rate'
  ])
  assert.deepEqual(firstDataRowValues.slice(1), ['乙公司', 8, 6, 0.75])
  assert.deepEqual(secondDataRowValues.slice(1), ['甲公司', 3, 1, 1 / 3])
  assert.equal(sheet.getCell('D2').numFmt, '0.00%')
  assert.equal(sheet.getCell('D3').numFmt, '0.00%')
  assert.equal(sheet.getRow(1).font.bold, true)
  assert.deepEqual(sheet.views, [{ state: 'frozen', ySplit: 1 }])
  assert.deepEqual(sheet.autoFilter, { from: 'A1', to: 'D3' })
})

test('keeps an empty workbook structurally usable', () => {
  const workbook = buildAnnualInquirySummaryWorkbook([])
  const sheet = workbook.getWorksheet('Annual Inquiry Summary')!

  assert.equal(sheet.rowCount, 1)
  assert.deepEqual(sheet.autoFilter, { from: 'A1', to: 'D1' })
})
