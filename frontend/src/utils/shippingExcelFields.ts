export interface ShippingExcelFields {
  logisticsCompany: string
  trackingNo: string
}

function normalizeLabel(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[:：]+$/g, '')
    .toLowerCase()
}

function readValueAfterLabel(rows: unknown[][], expectedLabels: string[]) {
  for (const row of rows) {
    const labelIndex = row.findIndex((cell) => expectedLabels.some((label) => normalizeLabel(cell) === normalizeLabel(label)))

    if (labelIndex < 0) {
      continue
    }

    const value = row
      .slice(labelIndex + 1)
      .map((cell) => String(cell ?? '').trim())
      .find(Boolean)

    if (value) {
      return value
    }
  }

  return ''
}

export function extractShippingExcelFields(rows: unknown[][]): ShippingExcelFields {
  return {
    logisticsCompany: readValueAfterLabel(rows, ['Carrier', 'Logistics Company', '物流/快递公司']),
    trackingNo: readValueAfterLabel(rows, ['Tracking No.', 'Tracking Number', '运单号'])
  }
}
