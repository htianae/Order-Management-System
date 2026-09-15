function cleanFieldCell(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeFieldLabel(value: unknown) {
  return cleanFieldCell(value).replace(/\s+/g, '').replace(/[/:：()（）]/g, '').toLowerCase()
}

export const ORDER_INQUIRY_COMPANY_LABELS = [
  'Customer',
  'Customer Name',
  'Inquiry Company',
  '需求公司名称',
  '需求公司',
  '需求单位',
  '公司名称',
  '询价公司'
]

export function findFirstValueBelowHeader<T>(rows: T[][], headerIndex: number, labels: string[]): T | '' {
  if (headerIndex < 0 || headerIndex >= rows.length) {
    return ''
  }

  const normalizedLabels = new Set(labels.map(normalizeFieldLabel))
  const columnIndex = rows[headerIndex].findIndex((cell) => normalizedLabels.has(normalizeFieldLabel(cell)))

  if (columnIndex === -1) {
    return ''
  }

  for (const row of rows.slice(headerIndex + 1)) {
    const value = row[columnIndex]

    if (cleanFieldCell(value)) {
      return value
    }
  }

  return ''
}

export function findOrderInquiryCompanyBelowHeader<T>(rows: T[][], headerIndex: number): T | '' {
  return findFirstValueBelowHeader(rows, headerIndex, ORDER_INQUIRY_COMPANY_LABELS)
}

export function findOrderNumberFromRows<T>(rows: T[][], headerIndex: number) {
  if (headerIndex <= 0) {
    return ''
  }

  for (const row of rows.slice(0, headerIndex)) {
    for (const cell of row) {
      const match = cleanFieldCell(cell).match(/\bXBJ\d+\b/i)
      if (match) {
        return match[0].toUpperCase()
      }
    }
  }

  return ''
}
