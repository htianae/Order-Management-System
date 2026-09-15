import ExcelJS from 'exceljs'

import type { InquiryCompanyAnalysisItem } from './inquiryCompanyAnalysis.js'

export function buildAnnualInquirySummaryWorkbook(items: InquiryCompanyAnalysisItem[]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Annual Inquiry Summary')

  sheet.columns = [
    { header: 'Customer', key: 'companyName', width: 36 },
    { header: 'Inquiry Lines', key: 'orderCount', width: 14 },
    { header: 'Won Lines', key: 'wonCount', width: 14 },
    { header: 'Win Rate', key: 'winRate', width: 14 }
  ]

  items.forEach((item) => {
    sheet.addRow({
      companyName: item.companyName,
      orderCount: item.orderCount,
      wonCount: item.wonCount,
      winRate: Number(item.winRate)
    })
  })

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 24

  sheet.getColumn(4).numFmt = '0.00%'
  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      horizontal: rowNumber === 1 ? 'center' : 'left',
      vertical: 'middle',
      wrapText: true
    }
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9E2F2' } },
        left: { style: 'thin', color: { argb: 'FFD9E2F2' } },
        bottom: { style: 'thin', color: { argb: 'FFD9E2F2' } },
        right: { style: 'thin', color: { argb: 'FFD9E2F2' } }
      }
    })
  })

  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: `D${Math.max(sheet.rowCount, 1)}` }

  return workbook
}
