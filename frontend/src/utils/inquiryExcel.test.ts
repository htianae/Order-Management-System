import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { buildHistoryInquiryPayloads, type ExcelRow } from './inquiryExcel'

for (const language of ['English', 'Chinese']) {
  test(`imports ${language} history headers after an XLSX round trip`, () => {
    const headers = language === 'English'
      ? ['Inquiry No.', 'Customer', 'Inquiry Date', 'Product Code', 'Product Name', 'Quantity', 'Quote Unit Price (CNY)', 'Result']
      : ['询价单号', '客户', '询价日期', '产品代码', '品名(中文)', '数量', '报价单价', '是否中标']
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      headers, ['INQ-1', 'Example Customer', '2026-09-15', 'PART-1', 'Example Item', 3, 120, language === 'English' ? 'Won' : '中标']
    ]), 'History')
    const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(reopened.Sheets.History, { header: 1 })
    const [payload] = buildHistoryInquiryPayloads(rows, 'History.xlsx')
    assert.equal(payload.inquiryCompany, 'Example Customer')
    assert.equal(payload.inquiryDate, '2026-09-15')
    assert.equal(payload.items[0].result, 'WON')
    assert.equal(payload.items[0].totalAmount, 360)
    assert.equal(payload.items[0].quotedPrice, 120)
  })
}
