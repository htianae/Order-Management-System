import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'

const ITEM_START_ROW = 5
const TEMPLATE_ITEM_ROW_COUNT = 3
const LOWER_SECTION_START_ROW = ITEM_START_ROW + TEMPLATE_ITEM_ROW_COUNT
const LAST_COLUMN = 6
const defaultTemplatePath = fileURLToPath(
  new URL('../../templates/shipping-application-template.xlsx', import.meta.url)
)

type NumericValue = number | string | Prisma.Decimal | null | undefined
type SharedShippingValue = string | boolean | Date | null

export interface ShippingApplicationWorkbookShippingInfo {
  shippingDate?: Date | null
  weight?: string | null
  packageCount?: string | null
  packageSize?: string | null
  contractNo?: string | null
  salesperson?: string | null
  goodsName?: string | null
  supplierBrand?: string | null
  shippingQuantity?: string | null
  expectedDeliveryDate?: Date | null
  needsWoodenBox?: boolean | null
  woodenBoxPrice?: string | null
  woodenBoxFreight?: string | null
  route?: string | null
  needsTransfer?: boolean | null
  transferLogistics?: string | null
  estimatedTransferPrice?: string | null
  billingWeight?: string | null
  freightEstimate?: string | null
  applicant?: string | null
  approver?: string | null
  customerLogisticsCompany?: string | null
  customerTrackingNo?: string | null
  remark?: string | null
}

export interface ShippingApplicationWorkbookItem {
  id: string
  lineNo: number
  materialDescription?: string | null
  manufacturer?: string | null
  quantity?: NumericValue
  taxIncludedTotal?: NumericValue
  winningAmount?: NumericValue
  purchaseSupplierName?: string | null
  purchaseQuantity?: NumericValue
  itemDeliveryTime?: string | null
  purchaseDeliveryTime?: string | null
  shippingInfo?: ShippingApplicationWorkbookShippingInfo | null
}

export interface ShippingApplicationWorkbookInput {
  orderNo: string
  inquiryCompany: string
  creatorName: string
  exportedByName: string
  items: ShippingApplicationWorkbookItem[]
}

interface CellAddress {
  column: string
  row: number
}

type SharedShippingKey = keyof Pick<
  ShippingApplicationWorkbookShippingInfo,
  | 'shippingDate'
  | 'weight'
  | 'packageCount'
  | 'packageSize'
  | 'remark'
  | 'needsWoodenBox'
  | 'woodenBoxPrice'
  | 'woodenBoxFreight'
  | 'route'
  | 'needsTransfer'
  | 'transferLogistics'
  | 'estimatedTransferPrice'
  | 'billingWeight'
  | 'freightEstimate'
  | 'customerLogisticsCompany'
  | 'customerTrackingNo'
  | 'applicant'
  | 'approver'
>

const sharedFields: Array<{ key: SharedShippingKey; label: string }> = [
  { key: 'shippingDate', label: 'Shipping Date' },
  { key: 'weight', label: 'Weight' },
  { key: 'packageCount', label: 'Packages' },
  { key: 'packageSize', label: 'Dimensions' },
  { key: 'remark', label: 'Notes' },
  { key: 'needsWoodenBox', label: 'Wooden Crate Required' },
  { key: 'woodenBoxPrice', label: 'Crate Cost' },
  { key: 'woodenBoxFreight', label: 'Estimated Crate Freight' },
  { key: 'route', label: 'Origin / Destination' },
  { key: 'needsTransfer', label: 'Transfer Required' },
  { key: 'transferLogistics', label: 'Transfer Carrier' },
  { key: 'estimatedTransferPrice', label: 'Estimated Transfer Cost' },
  { key: 'billingWeight', label: 'Billing Weight' },
  { key: 'freightEstimate', label: 'Estimated Freight' },
  { key: 'customerLogisticsCompany', label: 'Carrier' },
  { key: 'customerTrackingNo', label: 'Tracking No.' },
  { key: 'applicant', label: 'Applicant' },
  { key: 'approver', label: 'Approver' }
]

export class ShippingApplicationFieldConflictError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Selected items have conflicting values for: ${fields.join(', ')}`)
    this.name = 'ShippingApplicationFieldConflictError'
  }
}

function cleanText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function decimal(value: NumericValue) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  try {
    const parsed = new Prisma.Decimal(value)
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}

function numericCellValue(value: NumericValue) {
  const parsed = decimal(value)
  return parsed === null ? null : parsed.toNumber()
}

function uniqueSortedItems(items: ShippingApplicationWorkbookItem[]) {
  const seen = new Set<string>()

  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (seen.has(item.id)) {
        return false
      }
      seen.add(item.id)
      return true
    })
    .sort((left, right) => left.item.lineNo - right.item.lineNo || left.index - right.index)
    .map(({ item }) => item)
}

function parseCellAddress(address: string): CellAddress {
  const match = /^([A-Z]+)(\d+)$/.exec(address)
  if (!match) {
    throw new Error(`Invalid cell address: ${address}`)
  }

  return { column: match[1], row: Number(match[2]) }
}

function shiftRange(range: string, rowOffset: number) {
  const [fromAddress, toAddress = fromAddress] = range.split(':')
  const from = parseCellAddress(fromAddress)
  const to = parseCellAddress(toAddress)

  return `${from.column}${from.row + rowOffset}:${to.column}${to.row + rowOffset}`
}

function resizeItemSection(sheet: ExcelJS.Worksheet, itemCount: number) {
  if (itemCount < 1) {
    throw new Error('No items to export in the shipping request')
  }

  const rowOffset = itemCount - TEMPLATE_ITEM_ROW_COUNT
  const merges = [...sheet.model.merges]
  const sourceRow = sheet.getRow(ITEM_START_ROW)
  const sourceHeight = sourceRow.height
  const sourceStyles = Array.from(
    { length: LAST_COLUMN },
    (_, index) => structuredClone(sourceRow.getCell(index + 1).style)
  )

  merges.forEach((range) => sheet.unMergeCells(range))

  if (rowOffset > 0) {
    const rows = Array.from({ length: rowOffset }, () => [])
    sheet.spliceRows(LOWER_SECTION_START_ROW, 0, ...rows)
  } else if (rowOffset < 0) {
    sheet.spliceRows(ITEM_START_ROW + itemCount, -rowOffset)
  }

  merges.forEach((range) => {
    const startRow = parseCellAddress(range.split(':')[0]).row
    sheet.mergeCells(startRow >= LOWER_SECTION_START_ROW ? shiftRange(range, rowOffset) : range)
  })

  for (let index = 0; index < itemCount; index += 1) {
    const row = sheet.getRow(ITEM_START_ROW + index)
    row.height = sourceHeight

    for (let column = 1; column <= LAST_COLUMN; column += 1) {
      const cell = row.getCell(column)
      cell.value = null
      cell.style = structuredClone(sourceStyles[column - 1])
    }
  }

  // ExcelJS leaves trailing empty row objects after spliceRows deletes styled rows.
  const expectedRowCount = itemCount + 11
  const rows = (sheet as ExcelJS.Worksheet & { _rows: Array<ExcelJS.Row | undefined> })._rows
  if (rows.length > expectedRowCount) {
    rows.length = expectedRowCount
  }
}

function normalizeSharedValue(value: unknown): { comparison: string; value: SharedShippingValue } | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null
    }
    return { comparison: `date:${value.getTime()}`, value }
  }
  if (typeof value === 'boolean') {
    return { comparison: `boolean:${value}`, value }
  }
  if (typeof value === 'string') {
    const normalized = cleanText(value)
    return normalized === null ? null : { comparison: `text:${normalized}`, value: normalized }
  }
  return null
}

function collectSharedShippingFields(items: ShippingApplicationWorkbookItem[]) {
  const values: Partial<Record<SharedShippingKey, SharedShippingValue>> = {}
  const conflicts: string[] = []

  for (const field of sharedFields) {
    const distinct = new Map<string, SharedShippingValue>()

    for (const item of items) {
      const normalized = normalizeSharedValue(item.shippingInfo?.[field.key])
      if (normalized !== null && !distinct.has(normalized.comparison)) {
        distinct.set(normalized.comparison, normalized.value)
      }
    }

    if (distinct.size > 1) {
      conflicts.push(field.label)
    } else {
      values[field.key] = distinct.values().next().value ?? null
    }
  }

  if (conflicts.length) {
    throw new ShippingApplicationFieldConflictError(conflicts)
  }

  return values
}

function joinDistinct(left: string | null | undefined, right: string | null | undefined) {
  const values = [cleanText(left), cleanText(right)].filter((value): value is string => value !== null)
  return [...new Set(values)].join('/') || null
}

function selectedAmount(items: ShippingApplicationWorkbookItem[]) {
  const amounts = items.map((item) => decimal(item.winningAmount ?? item.taxIncludedTotal))
  if (amounts.some((amount) => amount === null)) {
    return null
  }

  return amounts.reduce<Prisma.Decimal>(
    (sum, amount) => sum.plus(amount!),
    new Prisma.Decimal(0)
  ).toNumber()
}

function setDateOrText(cell: ExcelJS.Cell, value: Date | string | null | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    ) as Record<'year' | 'month' | 'day', string>
    cell.value = `${parts.year}.${Number(parts.month)}.${Number(parts.day)}`
    return
  }
  cell.value = typeof value === 'string' ? cleanText(value) : null
}

function booleanDisplay(value: SharedShippingValue | undefined) {
  if (value === true) {
    return '☑Yes   □No'
  }
  if (value === false) {
    return '□Yes   ☑No'
  }
  return null
}

function writeItemRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  input: ShippingApplicationWorkbookInput,
  item: ShippingApplicationWorkbookItem
) {
  const shipping = item.shippingInfo
  const quantity = cleanText(shipping?.shippingQuantity)
    ?? numericCellValue(item.purchaseQuantity)
    ?? numericCellValue(item.quantity)
  const deliveryDate = shipping?.expectedDeliveryDate
    ?? cleanText(item.itemDeliveryTime)
    ?? cleanText(item.purchaseDeliveryTime)

  sheet.getCell(`A${rowNumber}`).value = cleanText(shipping?.contractNo) ?? cleanText(input.orderNo)
  sheet.getCell(`B${rowNumber}`).value = cleanText(shipping?.salesperson) ?? cleanText(input.creatorName)
  sheet.getCell(`C${rowNumber}`).value = cleanText(shipping?.goodsName) ?? cleanText(item.materialDescription)
  sheet.getCell(`D${rowNumber}`).value = cleanText(shipping?.supplierBrand)
    ?? joinDistinct(item.purchaseSupplierName, item.manufacturer)
  sheet.getCell(`E${rowNumber}`).value = quantity
  setDateOrText(sheet.getCell(`F${rowNumber}`), deliveryDate)
}

function writeWorkbookFields(
  sheet: ExcelJS.Worksheet,
  input: ShippingApplicationWorkbookInput,
  items: ShippingApplicationWorkbookItem[],
  shared: Partial<Record<SharedShippingKey, SharedShippingValue>>
) {
  setDateOrText(sheet.getCell('F1'), shared.shippingDate as Date | null | undefined)
  sheet.getCell('A3').value = cleanText(input.inquiryCompany)
  sheet.getCell('B3').value = selectedAmount(items)
  sheet.getCell('B3').numFmt = '¥#,##0.00'
  sheet.getCell('C3').value = shared.weight ?? null
  sheet.getCell('D3').value = shared.packageCount ?? null
  sheet.getCell('E3').value = shared.packageSize ?? null
  sheet.getCell('F3').value = shared.remark ?? null

  items.forEach((item, index) => writeItemRow(sheet, ITEM_START_ROW + index, input, item))

  const lowerSectionRow = ITEM_START_ROW + items.length
  sheet.getCell(`B${lowerSectionRow}`).value = booleanDisplay(shared.needsWoodenBox)
  sheet.getCell(`D${lowerSectionRow}`).value = shared.woodenBoxPrice ?? null
  sheet.getCell(`F${lowerSectionRow}`).value = shared.woodenBoxFreight ?? null
  sheet.getCell(`B${lowerSectionRow + 1}`).value = shared.route ?? null
  sheet.getCell(`D${lowerSectionRow + 1}`).value = booleanDisplay(shared.needsTransfer)
  sheet.getCell(`F${lowerSectionRow + 1}`).value = shared.transferLogistics ?? null
  sheet.getCell(`B${lowerSectionRow + 2}`).value = shared.estimatedTransferPrice ?? null
  sheet.getCell(`E${lowerSectionRow + 2}`).value = shared.billingWeight ?? null
  sheet.getCell(`B${lowerSectionRow + 3}`).value = shared.freightEstimate ?? null
  sheet.getCell(`B${lowerSectionRow + 5}`).value = shared.customerLogisticsCompany ?? null
  sheet.getCell(`D${lowerSectionRow + 5}`).value = shared.customerTrackingNo ?? null
  sheet.getCell(`B${lowerSectionRow + 6}`).value = shared.applicant ?? cleanText(input.exportedByName)
  sheet.getCell(`D${lowerSectionRow + 6}`).value = shared.approver ?? null
}

function assertTemplateStructure(sheet: ExcelJS.Worksheet) {
  const labels: Array<[string, string]> = [
    ['A1', 'Shipping Request'],
    ['E1', 'Shipping Date:'],
    ['A4', 'Contract No.'],
    ['F4', 'Delivery Date'],
    ['A8', 'Wooden Crate Required:'],
    ['A13', 'Carrier:']
  ]

  for (const [address, label] of labels) {
    if (sheet.getCell(address).value !== label) {
      throw new Error(`Shipping request template is missing label: ${label}`)
    }
  }
}

export async function buildShippingApplicationWorkbook(
  input: ShippingApplicationWorkbookInput,
  templatePath = defaultTemplatePath
) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const sheet = workbook.getWorksheet('Shipping Request')

  if (!sheet) {
    throw new Error('Shipping request template is missing worksheet: Shipping Request')
  }

  assertTemplateStructure(sheet)
  const items = uniqueSortedItems(input.items)
  const shared = collectSharedShippingFields(items)
  resizeItemSection(sheet, items.length)
  writeWorkbookFields(sheet, input, items, shared)

  return workbook
}
