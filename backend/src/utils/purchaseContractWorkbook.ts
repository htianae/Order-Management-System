import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'

export const purchaseContractOrderInclude = Prisma.validator<Prisma.OrderInclude>()({
  creator: {
    select: {
      username: true,
      displayName: true
    }
  },
  items: {
    include: {
      purchaseInfo: true,
      purchaseBatch: {
        include: {
          batchItems: {
            select: { id: true }
          }
        }
      }
    },
    orderBy: { lineNo: 'asc' }
  }
})

export type PurchaseContractOrder = Prisma.OrderGetPayload<{
  include: typeof purchaseContractOrderInclude
}>

export interface PurchaseContractWorkbookOptions {
  includeCreatedAt?: boolean
}

const purchaseContractHeaders = [
  'No.',
  'Customer',
  'Order Contact',
  'Sales Contract No.',
  'Product Name',
  'Model / Specification',
  'Customer Notes',
  'End User',
  'Manufacturer',
  'Quantity',
  '',
  'Unit Price (CNY, Tax Incl.)',
  'Amount (CNY, Tax Incl.)',
  'Contract Date',
  'Delivery Date',
  'Supplier',
  'Purchase Contract No.',
  'Quantity',
  'Unit Price (CNY, Tax Incl.)',
  'Amount (CNY, Tax Incl.)',
  'Contract Amount (CNY)',
  'Lead Time'
]

function text(value: unknown, fallback = '') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  return String(value)
}

function getShanghaiDateParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )

  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>
}

function formatExportDate(value: Date | string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
}

function formatCreatedAt(value: Date | string) {
  const parts = getShanghaiDateParts(value)
  return parts
    ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    : ''
}

function getColumnName(columnNumber: number) {
  let value = columnNumber
  let name = ''

  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }

  return name
}

function getPurchaseUnitPrice(item: PurchaseContractOrder['items'][number]) {
  if (item.purchaseUnitPrice !== null && item.purchaseUnitPrice !== undefined) {
    return Number(item.purchaseUnitPrice)
  }

  if (item.purchaseInfo?.purchaseCost !== null && item.purchaseInfo?.purchaseCost !== undefined) {
    return Number(item.purchaseInfo.purchaseCost)
  }

  if (
    (item.purchaseBatch?.batchItems.length || 0) === 1
    && item.purchaseBatch?.purchaseCost !== null
    && item.purchaseBatch?.purchaseCost !== undefined
  ) {
    return Number(item.purchaseBatch.purchaseCost)
  }

  return null
}

function getDeliveryTime(item: PurchaseContractOrder['items'][number]) {
  return text(
    item.purchaseBatch?.deliveryTime,
    text(item.purchaseInfo?.deliveryTime, text(item.deliveryTime))
  )
}

export function buildPurchaseContractWorkbook(
  orders: PurchaseContractOrder[],
  options: PurchaseContractWorkbookOptions = {}
) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Purchase Contracts')
  const includeCreatedAt = options.includeCreatedAt === true
  const headers = includeCreatedAt
    ? ['Order Created At', ...purchaseContractHeaders]
    : purchaseContractHeaders
  const columnOffset = includeCreatedAt ? 1 : 0

  sheet.columns = headers.map((header, index) => {
    if (includeCreatedAt && index === 0) {
      return { header, key: 'createdAt', width: 20 }
    }

    const baseIndex = index - columnOffset
    const width = baseIndex === 4
      ? 42
      : baseIndex === 5
        ? 24
        : baseIndex === 6
          ? 22
          : baseIndex === 15
            ? 28
            : 13

    return {
      header,
      key: `col${baseIndex + 1}`,
      width
    }
  })

  const sortedOrders = [...orders].sort((left, right) => {
    const timeDifference = left.createdAt.getTime() - right.createdAt.getTime()
    return timeDifference || left.id.localeCompare(right.id)
  })
  let sequence = 0

  sortedOrders.forEach((order) => {
    const sortedItems = [...order.items].sort((left, right) => left.lineNo - right.lineNo)

    sortedItems.forEach((item) => {
      sequence += 1
      const rowNumber = sequence + 1
      const quantity = item.quantity === null || item.quantity === undefined ? null : Number(item.quantity)
      const quotedPrice = item.quotedPrice === null || item.quotedPrice === undefined
        ? null
        : Number(item.quotedPrice)
      const purchaseQuantity = item.purchaseQuantity === null || item.purchaseQuantity === undefined
        ? quantity
        : Number(item.purchaseQuantity)
      const purchaseUnitPrice = getPurchaseUnitPrice(item)
      const purchaseTotal = item.purchaseTotal === null || item.purchaseTotal === undefined
        ? null
        : Number(item.purchaseTotal)
      const quantityColumn = getColumnName(10 + columnOffset)
      const quotedPriceColumn = getColumnName(12 + columnOffset)
      const purchaseQuantityColumn = getColumnName(18 + columnOffset)
      const purchaseUnitPriceColumn = getColumnName(19 + columnOffset)
      const purchaseTotalColumn = getColumnName(20 + columnOffset)
      const calculatedPurchaseTotal = purchaseQuantity !== null && purchaseUnitPrice !== null
        ? purchaseQuantity * purchaseUnitPrice
        : null
      const baseValues = [
        sequence,
        text(order.inquiryCompany),
        text(order.inquiryPerson, text(order.creator.displayName, order.creator.username)),
        text(order.orderNo),
        text(item.materialDescription, text(order.productNameCn)),
        text(item.materialCode, text(order.modelSpec)),
        text(item.remark),
        text(item.applicantDepartment),
        text(item.manufacturer),
        quantity,
        text(item.unit),
        quotedPrice,
        quantity !== null && quotedPrice !== null
          ? {
              formula: `${quotedPriceColumn}${rowNumber}*${quantityColumn}${rowNumber}`,
              result: quantity * quotedPrice
            }
          : null,
        formatExportDate(order.inquiryDate),
        text(item.deliveryTime),
        text(item.purchaseBatch?.supplierName, text(item.purchaseInfo?.supplierName)),
        '',
        purchaseQuantity,
        purchaseUnitPrice,
        purchaseTotal !== null
          ? purchaseTotal
          : calculatedPurchaseTotal !== null
            ? {
                formula: `${purchaseUnitPriceColumn}${rowNumber}*${purchaseQuantityColumn}${rowNumber}`,
                result: calculatedPurchaseTotal
              }
            : null,
        purchaseTotal !== null
          ? purchaseTotal
          : calculatedPurchaseTotal !== null
            ? {
                formula: `${purchaseTotalColumn}${rowNumber}`,
                result: calculatedPurchaseTotal
              }
            : null,
        getDeliveryTime(item)
      ]

      sheet.addRow(includeCreatedAt ? [formatCreatedAt(order.createdAt), ...baseValues] : baseValues)
    })
  })

  const lastRow = Math.max(sheet.rowCount, 2)
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (let row = 1; row <= lastRow; row += 1) {
    sheet.getRow(row).height = row === 1 ? 54 : 36

    for (let col = 1; col <= headers.length; col += 1) {
      const cell = sheet.getCell(row, col)
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
    }
  }

  const quantityColumns = [10, 18].map((column) => column + columnOffset)
  const amountColumns = [12, 13, 19, 20, 21].map((column) => column + columnOffset)
  quantityColumns.forEach((column) => {
    sheet.getColumn(column).numFmt = '0.###'
  })
  amountColumns.forEach((column) => {
    sheet.getColumn(column).numFmt = '#,##0.00'
  })

  sheet.autoFilter = {
    from: 'A1',
    to: `${getColumnName(headers.length)}${lastRow}`
  }

  return workbook
}
