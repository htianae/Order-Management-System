import * as XLSX from 'xlsx'

import type { CreateInquiryPayload, InquiryItemPayload, InquiryResult } from '@/types/inquiry'

export type ExcelCell = string | number | boolean | Date | null | undefined
export type ExcelRow = ExcelCell[]

const DEFAULT_DATE = '2000-01-01'

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function cleanCell(value: ExcelCell) {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return formatDate(value)
  }

  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value: ExcelCell) {
  return cleanCell(value).replace(/\s+/g, '').replace(/[/:：()（）]/g, '').toLowerCase()
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(value: ExcelCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }

  const text = cleanCell(value)
  const fullYearMatch = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)

  if (fullYearMatch) {
    return `${fullYearMatch[1]}-${fullYearMatch[2].padStart(2, '0')}-${fullYearMatch[3].padStart(2, '0')}`
  }

  const shortYearMatch = text.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/)

  if (shortYearMatch) {
    const year = Number(shortYearMatch[1])
    return `${year >= 70 ? 1900 + year : 2000 + year}-${shortYearMatch[2].padStart(2, '0')}-${shortYearMatch[3].padStart(2, '0')}`
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : formatDate(parsed)
}

function parseNumberCell(value: ExcelCell) {
  const text = cleanCell(value).replace(/,/g, '').replace(/[￥¥元]/g, '').replace(/CNY/gi, '')

  if (!text) {
    return undefined
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseResult(value: ExcelCell): InquiryResult {
  const text = cleanCell(value)

  if (/^(否|否决|不)$/.test(text) || /未中|失败|lost/i.test(text)) {
    return 'LOST'
  }

  if (/^(是|中)$/.test(text) || /中标|成交|采用|won|selected/i.test(text)) {
    return 'WON'
  }

  return 'PENDING'
}

function buildHeaderMap(headerRow: ExcelRow) {
  const map = new Map<string, number>()

  headerRow.forEach((cell, index) => {
    const label = normalizeLabel(cell)
    if (label) {
      map.set(label, index)
    }
  })

  return map
}

function getByHeader(row: ExcelRow, headerMap: Map<string, number>, labels: string[]) {
  for (const label of labels) {
    const index = headerMap.get(normalizeLabel(label))
    if (index !== undefined) {
      return row[index]
    }
  }

  return ''
}

function getRowYear(row: ExcelRow) {
  const text = cleanCell(row[0])
  const matched = text.match(/^(\d{4})年?$/)
  return matched?.[1] || ''
}

function getInquiryNo(sourceTitle: string, currentNo: string, inquiryDate: string, rowIndex: number) {
  return limitText(`${sourceTitle}-${inquiryDate || DEFAULT_DATE}-${currentNo || `ROW${rowIndex + 1}`}`, 160)
}

function normalizeImportedItem(item: InquiryItemPayload): InquiryItemPayload {
  return {
    ...item,
    materialName: item.materialName || item.materialCode || 'Unnamed Material',
    totalAmount: item.totalAmount ?? (
      item.quotedPrice !== undefined && item.quantity !== undefined
        ? Number((item.quotedPrice * item.quantity).toFixed(2))
        : undefined
    ),
    winningPrice: item.result === 'WON' ? item.winningPrice ?? item.quotedPrice : item.winningPrice
  }
}

export function buildHistoryInquiryPayloads(rows: ExcelRow[], sourceName: string): CreateInquiryPayload[] {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeLabel)
    return [['Customer', '客户'], ['Inquiry Date', '询价日期'], ['Product Code', 'Material Code', '产品代码'], ['Product Name', 'Material Name', '品名(中文)', '品名中文']]
      .every((labels) => labels.some((label) => normalized.includes(normalizeLabel(label))))
  })

  if (headerIndex === -1) {
    throw new Error('Historical inquiry headers were not found')
  }

  const sourceTitle = sourceName.replace(/\.(xlsx|xls)$/i, '')
  const headerMap = buildHeaderMap(rows[headerIndex])
  const groups = new Map<string, CreateInquiryPayload>()
  let currentNo = ''
  let currentCustomer = ''
  let currentPerson = ''
  let currentDate = ''
  let currentYear = ''

  rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    currentYear = getRowYear(row) || currentYear

    const no = cleanCell(getByHeader(row, headerMap, ['Order No.', 'Inquiry No.', 'NO', '订单号', '询价单号']))
    const customer = cleanCell(getByHeader(row, headerMap, ['Customer', '客户']))
    const person = cleanCell(getByHeader(row, headerMap, ['Contact', 'Inquiry Contact', '询价人']))
    const inquiryDate = normalizeDate(getByHeader(row, headerMap, ['Inquiry Date', '询价日期']))
    const materialCode = cleanCell(getByHeader(row, headerMap, ['Product Code', 'Material Code', '产品代码', '物料编码']))
    const materialName = cleanCell(getByHeader(row, headerMap, ['Product Name', 'Material Name', '品名(中文)', '品名中文', '品名', '物料名称']))
    const modelSpec = cleanCell(getByHeader(row, headerMap, ['Model / Specification', 'Model / Specifications', '型号及规格', '型号规格', '规格型号']))

    if (no) {
      currentNo = no
    }

    if (customer) {
      currentCustomer = customer
    }

    if (person) {
      currentPerson = person
    }

    if (inquiryDate) {
      currentDate = inquiryDate
    }

    if (!materialCode && !materialName && !modelSpec) {
      return
    }

    const effectiveDate = currentDate || (currentYear ? `${currentYear}-01-01` : DEFAULT_DATE)
    const inquiryNo = getInquiryNo(sourceTitle, currentNo, effectiveDate, rowIndex)
    const result = parseResult(getByHeader(row, headerMap, ['Result', 'Status', '是否中标', '中标状态', '结果']))
    const quotedPrice = parseNumberCell(getByHeader(row, headerMap, ['Quote Unit Price', 'Quoted Unit Price', 'Unit Price (CNY, Tax Incl.)', 'Quote Unit Price (CNY)', '报价单价  (含税运)', '报价单价含税运', '报价单价', '含税单价', '报价']))
    const quantity = parseNumberCell(getByHeader(row, headerMap, ['Quantity', '数量', '需求数量']))
    const item = normalizeImportedItem({
      materialCode,
      materialName: materialName || materialCode || modelSpec || `Material on row ${rowIndex + 1}`,
      modelSpec,
      manufacturer: cleanCell(getByHeader(row, headerMap, ['Brand / Manufacturer', 'Manufacturer', '品牌/厂家', '品牌厂家', '厂家/品牌'])),
      supplierName: cleanCell(getByHeader(row, headerMap, ['Supplier', '询价厂家', '供应商', '报价公司'])),
      quantity,
      quotedPrice,
      deliveryTime: cleanCell(getByHeader(row, headerMap, ['Lead Time', 'Quoted Lead Time', '报价货期', '供应商货期', '货期'])),
      result,
      remark: [
        cleanCell(getByHeader(row, headerMap, ['Notes', '备注说明(对采购方及供方)', '备注说明对采购方及供方', '备注'])),
        cleanCell(getByHeader(row, headerMap, ['Quote Notes', '报价说明'])),
        cleanCell(getByHeader(row, headerMap, ['Supplier Contact', '供应商联系方式']))
      ].filter(Boolean).join('; ')
    })

    if (!groups.has(inquiryNo)) {
      groups.set(inquiryNo, {
        inquiryNo,
        inquiryCompany: limitText(currentCustomer || sourceTitle, 160),
        inquiryPerson: currentPerson ? limitText(currentPerson, 80) : undefined,
        inquiryDate: effectiveDate,
        remark: `Bulk import: ${sourceName}`,
        overwrite: true,
        items: []
      })
    }

    groups.get(inquiryNo)?.items.push(item)
  })

  const payloads = Array.from(groups.values()).filter((payload) => payload.items.length)

  if (!payloads.length) {
    throw new Error('No historical inquiry items were found to import')
  }

  return payloads
}

export function chunkInquiryPayloads(payloads: CreateInquiryPayload[], size = 200) {
  const chunks: CreateInquiryPayload[][] = []

  for (let index = 0; index < payloads.length; index += size) {
    chunks.push(payloads.slice(index, index + size))
  }

  return chunks
}
