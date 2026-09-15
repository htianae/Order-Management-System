import {
  BidResult,
  CustomerPaymentStatus,
  FileCategory,
  FileTargetType,
  InquiryResult,
  InvoiceStatus,
  OrderStatus,
  PaymentApplicationStatus,
  PaymentStatus,
  Prisma,
  ShippingApplicationStatus,
  UserRole
} from '@prisma/client'
import ExcelJS from 'exceljs'
import type { Request, Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'

import {
  createOrderSchema,
  createShippingApplicationSchema,
  shippingApplicationExportQuerySchema,
  type OrderListQuery,
  orderListPageQuerySchema,
  orderListQuerySchema,
  updateOrderBasicInfoSchema,
  updateOrderItemBasicInfoSchema,
  updatePurchaseItemPricingSchema,
  updateBidInfoSchema,
  updateCustomerPaymentSchema,
  updateDeliveryInfoSchema,
  updateOrderItemStatusSchema,
  updatePurchaseBatchBasicInfoSchema,
  updatePurchaseBatchSchema,
  updatePurchaseInfoSchema,
  updateQuoteInfoSchema,
  updateWinningInfoSchema,
  updateOrderStatusSchema
} from '../validators/order.validator.js'
import { env } from '../config/env.js'
import { normalizeUploadedFilename } from '../utils/filename.js'
import { calculatePaymentAmounts } from '../utils/paymentAmounts.js'
import { getItemWinningAmountUpdateData } from '../utils/orderWinningAmount.js'
import {
  buildOrderCustomerPaymentSummary,
  type OrderCustomerPaymentSummary
} from '../utils/orderCustomerPayment.js'
import { prisma } from '../utils/prisma.js'
import { resolveCustomerPaymentStatus } from '../utils/customerPaymentStatus.js'
import { buildMyOrdersSummary } from '../utils/myOrdersSummary.js'
import {
  buildPurchaseContractWorkbook,
  purchaseContractOrderInclude
} from '../utils/purchaseContractWorkbook.js'
import { tokenizeSearchText } from '../utils/searchTokens.js'
import { getShippingApprovalTransition, type ShippingApprovalDecision } from '../utils/shippingApproval.js'
import { sortAndPaginateOrdersByDeliveryTime } from '../utils/orderListDeliverySort.js'
import {
  getGroupedShippingTransition,
  normalizeShippingBatchIds,
  type GroupedShippingDecision
} from '../utils/shippingApplication.js'
import {
  buildShippingApplicationWorkbook,
  ShippingApplicationFieldConflictError
} from '../utils/shippingApplicationWorkbook.js'

type OrderWithCreator = Prisma.OrderGetPayload<{
  include: {
    creator: {
      select: {
        id: true
        username: true
        displayName: true
      }
    }
    items: {
      select: {
        id: true
        lineNo: true
        materialCode: true
        materialDescription: true
        manufacturer: true
        quantity: true
        quotedPrice: true
        taxIncludedTotal: true
        deliveryTime: true
        winningAmount: true
        bidResult: true
      }
    }
  }
}>

function toDecimal(value: number | undefined) {
  return value === undefined ? undefined : new Prisma.Decimal(value)
}

function buildOrderSearchWhere(search?: string): Prisma.OrderWhereInput {
  const tokens = tokenizeSearchText(search)

  if (!tokens.length) {
    return {}
  }

  return {
    AND: tokens.map((token) => ({
      OR: [
        { orderNo: { contains: token, mode: 'insensitive' } },
        { inquiryCompany: { contains: token, mode: 'insensitive' } },
        { inquiryPerson: { contains: token, mode: 'insensitive' } },
        { inquiryNo: { contains: token, mode: 'insensitive' } },
        { productCode: { contains: token, mode: 'insensitive' } },
        { productNameCn: { contains: token, mode: 'insensitive' } },
        { modelSpec: { contains: token, mode: 'insensitive' } },
        {
          items: {
            some: {
              OR: [
                { materialCode: { contains: token, mode: 'insensitive' } },
                { materialDescription: { contains: token, mode: 'insensitive' } },
                { manufacturer: { contains: token, mode: 'insensitive' } },
                { supplierRemark: { contains: token, mode: 'insensitive' } }
              ]
            }
          }
        },
        {
          creator: {
            is: {
              OR: [
                { username: { contains: token, mode: 'insensitive' } },
                { displayName: { contains: token, mode: 'insensitive' } }
              ]
            }
          }
        }
      ]
    }))
  }
}

function textContains(value: string) {
  return {
    contains: value,
    mode: 'insensitive' as const
  }
}

function buildOrderWhere(
  query: Omit<OrderListQuery, 'sortBy' | 'sortOrder'>
): Prisma.OrderWhereInput {
  const conditions: Prisma.OrderWhereInput[] = []

  if (query.search) {
    conditions.push(buildOrderSearchWhere(query.search))
  }

  if (query.orderNo) {
    conditions.push({ orderNo: textContains(query.orderNo) })
  }

  if (query.companyName) {
    conditions.push({ inquiryCompany: textContains(query.companyName) })
  }

  if (query.productName) {
    conditions.push({
      OR: [
        { productNameCn: textContains(query.productName) },
        {
          items: {
            some: {
              materialDescription: textContains(query.productName)
            }
          }
        }
      ]
    })
  }

  if (query.productCode) {
    conditions.push({ productCode: textContains(query.productCode) })
  }

  if (query.modelSpec) {
    conditions.push({
      OR: [
        { modelSpec: textContains(query.modelSpec) },
        {
          items: {
            some: {
              remark: textContains(query.modelSpec)
            }
          }
        }
      ]
    })
  }

  if (query.supplier) {
    conditions.push({
      supplierQuotes: {
        some: {
          supplier: {
            name: textContains(query.supplier)
          }
        }
      }
    })
  }

  if (query.creator) {
    conditions.push({
      creator: {
        is: {
          OR: [
            { username: textContains(query.creator) },
            { displayName: textContains(query.creator) }
          ]
        }
      }
    })
  }

  if (query.status) {
    conditions.push({ currentStatus: query.status })
  }

  if (query.bidResult) {
    conditions.push({ bidResult: query.bidResult })
  }

  if (query.deliveryMonth) {
    const normalizedMonth = query.deliveryMonth.replace('/', '-')
    conditions.push({
      items: {
        some: {
          OR: [
            { deliveryTime: { contains: normalizedMonth, mode: 'insensitive' } },
            { deliveryTime: { contains: normalizedMonth.replace('-', '/'), mode: 'insensitive' } }
          ]
        }
      }
    })
  }

  if (query.deliveryTime) {
    conditions.push({
      items: {
        some: {
          deliveryTime: textContains(query.deliveryTime)
        }
      }
    })
  }

  if (query.year) {
    conditions.push({
      inquiryDate: {
        gte: new Date(`${query.year}-01-01T00:00:00.000Z`),
        lt: new Date(`${query.year + 1}-01-01T00:00:00.000Z`)
      }
    })
  }

  if (query.amountMin !== undefined || query.amountMax !== undefined) {
    conditions.push({
      winningAmount: {
        ...(query.amountMin !== undefined ? { gte: new Prisma.Decimal(query.amountMin) } : {}),
        ...(query.amountMax !== undefined ? { lte: new Prisma.Decimal(query.amountMax) } : {})
      }
    })
  }

  if (!conditions.length) {
    return {}
  }

  return { AND: conditions }
}

function buildOrderBy(
  sortBy: 'orderNo' | 'inquiryCompany' | 'productNameCn' | 'currentStatus' | 'creatorName' | 'createdAt',
  sortOrder: 'asc' | 'desc'
): Prisma.OrderOrderByWithRelationInput {
  if (sortBy === 'creatorName') {
    return {
      creator: {
        displayName: sortOrder
      }
    }
  }

  return {
    [sortBy]: sortOrder
  }
}

function parseDeliveryReminderDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().replace(/\//g, '-')
  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)

  if (!match) {
    return null
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function hasDeliveryReminder(order: OrderWithCreator) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneMonthLater = new Date(today)
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1)

  return order.items.some((item) => {
    const date = parseDeliveryReminderDate(item.deliveryTime)
    return Boolean(date && date >= today && date <= oneMonthLater)
  })
}

function sortOrdersByDeliveryReminder(orders: OrderWithCreator[], sortOrder: 'asc' | 'desc') {
  return [...orders].sort((left, right) => {
    const leftValue = hasDeliveryReminder(left) ? 1 : 0
    const rightValue = hasDeliveryReminder(right) ? 1 : 0
    const reminderCompare = sortOrder === 'asc'
      ? leftValue - rightValue
      : rightValue - leftValue

    if (reminderCompare !== 0) {
      return reminderCompare
    }

    return right.createdAt.getTime() - left.createdAt.getTime()
  })
}

function getQueryString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isBossOrAdmin(role: UserRole) {
  return role === UserRole.BOSS || role === UserRole.ADMIN
}

function getPositiveIntQuery(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, max)
}

function mapOrderListItem(order: OrderWithCreator) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    inquiryCompany: order.inquiryCompany,
    declarationCompany: order.declarationCompany,
    productNameCn: order.productNameCn,
    currentStatus: order.currentStatus,
    bidResult: order.bidResult,
    historyItems: order.items.map((item) => ({
      id: item.id,
      lineNo: item.lineNo,
      materialCode: item.materialCode,
      materialName: item.materialDescription,
      manufacturer: item.manufacturer,
      quantity: item.quantity?.toString() || null,
      quotedPrice: item.quotedPrice?.toString() || null,
      totalAmount: item.taxIncludedTotal?.toString() || null,
      deliveryTime: item.deliveryTime,
      winningPrice: item.winningAmount?.toString() || null,
      result: item.bidResult
    })),
    createdAt: order.createdAt,
    creator: {
      id: order.creator.id,
      username: order.creator.username,
      realName: order.creator.displayName
    }
  }
}

function buildOrderInquiryNo(orderNo: string) {
  return `Order-${orderNo}`
}

const orderListInclude = {
  creator: {
    select: {
      id: true,
      username: true,
      displayName: true
    }
  },
  items: {
    orderBy: {
      lineNo: 'asc' as const
    },
    select: {
      id: true,
      lineNo: true,
      materialCode: true,
      materialDescription: true,
      manufacturer: true,
      quantity: true,
      quotedPrice: true,
      taxIncludedTotal: true,
      deliveryTime: true,
      winningAmount: true,
      bidResult: true
    }
  }
}

function getBidResultForStatus(status: OrderStatus) {
  if (status === OrderStatus.BID_WON) {
    return BidResult.WON
  }

  if (status === OrderStatus.BID_LOST || status === OrderStatus.LOST_ARCHIVED) {
    return BidResult.LOST
  }

  return undefined
}

const allowedStatusTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.PURCHASING]: [OrderStatus.PURCHASE_PAYMENT],
  [OrderStatus.PURCHASE_PAYMENT]: [OrderStatus.SHIPPED_TO_CUSTOMER],
  [OrderStatus.SHIPPED_TO_CUSTOMER]: [OrderStatus.ARRIVED_COMPANY],
  [OrderStatus.ARRIVED_COMPANY]: [OrderStatus.CUSTOMER_PAID],
  [OrderStatus.CUSTOMER_PAID]: [OrderStatus.COMPLETED]
}

const activeStatusOrder: OrderStatus[] = [
  OrderStatus.PURCHASING,
  OrderStatus.PURCHASE_PAYMENT,
  OrderStatus.SHIPPED_TO_CUSTOMER,
  OrderStatus.ARRIVED_COMPANY,
  OrderStatus.CUSTOMER_PAID,
  OrderStatus.COMPLETED
]
const lostStatuses: OrderStatus[] = [OrderStatus.BID_LOST, OrderStatus.LOST_ARCHIVED]
const pendingOrLostStatuses: OrderStatus[] = [
  OrderStatus.INQUIRY,
  OrderStatus.QUOTED,
  OrderStatus.BID_LOST,
  OrderStatus.LOST_ARCHIVED
]

function summarizeItemStatuses(items: Array<{ currentStatus: OrderStatus }>) {
  if (!items.length) {
    return OrderStatus.INQUIRY
  }

  const activeItems = items.filter((item) => !lostStatuses.includes(item.currentStatus))

  if (!activeItems.length) {
    return items.every((item) => item.currentStatus === OrderStatus.LOST_ARCHIVED)
      ? OrderStatus.LOST_ARCHIVED
      : OrderStatus.BID_LOST
  }

  return activeItems
    .map((item) => item.currentStatus)
    .sort((left, right) => activeStatusOrder.indexOf(left) - activeStatusOrder.indexOf(right))[0]
}

function summarizeBidResult(items: Array<{ currentStatus: OrderStatus }>) {
  if (!items.length) {
    return BidResult.PENDING
  }

  const hasWonItem = items.some((item) => !pendingOrLostStatuses.includes(item.currentStatus))

  if (hasWonItem) {
    return BidResult.WON
  }

  if (items.every((item) => lostStatuses.includes(item.currentStatus))) {
    return BidResult.LOST
  }

  return BidResult.PENDING
}

const fileTypeCategoryMap: Record<string, FileCategory> = {
  WINNING_CONTRACT: FileCategory.BID_CONTRACT,
  PURCHASE_CONTRACT: FileCategory.PURCHASE_CONTRACT,
  PAYMENT_APPLICATION: FileCategory.PAYMENT_APPLICATION,
  SHIPPING_APPLICATION: FileCategory.SHIPPING_APPLICATION,
  PRODUCT_PHOTO: FileCategory.PRODUCT_IMAGE,
  DELIVERY_PHOTO: FileCategory.SHIPPING_IMAGE,
  SUPPLIER_QUOTE_FILE: FileCategory.SUPPLIER_QUOTE,
  OTHER: FileCategory.OTHER
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

function text(value: unknown, fallback = '') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  return String(value)
}

function sumDecimals(values: Array<Prisma.Decimal | null | undefined>) {
  let total = new Prisma.Decimal(0)

  values.forEach((value) => {
    total = total.plus(value || 0)
  })

  return total
}

function getPaymentRemark(paymentPercent: Prisma.Decimal | number | null | undefined) {
  if (paymentPercent === null || paymentPercent === undefined) {
    return ''
  }

  const percent = new Prisma.Decimal(paymentPercent)

  if (percent.equals(100)) {
    return 'Full payment 100%'
  }

  if (percent.greaterThan(50)) {
    return `Balance ${percent.toString()}%`
  }

  return `Advance ${percent.toString()}% (full payment)`
}

function resolvePaymentAmount(inputAmount: number | undefined, calculatedAmount?: Prisma.Decimal) {
  return inputAmount !== undefined ? new Prisma.Decimal(inputAmount) : calculatedAmount
}

function getLatestPaymentApplicationRemark(purchaseInfo: {
  paymentPercent: Prisma.Decimal | null
  paymentApplications?: Array<{
    remark: string | null
    paymentPercent: Prisma.Decimal
  }>
}) {
  const latestApplication = purchaseInfo.paymentApplications?.[0]
  return latestApplication?.remark || getPaymentRemark(latestApplication?.paymentPercent || purchaseInfo.paymentPercent)
}

function calculateProfitRate(winningAmount: Prisma.Decimal | number | undefined | null, profit: Prisma.Decimal) {
  if (!winningAmount) {
    return null
  }

  const winning = new Prisma.Decimal(winningAmount)
  if (winning.equals(0)) {
    return null
  }

  return profit.div(winning)
}

type OrderProfitClient = Pick<Prisma.TransactionClient, 'order'>

export async function recalculateOrderProfit(
  orderId: string,
  client: OrderProfitClient = prisma
) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: {
      winningAmount: true,
      purchaseCost: true,
      logisticsCost: true,
      otherCost: true,
      taxFee: true
    }
  })

  if (!order?.winningAmount) {
    await client.order.update({
      where: { id: orderId },
      data: {
        profit: null,
        profitRate: null
      }
    })
    return
  }

  const profit = order.winningAmount
    .minus(order.purchaseCost)
    .minus(order.logisticsCost)
    .minus(order.otherCost)
    .minus(order.taxFee)

  await client.order.update({
    where: { id: orderId },
    data: {
      profit,
      profitRate: calculateProfitRate(order.winningAmount, profit)
    }
  })
}

type OrderSummaryClient = Pick<
  Prisma.TransactionClient,
  'order' | 'orderItem' | 'customerPayment'
>

class OrderTotalBelowPaidAmountError extends Error {
  constructor() {
    super('Order total cannot be less than the amount received')
  }
}

class CompletedOrderAmountLockedError extends Error {
  constructor() {
    super('The total for a completed order is locked and cannot be changed')
  }
}

class OrderItemNotFoundError extends Error {}

async function getEffectiveOrderPaidAmount(
  orderId: string,
  currentWinningAmount: Prisma.Decimal | null | undefined,
  client: OrderSummaryClient
) {
  const customerPayments = await client.customerPayment.findMany({
    where: { orderId },
    orderBy: [
      { updatedAt: 'desc' },
      { id: 'desc' }
    ],
    select: {
      id: true,
      orderItemId: true,
      paidAmount: true,
      updatedAt: true
    }
  })
  const orderPayment =
    customerPayments.find((payment) => payment.orderItemId === null) || null
  const itemPayments = customerPayments.filter((payment) => payment.orderItemId !== null)

  return buildOrderCustomerPaymentSummary({
    winningAmount: currentWinningAmount,
    orderPayment,
    itemPayments
  }).paidAmount
}

async function assertOrderWinningAmountNotBelowPaidAmount(
  orderId: string,
  nextWinningAmount: Prisma.Decimal | null,
  currentWinningAmount: Prisma.Decimal | null | undefined,
  client: OrderSummaryClient,
  hasCompletedItems = false
) {
  const normalizedNextWinningAmount = new Prisma.Decimal(nextWinningAmount ?? 0)
  const normalizedCurrentWinningAmount = new Prisma.Decimal(currentWinningAmount ?? 0)

  if (hasCompletedItems) {
    if (!normalizedNextWinningAmount.equals(normalizedCurrentWinningAmount)) {
      throw new CompletedOrderAmountLockedError()
    }

    return
  }

  const effectivePaidAmount = await getEffectiveOrderPaidAmount(
    orderId,
    currentWinningAmount,
    client
  )

  if (normalizedNextWinningAmount.lessThan(effectivePaidAmount)) {
    throw new OrderTotalBelowPaidAmountError()
  }
}

function isOrderPaymentConsistencyError(error: unknown) {
  return error instanceof OrderTotalBelowPaidAmountError ||
    error instanceof CompletedOrderAmountLockedError
}

export async function refreshOrderSummaryFromItems(
  orderId: string,
  client: OrderSummaryClient = prisma
) {
  const items = await client.orderItem.findMany({
    where: { orderId },
    select: {
      currentStatus: true,
      winningAmount: true
    }
  })

  const winningAmount = items.reduce(
    (total, currentItem) => total.plus(currentItem.winningAmount || 0),
    new Prisma.Decimal(0)
  )

  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { winningAmount: true }
  })
  await assertOrderWinningAmountNotBelowPaidAmount(
    orderId,
    winningAmount,
    order?.winningAmount,
    client,
    items.some((item) => item.currentStatus === OrderStatus.COMPLETED)
  )

  const updatedOrder = await client.order.update({
    where: { id: orderId },
    data: {
      currentStatus: summarizeItemStatuses(items),
      bidResult: summarizeBidResult(items),
      winningAmount: winningAmount.equals(0) ? null : winningAmount
    }
  })

  await recalculateOrderProfit(orderId, client)

  return updatedOrder
}

export async function updateOrderItemAndRefresh<T>(
  orderId: string,
  updateItem: (client: CustomerPaymentTransaction) => Promise<T>,
  transaction: (
    operation: (client: CustomerPaymentTransaction) => Promise<T>
  ) => Promise<T> = (operation) => runSerializableTransactionWithRetry(prisma, operation),
  refreshOrderSummary: typeof refreshOrderSummaryFromItems = refreshOrderSummaryFromItems
) {
  return transaction(async (client) => {
    const item = await updateItem(client)
    await refreshOrderSummary(orderId, client)
    return item
  })
}

async function refreshOrderPurchaseCost(orderId: string) {
  const purchaseInfos = await prisma.purchaseInfo.findMany({
    where: { orderId },
    select: {
      orderItemId: true,
      purchaseCost: true,
      orderItem: {
        select: {
          purchaseBatchId: true
        }
      }
    }
  })
  const totalPurchaseCost = purchaseInfos.reduce((total, info) => {
    if (info.orderItemId && info.orderItem?.purchaseBatchId) {
      return total
    }

    return total.plus(info.purchaseCost)
  }, new Prisma.Decimal(0))

  await prisma.order.update({
    where: { id: orderId },
    data: {
      purchaseCost: totalPurchaseCost
    }
  })

  await recalculateOrderProfit(orderId)
}

async function ensureOrderItem(orderId: string, orderItemId: string | undefined) {
  if (!orderItemId) {
    return null
  }

  const item = await prisma.orderItem.findFirst({
    where: {
      id: orderItemId,
      orderId
    },
    select: {
      id: true
    }
  })

  return item
}

function getCurrentYearRange() {
  const year = new Date().getFullYear()

  return {
    year,
    start: new Date(`${year}-01-01T00:00:00.000Z`),
    end: new Date(`${year + 1}-01-01T00:00:00.000Z`)
  }
}

export async function listOrders(req: Request, res: Response) {
  const parsed = orderListPageQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const { page, pageSize, sortBy, sortOrder } = parsed.data
  const where = buildOrderWhere(parsed.data)
  const skip = (page - 1) * pageSize

  if (sortBy === 'deliveryReminder' || sortBy === 'deliveryTime') {
    const [allOrders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: orderListInclude
      }),
      prisma.order.count({ where })
    ])
    const orders = sortBy === 'deliveryReminder'
      ? sortOrdersByDeliveryReminder(allOrders, sortOrder).slice(skip, skip + pageSize)
      : sortAndPaginateOrdersByDeliveryTime(allOrders, sortOrder, skip, pageSize)

    return res.json({
      items: orders.map(mapOrderListItem),
      pagination: {
        page,
        pageSize,
        total
      }
    })
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: buildOrderBy(sortBy, sortOrder),
      include: orderListInclude
    }),
    prisma.order.count({ where })
  ])

  return res.json({
    items: orders.map(mapOrderListItem),
    pagination: {
      page,
      pageSize,
      total
    }
  })
}

export async function exportHistoryOrders(req: Request, res: Response) {
  const parsed = orderListQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const { sortBy, sortOrder } = parsed.data
  const where = buildOrderWhere(parsed.data)
  const orders = await prisma.order.findMany({
    where,
    orderBy: sortBy === 'deliveryReminder'
      ? { createdAt: 'desc' }
      : buildOrderBy(sortBy, sortOrder),
    include: orderListInclude
  })
  const sortedOrders = sortBy === 'deliveryReminder' ? sortOrdersByDeliveryReminder(orders, sortOrder) : orders
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Historical Orders')
  const headers = ['Order Number', 'Customer', 'Item Name', 'Order Delivery Date', 'Unit Price (Tax Included)', 'Total (Tax Included)', 'Quantity']

  sheet.addRow(headers)

  sortedOrders.forEach((order) => {
    if (!order.items.length) {
      sheet.addRow([order.orderNo, order.inquiryCompany, order.productNameCn || '', '', '', '', order.quantity?.toString() || ''])
      return
    }

    order.items.forEach((item) => {
      sheet.addRow([
        order.orderNo,
        order.inquiryCompany,
        item.materialDescription || '',
        item.deliveryTime || '',
        item.quotedPrice?.toString() || '',
        item.taxIncludedTotal?.toString() || '',
        item.quantity?.toString() || ''
      ])
    })
  })

  sheet.columns = [
    { key: 'orderNo', width: 22 },
    { key: 'inquiryCompany', width: 28 },
    { key: 'materialName', width: 48 },
    { key: 'deliveryTime', width: 18 },
    { key: 'quotedPrice', width: 14 },
    { key: 'taxIncludedTotal', width: 14 },
    { key: 'quantity', width: 14 }
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = {
    from: 'A1',
    to: `G${Math.max(sheet.rowCount, 1)}`
  }

  for (let row = 1; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).height = row === 1 ? 24 : 30

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

  ;['E', 'F', 'G'].forEach((column) => {
    sheet.getColumn(column).numFmt = '#,##0.00'
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `Historical Order Search-${new Date().toISOString().slice(0, 10)}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  return res.send(Buffer.from(buffer))
}

export async function listMyOrders(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const parsed = orderListQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid query parameters',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const { page, pageSize, sortBy, sortOrder } = parsed.data
  const skip = (page - 1) * pageSize
  const userWhere: Prisma.OrderWhereInput = {
    creatorId: req.user.id
  }
  const { year, start, end } = getCurrentYearRange()
  const currentYearWhere: Prisma.OrderWhereInput = {
    creatorId: req.user.id,
    createdAt: {
      gte: start,
      lt: end
    }
  }

  const [allOrPagedOrders, total, yearCount, yearAmountStats] = await prisma.$transaction([
    prisma.order.findMany({
      where: userWhere,
      ...(sortBy === 'deliveryReminder' ? {} : { skip, take: pageSize }),
      orderBy: sortBy === 'deliveryReminder'
        ? { createdAt: 'desc' }
        : buildOrderBy(sortBy, sortOrder),
      include: orderListInclude
    }),
    prisma.order.count({ where: userWhere }),
    prisma.order.count({ where: currentYearWhere }),
    prisma.order.aggregate({
      where: currentYearWhere,
      _sum: {
        winningAmount: true,
        purchaseCost: true,
        profit: true
      }
    })
  ])
  const orders = sortBy === 'deliveryReminder'
    ? sortOrdersByDeliveryReminder(allOrPagedOrders, sortOrder).slice(skip, skip + pageSize)
    : allOrPagedOrders

  return res.json({
    summary: {
      ...buildMyOrdersSummary(year, yearCount, yearAmountStats._sum),
      profit: yearAmountStats._sum.profit?.toString() || '0'
    },
    items: orders.map(mapOrderListItem),
    pagination: {
      page,
      pageSize,
      total
    }
  })
}

function serializeCustomerPaymentSummary(summary: OrderCustomerPaymentSummary) {
  return {
    orderTotal: summary.orderTotal.toString(),
    paidAmount: summary.paidAmount.toString(),
    remainingAmount: summary.remainingAmount.toString(),
    state: summary.state,
    source: summary.source
  }
}

interface CustomerPaymentDetailRecord {
  id: string
  orderItemId: string | null
  paidAmount: Prisma.Decimal | number | string | null | undefined
  updatedAt: Date | string
  createdBy: {
    id: string
    username: string
    displayName: string | null
  }
}

export function mapOrderCustomerPaymentDetails<T extends CustomerPaymentDetailRecord>(order: {
  winningAmount: Prisma.Decimal | number | string | null | undefined
  customerPayments: T[]
}) {
  const orderPayment = order.customerPayments
    .filter((payment) => payment.orderItemId === null)
    .sort((left, right) => {
      const updatedAtDifference =
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

      return updatedAtDifference || right.id.localeCompare(left.id)
    })[0] || null
  const itemPayments = order.customerPayments.filter((payment) => payment.orderItemId !== null)
  const paymentSummary = buildOrderCustomerPaymentSummary({
    winningAmount: order.winningAmount,
    orderPayment,
    itemPayments
  })

  return {
    customerPayment: orderPayment
      ? {
          ...orderPayment,
          createdBy: {
            id: orderPayment.createdBy.id,
            username: orderPayment.createdBy.username,
            realName: orderPayment.createdBy.displayName
          }
        }
      : null,
    customerPaymentSummary: serializeCustomerPaymentSummary(paymentSummary)
  }
}

export async function getOrderById(req: Request, res: Response) {
  const id = String(req.params.id)
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true
        }
      },
      items: {
        include: {
          supplierQuotes: {
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true
                }
              },
              quoteFile: {
                select: {
                  id: true,
                  originalName: true,
                  storagePath: true
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          },
          purchaseInfo: {
            include: {
              purchaseContractFile: {
                select: {
                  id: true,
                  originalName: true,
                  storagePath: true
                }
              },
              paymentApplicationFile: {
                select: {
                  id: true,
                  originalName: true,
                  storagePath: true
                }
              },
              paymentApplications: {
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          purchaseBatch: {
            include: {
              purchaseContractFile: {
                select: {
                  id: true,
                  originalName: true,
                  storagePath: true
                }
              },
              paymentApplicationFile: {
                select: {
                  id: true,
                  originalName: true,
                  storagePath: true
                }
              },
              paymentApplications: {
                orderBy: { createdAt: 'desc' }
              },
              batchItems: {
                select: {
                  id: true,
                  lineNo: true,
                  materialCode: true,
                  materialDescription: true,
                  purchaseQuantity: true,
                  purchaseUnitPrice: true,
                  purchaseTotal: true,
                  currentStatus: true
                },
                orderBy: { lineNo: 'asc' }
              }
            }
          },
          shippingInfo: true,
          customerPayment: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  username: true,
                  displayName: true
                }
              }
            }
          }
        },
        orderBy: { lineNo: 'asc' }
      },
      supplierQuotes: {
        include: {
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          quoteFile: {
            select: {
              id: true,
              originalName: true,
              storagePath: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      statusRecords: {
        include: {
          operator: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      itemStatusRecords: {
        include: {
          orderItem: {
            select: {
              id: true,
              lineNo: true,
              materialCode: true,
              materialDescription: true
            }
          },
          operator: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      purchaseInfos: {
        include: {
          purchaseContractFile: {
            select: {
              id: true,
              originalName: true,
              storagePath: true
            }
          },
          paymentApplicationFile: {
            select: {
              id: true,
              originalName: true,
              storagePath: true
            }
          },
          paymentApplications: {
            orderBy: { createdAt: 'desc' }
          },
          batchItems: {
            select: {
              id: true,
              lineNo: true,
              materialCode: true,
              materialDescription: true,
              purchaseQuantity: true,
              purchaseUnitPrice: true,
              purchaseTotal: true,
              currentStatus: true
            },
            orderBy: { lineNo: 'asc' }
          }
        }
      },
      shippingInfos: true,
      shippingApplications: {
        include: {
          file: {
            select: {
              id: true,
              originalName: true,
              targetId: true,
              category: true
            }
          },
          batches: {
            include: {
              purchaseInfo: {
                include: {
                  batchItems: {
                    select: {
                      id: true,
                      lineNo: true,
                      materialCode: true,
                      materialDescription: true,
                      currentStatus: true
                    },
                    orderBy: { lineNo: 'asc' }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      customerPayments: {
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' }
        ],
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      },
      files: {
        include: {
          uploader: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const customerPaymentDetails = mapOrderCustomerPaymentDetails(order)

  return res.json({
    order: {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        customerPayment: item.customerPayment
          ? {
              ...item.customerPayment,
              createdBy: {
                id: item.customerPayment.createdBy.id,
                username: item.customerPayment.createdBy.username,
                realName: item.customerPayment.createdBy.displayName
              }
            }
          : null
      })),
      purchaseInfo: order.purchaseInfos[0] || null,
      shippingInfo: order.shippingInfos[0] || null,
      ...customerPaymentDetails,
      creator: {
        id: order.creator.id,
        username: order.creator.username,
        realName: order.creator.displayName
      },
      statusRecords: order.statusRecords.map((record) => ({
        ...record,
        operator: {
          id: record.operator.id,
          username: record.operator.username,
          realName: record.operator.displayName
        }
      })),
      itemStatusRecords: order.itemStatusRecords.map((record) => ({
        ...record,
        operator: {
          id: record.operator.id,
          username: record.operator.username,
          realName: record.operator.displayName
        }
      })),
      files: order.files.map((file) => ({
        ...file,
        url: `${env.fileBaseUrl}/${file.storagePath.replace(/^uploads\//, '')}`,
        uploader: {
          id: file.uploader.id,
          username: file.uploader.username,
          realName: file.uploader.displayName
        }
      }))
    }
  })
}

export async function updateOrderStatus(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const id = String(req.params.id)
  const parsed = updateOrderStatusSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid status details',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const { status, note } = parsed.data

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      currentStatus: true
    }
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  if (order.currentStatus === status) {
    return res.status(400).json({ message: 'The new status must differ from the current status' })
  }

  const nextStatuses = allowedStatusTransitions[order.currentStatus] || []

  if (!nextStatuses.includes(status)) {
    return res.status(400).json({ message: 'The current status cannot transition to the selected status' })
  }

  if (order.currentStatus === OrderStatus.PURCHASE_PAYMENT && status === OrderStatus.SHIPPED_TO_CUSTOMER && !isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'A manager must approve the payment request before shipping' })
  }

  if (order.currentStatus === OrderStatus.ARRIVED_COMPANY && status === OrderStatus.CUSTOMER_PAID && !isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'A manager must approve the shipping request before customer payment' })
  }

  const bidResult = getBidResultForStatus(status)

  const [updatedOrder, statusRecord] = await prisma.$transaction([
    prisma.order.update({
      where: { id },
      data: {
        currentStatus: status,
        ...(bidResult ? { bidResult } : {})
      },
      select: {
        id: true,
        currentStatus: true,
        bidResult: true,
        updatedAt: true
      }
    }),
    prisma.orderStatusRecord.create({
      data: {
        orderId: id,
        fromStatus: order.currentStatus,
        toStatus: status,
        note,
        operatorId: req.user.id
      },
      include: {
        operator: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })
  ])

  return res.json({
    message: 'Order status updated',
    order: updatedOrder,
    statusRecord: {
      ...statusRecord,
      operator: {
        id: statusRecord.operator.id,
        username: statusRecord.operator.username,
        realName: statusRecord.operator.displayName
      }
    }
  })
}

export async function updateOrderBasicInfo(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const parsed = updateOrderBasicInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid order details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true
    }
  })

  if (!existingOrder) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const inquiryDate = input.inquiryDate ? new Date(input.inquiryDate) : undefined
  const hasArrivedAtCompanyAt = Object.prototype.hasOwnProperty.call(input, 'arrivedAtCompanyAt')
  const arrivedAtCompanyAt = input.arrivedAtCompanyAt === null
    ? null
    : parseDate(input.arrivedAtCompanyAt)

  if (inquiryDate && Number.isNaN(inquiryDate.getTime())) {
    return res.status(400).json({ message: 'Invalid inquiry date format' })
  }

  if (hasArrivedAtCompanyAt && input.arrivedAtCompanyAt && !arrivedAtCompanyAt) {
    return res.status(400).json({ message: 'Invalid arrival date format' })
  }

  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          orderNo: input.orderNo,
          inquiryCompany: input.inquiryCompany,
          declarationCompany: input.declarationCompany || undefined,
          inquiryPerson: input.inquiryPerson,
          inquiryDate,
          inquiryNo: input.inquiryNo,
          productCode: input.productCode,
          productNameCn: input.productNameCn,
          modelSpec: input.modelSpec,
          quantity: toDecimal(input.quantity)
        }
      })

      if (hasArrivedAtCompanyAt) {
        const existingShippingInfo = await tx.shippingInfo.findFirst({
          where: {
            orderId,
            orderItemId: null
          },
          select: {
            id: true
          }
        })

        if (existingShippingInfo) {
          await tx.shippingInfo.update({
            where: { id: existingShippingInfo.id },
            data: { arrivedAtCompanyAt }
          })
        } else if (arrivedAtCompanyAt) {
          await tx.shippingInfo.create({
            data: {
              orderId,
              orderItemId: null,
              arrivedAtCompanyAt
            }
          })
        }
      }

      await tx.inquiry.updateMany({
        where: {
          // Match legacy generated inquiry numbers as well as English records.
          inquiryNo: { in: [buildOrderInquiryNo(existingOrder.orderNo), `正式订单-${existingOrder.orderNo}`] }
        },
        data: {
          inquiryNo: buildOrderInquiryNo(order.orderNo),
          inquiryCompany: order.inquiryCompany,
          inquiryPerson: order.inquiryPerson,
          inquiryDate: order.inquiryDate,
          remark: `Automatically generated from order ${order.orderNo}`
        }
      })

      return order
    })

    return res.json({ message: 'Order details updated', order: updatedOrder })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'Order number already exists. Please choose another' })
    }

    throw error
  }
}

interface OrderItemBasicInfoHandlerDependencies {
  transaction<T>(
    operation: (client: CustomerPaymentTransaction) => Promise<T>
  ): Promise<T>
  refreshOrderSummaryFromItems: typeof refreshOrderSummaryFromItems
}

export function createUpdateOrderItemBasicInfoHandler(
  dependencies: OrderItemBasicInfoHandlerDependencies = {
    transaction: (operation) => runSerializableTransactionWithRetry(prisma, operation),
    refreshOrderSummaryFromItems
  }
) {
  return async function updateOrderItemBasicInfoHandler(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    const orderId = String(req.params.id)
    const itemId = String(req.params.itemId)
    const parsed = updateOrderItemBasicInfoSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid order item details',
        errors: parsed.error.flatten().fieldErrors
      })
    }

    const input = parsed.data

    try {
      const result = await updateOrderItemAndRefresh(
        orderId,
        async (client) => {
          const existingItem = await client.orderItem.findFirst({
            where: {
              id: itemId,
              orderId
            },
            select: {
              id: true,
              bidResult: true,
              taxIncludedTotal: true
            }
          })

          if (!existingItem) {
            throw new OrderItemNotFoundError('Order item not found')
          }

          const winningAmountData = getItemWinningAmountUpdateData(
            existingItem.bidResult,
            existingItem.taxIncludedTotal,
            input.taxIncludedTotal
          )
          const item = await client.orderItem.update({
            where: { id: itemId },
            data: {
              materialCode: input.materialCode,
              materialDescription: input.materialDescription,
              remark: input.remark,
              supplierRemark: input.supplierRemark,
              manufacturer: input.manufacturer,
              quantity: toDecimal(input.quantity),
              unit: input.unit,
              quotedPrice: toDecimal(input.quotedPrice),
              ...winningAmountData,
              deliveryTime: input.deliveryTime,
              inquiryRemark: input.inquiryRemark,
              applicantDepartment: input.applicantDepartment
            }
          })

          return item
        },
        dependencies.transaction,
        dependencies.refreshOrderSummaryFromItems
      )

      return res.json({ message: 'Order item updated', item: result })
    } catch (error) {
      if (error instanceof OrderItemNotFoundError) {
        return res.status(404).json({ message: error.message })
      }

      if (isOrderPaymentConsistencyError(error)) {
        return res.status(400).json({ message: error.message })
      }

      throw error
    }
  }
}

export const updateOrderItemBasicInfo = createUpdateOrderItemBasicInfoHandler()

export async function updatePurchaseItemPricing(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const parsed = updatePurchaseItemPricingSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid purchase item pricing', errors: parsed.error.flatten().fieldErrors })
  }

  const inputItems = parsed.data.items
  const itemIds = Array.from(new Set(inputItems.map((item) => item.itemId)))
  const existingItems = await prisma.orderItem.findMany({
    where: {
      orderId,
      id: { in: itemIds }
    },
    select: { id: true }
  })

  if (existingItems.length !== itemIds.length) {
    return res.status(404).json({ message: 'Some purchase items were not found' })
  }

  await prisma.$transaction(inputItems.map((item) => prisma.orderItem.update({
    where: { id: item.itemId },
    data: {
      purchaseQuantity: toDecimal(item.purchaseQuantity),
      purchaseUnitPrice: toDecimal(item.purchaseUnitPrice),
      purchaseTotal: toDecimal(item.purchaseTotal)
    }
  })))

  return res.json({ message: `Saved purchase prices for ${inputItems.length} items` })
}

interface OrderItemStatusHandlerDependencies {
  orderItem: Pick<typeof prisma.orderItem, 'findFirst'>
  transaction<T>(
    operation: (client: CustomerPaymentTransaction) => Promise<T>
  ): Promise<T>
  refreshOrderSummaryFromItems: typeof refreshOrderSummaryFromItems
  isStatusTransitionAllowed: (currentStatus: OrderStatus, nextStatus: OrderStatus) => boolean
}

export function createUpdateOrderItemStatusHandler(
  dependencies: OrderItemStatusHandlerDependencies = {
    orderItem: prisma.orderItem,
    transaction: (operation) => runSerializableTransactionWithRetry(prisma, operation),
    refreshOrderSummaryFromItems,
    isStatusTransitionAllowed: (currentStatus, nextStatus) =>
      (allowedStatusTransitions[currentStatus] || []).includes(nextStatus)
  }
) {
  return async function updateOrderItemStatusHandler(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    const user = req.user
    const orderId = String(req.params.id)
    const itemId = String(req.params.itemId)
    const parsed = updateOrderItemStatusSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid item status details',
        errors: parsed.error.flatten().fieldErrors
      })
    }

    const { status, note, winningPrice, lostReason } = parsed.data

    try {
      const result = await dependencies.transaction(async (tx) => {
        const item = await tx.orderItem.findFirst({
          where: {
            id: itemId,
            orderId
          },
          select: {
            id: true,
            orderId: true,
            currentStatus: true,
            taxIncludedTotal: true
          }
        })

        if (!item) {
          return { kind: 'error' as const, statusCode: 404, message: 'Item not found' }
        }

        if (item.currentStatus === status) {
          return { kind: 'error' as const, statusCode: 400, message: 'The new status must differ from the current status' }
        }

        if (!dependencies.isStatusTransitionAllowed(item.currentStatus, status)) {
          return {
            kind: 'error' as const,
            statusCode: 400,
            message: 'The current item status cannot transition to the selected status'
          }
        }

        if (
          item.currentStatus === OrderStatus.PURCHASE_PAYMENT &&
          status === OrderStatus.SHIPPED_TO_CUSTOMER &&
          !isBossOrAdmin(user.role)
        ) {
          return {
            kind: 'error' as const,
            statusCode: 403,
            message: 'A manager must approve the payment request before shipping'
          }
        }

        if (
          item.currentStatus === OrderStatus.ARRIVED_COMPANY &&
          status === OrderStatus.CUSTOMER_PAID &&
          !isBossOrAdmin(user.role)
        ) {
          return {
            kind: 'error' as const,
            statusCode: 403,
            message: 'A manager must approve the shipping request before customer payment'
          }
        }

        if (status === OrderStatus.BID_LOST && !lostReason) {
          return { kind: 'error' as const, statusCode: 400, message: 'Please enter the reason for losing' }
        }

        const bidResult = getBidResultForStatus(status)
        const winningAmountData = getItemWinningAmountUpdateData(
          BidResult.WON,
          item.taxIncludedTotal,
          winningPrice
        )
        const updatedItem = await tx.orderItem.update({
          where: { id: itemId },
          data: {
            currentStatus: status,
            ...(bidResult ? { bidResult } : {}),
            ...(status === OrderStatus.BID_WON
              ? {
                  ...winningAmountData,
                  lostReason: null
                }
              : {}),
            ...(status === OrderStatus.BID_LOST
              ? {
                  winningAmount: null,
                  lostReason
                }
              : {})
          }
        })

        const statusRecord = await tx.orderItemStatusRecord.create({
          data: {
            orderId,
            orderItemId: itemId,
            fromStatus: item.currentStatus,
            toStatus: status,
            note,
            operatorId: user.id
          },
          include: {
            orderItem: {
              select: {
                id: true,
                lineNo: true,
                materialCode: true,
                materialDescription: true
              }
            },
            operator: {
              select: {
                id: true,
                username: true,
                displayName: true
              }
            }
          }
        })

        const updatedOrder = await dependencies.refreshOrderSummaryFromItems(
          orderId,
          tx
        )

        return { kind: 'success' as const, updatedItem, updatedOrder, statusRecord }
      })

      if (result.kind === 'error') {
        return res.status(result.statusCode).json({ message: result.message })
      }

      return res.json({
        message: 'Item status updated',
        item: result.updatedItem,
        order: result.updatedOrder,
        statusRecord: {
          ...result.statusRecord,
          operator: {
            id: result.statusRecord.operator.id,
            username: result.statusRecord.operator.username,
            realName: result.statusRecord.operator.displayName
          }
        }
      })
    } catch (error) {
      if (isOrderPaymentConsistencyError(error)) {
        return res.status(400).json({ message: error.message })
      }

      throw error
    }
  }
}

export const updateOrderItemStatus = createUpdateOrderItemStatusHandler()

export async function updateQuoteInfo(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const parsed = updateQuoteInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid supplier quote details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const orderItem = await ensureOrderItem(orderId, orderItemId)

  if (orderItemId && !orderItem) {
    return res.status(404).json({ message: 'Item not found' })
  }

  const supplier = await prisma.supplier.upsert({
    where: { name: input.supplierName },
    update: {
      contactName: input.contactName,
      phone: input.phone
    },
    create: {
      name: input.supplierName,
      contactName: input.contactName,
      phone: input.phone
    }
  })

  if (input.isSelected) {
    await prisma.supplierQuote.updateMany({
      where: { orderId, orderItemId: orderItemId || null },
      data: { isSelected: false, decision: 'REJECTED' }
    })
  }

  const quote = await prisma.supplierQuote.create({
    data: {
      orderId,
      orderItemId,
      supplierId: supplier.id,
      contactName: input.contactName,
      phone: input.phone,
      quotedPrice: new Prisma.Decimal(input.quotedPrice),
      deliveryTime: input.deliveryTime,
      remark: input.remark,
      quoteFileId: input.quoteFileId,
      isSelected: input.isSelected,
      decision: input.isSelected ? 'SELECTED' : 'PENDING',
      createdById: req.user.id
    },
    include: {
      supplier: true,
      quoteFile: true
    }
  })

  return res.status(201).json({ message: 'Supplier quote saved', quote })
}

export async function updateSupplierQuoteSelection(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const quoteId = String(req.params.quoteId)
  const isSelected = Boolean(req.body.isSelected)

  const quote = await prisma.supplierQuote.findFirst({
    where: {
      id: quoteId,
      orderId,
      ...(orderItemId ? { orderItemId } : {})
    },
    select: {
      id: true,
      orderId: true,
      orderItemId: true
    }
  })

  if (!quote) {
    return res.status(404).json({ message: 'Supplier quote not found' })
  }

  if (isSelected) {
    await prisma.supplierQuote.updateMany({
      where: {
        orderId,
        orderItemId: quote.orderItemId,
        id: {
          not: quoteId
        }
      },
      data: {
        isSelected: false,
        decision: 'REJECTED'
      }
    })
  }

  const updatedQuote = await prisma.supplierQuote.update({
    where: { id: quoteId },
    data: {
      isSelected,
      decision: isSelected ? 'SELECTED' : 'REJECTED'
    }
  })

  return res.json({ message: 'Quote selection updated', quote: updatedQuote })
}

export async function updateBidInfo(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const parsed = updateBidInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid quote details', errors: parsed.error.flatten().fieldErrors })
  }

  if (orderItemId) {
    const orderItem = await ensureOrderItem(orderId, orderItemId)

    if (!orderItem) {
      return res.status(404).json({ message: 'Item not found' })
    }

    const item = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: {
        quotedPrice: new Prisma.Decimal(parsed.data.bidPrice)
      },
      select: {
        id: true,
        quotedPrice: true
      }
    })

    return res.json({ message: 'Quote saved', item })
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      quotedAmount: new Prisma.Decimal(parsed.data.bidPrice)
    },
    select: {
      id: true,
      quotedAmount: true
    }
  })

  return res.json({ message: 'Quote saved', order })
}

interface WinningInfoHandlerDependencies {
  orderItem: Pick<typeof prisma.orderItem, 'findFirst' | 'update'>
  transaction<T>(
    operation: (client: CustomerPaymentTransaction) => Promise<T>
  ): Promise<T>
  refreshOrderSummaryFromItems: typeof refreshOrderSummaryFromItems
}

export function createUpdateWinningInfoHandler(
  dependencies: WinningInfoHandlerDependencies = {
    orderItem: prisma.orderItem,
    transaction: (operation) => runSerializableTransactionWithRetry(prisma, operation),
    refreshOrderSummaryFromItems
  }
) {
  return async function updateWinningInfoHandler(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const parsed = updateWinningInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid award result details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data

  if (!orderItemId) {
    return res.status(400).json({
      message: 'Update awarded item amounts to maintain the order total; the system calculates it automatically'
    })
  }

  if (input.result === 'LOST' && !input.lostReason) {
    return res.status(400).json({ message: 'Please enter the reason for losing' })
  }

  try {
    const result = await updateOrderItemAndRefresh(
      orderId,
      async (client) => {
        const orderItem = await client.orderItem.findFirst({
          where: {
            id: orderItemId,
            orderId
          },
          select: {
            id: true,
            taxIncludedTotal: true
          }
        })

        if (!orderItem) {
          throw new OrderItemNotFoundError('Item not found')
        }

        const winningAmountData = getItemWinningAmountUpdateData(
          BidResult.WON,
          orderItem.taxIncludedTotal,
          input.winningPrice
        )
        const item = await client.orderItem.update({
          where: { id: orderItemId },
          data:
            input.result === 'WON'
              ? {
                  bidResult: BidResult.WON,
                  ...winningAmountData,
                  lostReason: null
                }
              : {
                  bidResult: BidResult.LOST,
                  lostReason: input.lostReason,
                  winningAmount: null
                },
          select: {
            id: true,
            bidResult: true,
            winningAmount: true,
            lostReason: true
          }
        })

        return item
      },
      dependencies.transaction,
      dependencies.refreshOrderSummaryFromItems
    )

    return res.json({ message: 'Award result saved', item: result })
  } catch (error) {
    if (error instanceof OrderItemNotFoundError) {
      return res.status(404).json({ message: error.message })
    }

    if (isOrderPaymentConsistencyError(error)) {
      return res.status(400).json({ message: error.message })
    }

    throw error
  }

  }
}

export const updateWinningInfo = createUpdateWinningInfoHandler()

export async function updatePurchaseInfo(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const parsed = updatePurchaseInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid purchase details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const orderItem = await ensureOrderItem(orderId, orderItemId)

  if (orderItemId && !orderItem) {
    return res.status(404).json({ message: 'Item not found' })
  }

  const updateData = {
    purchaseContractFileId: input.purchaseContractFileId,
    paymentApplicationFileId: input.paymentApplicationFileId,
    purchaseCost: input.purchaseCost !== undefined ? new Prisma.Decimal(input.purchaseCost) : undefined,
    supplierName: input.supplierName,
    deliveryTime: input.deliveryTime,
    paymentPercent: input.paymentPercent !== undefined ? new Prisma.Decimal(input.paymentPercent) : undefined,
    bankName: input.bankName,
    bankAccount: input.bankAccount,
    advancePaymentAmount: input.advancePaymentAmount !== undefined ? new Prisma.Decimal(input.advancePaymentAmount) : undefined,
    advancePaymentStatus: input.advancePaymentStatus || undefined,
    arrivalPaymentAmount: input.arrivalPaymentAmount !== undefined ? new Prisma.Decimal(input.arrivalPaymentAmount) : undefined,
    arrivalPaymentStatus: input.arrivalPaymentStatus || undefined,
    supplierLogisticsCompany: input.supplierLogisticsCompany,
    supplierTrackingNo: input.supplierLogisticsNo,
    invoiceStatus: input.invoiceStatus || undefined
  }
  const createData = {
    orderId,
    orderItemId,
    purchaseContractFileId: input.purchaseContractFileId,
    paymentApplicationFileId: input.paymentApplicationFileId,
    purchaseCost: new Prisma.Decimal(input.purchaseCost || 0),
    supplierName: input.supplierName,
    deliveryTime: input.deliveryTime,
    paymentPercent: input.paymentPercent !== undefined ? new Prisma.Decimal(input.paymentPercent) : undefined,
    bankName: input.bankName,
    bankAccount: input.bankAccount,
    advancePaymentAmount: new Prisma.Decimal(input.advancePaymentAmount || 0),
    advancePaymentStatus: input.advancePaymentStatus || PaymentStatus.UNPAID,
    arrivalPaymentAmount: new Prisma.Decimal(input.arrivalPaymentAmount || 0),
    arrivalPaymentStatus: input.arrivalPaymentStatus || PaymentStatus.UNPAID,
    supplierLogisticsCompany: input.supplierLogisticsCompany,
    supplierTrackingNo: input.supplierLogisticsNo,
    invoiceStatus: input.invoiceStatus || InvoiceStatus.NOT_RECEIVED
  }
  const existingPurchaseInfo = orderItemId
    ? null
    : await prisma.purchaseInfo.findFirst({ where: { orderId, orderItemId: null }, select: { id: true } })
  const purchaseInfo = orderItemId
    ? await prisma.purchaseInfo.upsert({
        where: { orderItemId },
        update: updateData,
        create: createData
      })
    : existingPurchaseInfo
      ? await prisma.purchaseInfo.update({ where: { id: existingPurchaseInfo.id }, data: updateData })
      : await prisma.purchaseInfo.create({ data: createData })

  await refreshOrderPurchaseCost(orderId)

  return res.json({ message: 'Purchase details saved', purchaseInfo })
}

export async function updatePurchaseBatch(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const batchId = req.params.batchId ? String(req.params.batchId) : undefined
  const parsed = updatePurchaseBatchSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid purchase batch details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const nextStatus = input.submitForApproval ? OrderStatus.PURCHASE_PAYMENT : OrderStatus.PURCHASING

  if (input.itemPricing?.some((pricing) => !input.itemIds.includes(pricing.itemId))) {
    return res.status(400).json({ message: 'Purchase prices may only include the selected items' })
  }

  if (input.submitForApproval && (input.paymentPercent === undefined || !input.bankName || !input.bankAccount)) {
    return res.status(400).json({ message: 'Please enter the payment percentage, bank and account number' })
  }

  if (input.submitForApproval && new Prisma.Decimal(input.paymentPercent || 0).lessThanOrEqualTo(0)) {
    return res.status(400).json({ message: 'Payment percentage must be greater than 0' })
  }

  let existingApplications: Array<{
    paymentPercent: Prisma.Decimal
    status: PaymentApplicationStatus
  }> = []

  if (batchId) {
    const [existingBatch, applications] = await Promise.all([
      prisma.purchaseInfo.findFirst({
        where: {
          id: batchId,
          orderId
        },
        select: {
          purchaseCost: true,
          batchItems: {
            select: {
              id: true
            }
          }
        }
      }),
      prisma.purchasePaymentApplication.findMany({
      where: { purchaseInfoId: batchId },
      select: {
        paymentPercent: true,
        status: true
      }
      })
    ])

    if (!existingBatch) {
      return res.status(404).json({ message: 'Purchase batch not found' })
    }

    existingApplications = applications
    const currentItemIds = existingBatch.batchItems.map((item) => item.id).sort()
    const nextItemIds = [...input.itemIds].sort()
    const itemMembershipChanged = currentItemIds.length !== nextItemIds.length
      || currentItemIds.some((itemId, index) => itemId !== nextItemIds[index])
    const purchaseCostChanged = input.purchaseCost !== undefined
      && !existingBatch.purchaseCost.equals(input.purchaseCost)
    const activeApplication = existingApplications.find((application) => application.status !== PaymentApplicationStatus.REJECTED)

    if ((itemMembershipChanged || purchaseCostChanged) && activeApplication?.status === PaymentApplicationStatus.PENDING) {
      return res.status(409).json({
        message: 'This batch has a pending payment request. A manager must reject it before items or total cost can be changed'
      })
    }

    if ((itemMembershipChanged || purchaseCostChanged) && activeApplication?.status === PaymentApplicationStatus.APPROVED) {
      return res.status(409).json({
        message: 'This batch has approved payments. Items and total cost cannot be changed; create a new batch for additional items'
      })
    }
  }

  if (input.submitForApproval && batchId) {
    const hasPendingApplication = existingApplications.some((application) => application.status === PaymentApplicationStatus.PENDING)

    if (hasPendingApplication) {
      return res.status(400).json({ message: 'This batch has a payment request awaiting manager approval. Complete its review before submitting another request' })
    }

    const approvedPercent = sumDecimals(
      existingApplications
        .filter((application) => application.status === PaymentApplicationStatus.APPROVED)
        .map((application) => application.paymentPercent)
    )
    const nextApprovedPercent = approvedPercent.plus(input.paymentPercent || 0)

    if (nextApprovedPercent.greaterThan(100)) {
      return res.status(400).json({ message: `Cumulative payments for this batch cannot exceed 100%; currently approved: ${approvedPercent.toString()}%` })
    }
  }

	  const items = await prisma.orderItem.findMany({
	    where: {
	      id: { in: input.itemIds },
	      orderId
	    },
	    select: {
	      id: true,
	      currentStatus: true,
	      purchaseBatchId: true
	    }
	  })

  if (items.length !== input.itemIds.length) {
    return res.status(404).json({ message: 'Some items were not found' })
  }

  const blockedItem = items.find((item) => input.submitForApproval
    ? item.currentStatus !== OrderStatus.PURCHASING
    : item.currentStatus !== OrderStatus.PURCHASING && item.currentStatus !== OrderStatus.PURCHASE_PAYMENT
  )

	  if (blockedItem) {
	    return res.status(400).json({
	      message: input.submitForApproval ? 'Payment requests can only be submitted for items in purchasing' : 'Only items in purchasing or awaiting payment approval can be batched'
	    })
	  }

	  const occupiedItem = items.find((item) => item.purchaseBatchId && item.purchaseBatchId !== batchId)

	  if (occupiedItem) {
	    return res.status(400).json({ message: 'Selected items already belong to another purchase batch' })
	  }

  const result = await prisma.$transaction(async (tx) => {
    const existingPurchaseInfo = batchId
      ? await tx.purchaseInfo.findUnique({ where: { id: batchId }, select: { purchaseCost: true } })
      : null
    const effectivePurchaseCost = input.purchaseCost !== undefined
      ? new Prisma.Decimal(input.purchaseCost)
      : existingPurchaseInfo?.purchaseCost || new Prisma.Decimal(0)
    const calculatedPaymentAmounts = calculatePaymentAmounts(effectivePurchaseCost, input.paymentPercent)
    const purchaseInfo = batchId
      ? await tx.purchaseInfo.update({
          where: { id: batchId },
          data: {
            purchaseContractFileId: input.purchaseContractFileId,
            paymentApplicationFileId: input.paymentApplicationFileId,
            purchaseCost: input.purchaseCost !== undefined ? effectivePurchaseCost : undefined,
            supplierName: input.supplierName,
            deliveryTime: input.deliveryTime,
            paymentPercent: input.paymentPercent !== undefined ? new Prisma.Decimal(input.paymentPercent) : undefined,
            bankName: input.bankName,
            bankAccount: input.bankAccount,
            advancePaymentAmount: resolvePaymentAmount(input.advancePaymentAmount, calculatedPaymentAmounts.advancePaymentAmount),
            advancePaymentStatus: input.advancePaymentStatus || undefined,
            arrivalPaymentAmount: resolvePaymentAmount(input.arrivalPaymentAmount, calculatedPaymentAmounts.arrivalPaymentAmount),
            arrivalPaymentStatus: input.arrivalPaymentStatus || undefined,
            supplierLogisticsCompany: input.supplierLogisticsCompany,
            supplierTrackingNo: input.supplierLogisticsNo,
            invoiceStatus: input.invoiceStatus || undefined
          }
        })
      : await tx.purchaseInfo.create({
          data: {
            orderId,
            orderItemId: null,
            purchaseContractFileId: input.purchaseContractFileId,
            paymentApplicationFileId: input.paymentApplicationFileId,
            purchaseCost: effectivePurchaseCost,
            supplierName: input.supplierName,
            deliveryTime: input.deliveryTime,
            paymentPercent: input.paymentPercent !== undefined ? new Prisma.Decimal(input.paymentPercent) : undefined,
            bankName: input.bankName,
            bankAccount: input.bankAccount,
            advancePaymentAmount: resolvePaymentAmount(input.advancePaymentAmount, calculatedPaymentAmounts.advancePaymentAmount) || new Prisma.Decimal(0),
            advancePaymentStatus: input.advancePaymentStatus || PaymentStatus.UNPAID,
            arrivalPaymentAmount: resolvePaymentAmount(input.arrivalPaymentAmount, calculatedPaymentAmounts.arrivalPaymentAmount) || new Prisma.Decimal(0),
            arrivalPaymentStatus: input.arrivalPaymentStatus || PaymentStatus.UNPAID,
            supplierLogisticsCompany: input.supplierLogisticsCompany,
            supplierTrackingNo: input.supplierLogisticsNo,
            invoiceStatus: input.invoiceStatus || InvoiceStatus.NOT_RECEIVED
          }
        })

    if (input.submitForApproval) {
      await tx.purchasePaymentApplication.create({
        data: {
          orderId,
          purchaseInfoId: purchaseInfo.id,
          paymentPercent: new Prisma.Decimal(input.paymentPercent || 0),
          advancePaymentAmount: resolvePaymentAmount(input.advancePaymentAmount, calculatedPaymentAmounts.advancePaymentAmount) || new Prisma.Decimal(0),
          arrivalPaymentAmount: resolvePaymentAmount(input.arrivalPaymentAmount, calculatedPaymentAmounts.arrivalPaymentAmount) || new Prisma.Decimal(0),
          bankName: input.bankName,
          bankAccount: input.bankAccount,
          remark: input.paymentRemark,
          createdById: req.user!.id
        }
      })
    }

	    if (batchId) {
	      await tx.orderItem.updateMany({
	        where: {
	          orderId,
	          purchaseBatchId: purchaseInfo.id,
	          id: { notIn: input.itemIds }
	        },
	        data: {
	          purchaseBatchId: null
	        }
	      })
	    }

    await tx.orderItem.updateMany({
      where: { id: { in: input.itemIds }, orderId },
      data: {
        purchaseBatchId: purchaseInfo.id,
        currentStatus: input.submitForApproval ? nextStatus : undefined
      }
    })

    if (input.itemPricing?.length) {
      await Promise.all(input.itemPricing.map((pricing) => tx.orderItem.update({
        where: { id: pricing.itemId },
        data: {
          purchaseQuantity: toDecimal(pricing.purchaseQuantity),
          purchaseUnitPrice: toDecimal(pricing.purchaseUnitPrice),
          purchaseTotal: toDecimal(pricing.purchaseTotal)
        }
      })))
    }

    if (input.submitForApproval) {
      await tx.orderItemStatusRecord.createMany({
        data: items
          .filter((item) => item.currentStatus !== OrderStatus.PURCHASE_PAYMENT)
          .map((item) => ({
            orderId,
            orderItemId: item.id,
            fromStatus: item.currentStatus,
            toStatus: OrderStatus.PURCHASE_PAYMENT,
            note: 'Payment request submitted',
            operatorId: req.user!.id
          }))
      })
    }

    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        currentStatus: true,
        winningAmount: true
      }
    })

    await tx.order.update({
      where: { id: orderId },
      data: {
        currentStatus: summarizeItemStatuses(orderItems)
      }
    })

    return purchaseInfo
  })

  await refreshOrderPurchaseCost(orderId)

  return res.json({
    message: input.submitForApproval ? 'Payment request submitted for manager approval' : 'Purchase details saved. Please complete the payment request',
    purchaseInfo: result
  })
}

export async function updatePurchaseBatchBasicInfo(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const parsed = updatePurchaseBatchBasicInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid purchase batch details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const purchaseInfo = await prisma.purchaseInfo.findFirst({
    where: {
      id: batchId,
      orderId
    },
    select: {
      id: true,
      purchaseCost: true,
      batchItems: {
        select: {
          id: true
        }
      },
      paymentApplications: {
        where: {
          status: {
            in: [PaymentApplicationStatus.PENDING, PaymentApplicationStatus.APPROVED]
          }
        },
        select: {
          status: true
        }
      }
    }
  })

  if (!purchaseInfo || !purchaseInfo.batchItems.length) {
    return res.status(404).json({ message: 'Purchase batch not found or contains no items' })
  }

  const purchaseCostChanged = input.purchaseCost !== undefined
    && !purchaseInfo.purchaseCost.equals(input.purchaseCost)

  if (purchaseCostChanged && purchaseInfo.paymentApplications.some((application) => application.status === PaymentApplicationStatus.PENDING)) {
    return res.status(409).json({ message: 'This batch has a pending payment request. A manager must reject it before total cost can be changed' })
  }

  if (purchaseCostChanged && purchaseInfo.paymentApplications.some((application) => application.status === PaymentApplicationStatus.APPROVED)) {
    return res.status(409).json({ message: 'This batch has approved payments. Total cost cannot be changed' })
  }

  const updated = await prisma.purchaseInfo.update({
    where: { id: batchId },
    data: {
      purchaseCost: input.purchaseCost !== undefined ? new Prisma.Decimal(input.purchaseCost) : undefined,
      supplierName: input.supplierName,
      deliveryTime: input.deliveryTime
    }
  })

  await refreshOrderPurchaseCost(orderId)

  return res.json({ message: 'Purchase batch updated', purchaseInfo: updated })
}

export async function approvePurchaseBatch(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Only managers can approve purchase batches' })
  }

  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const [batchItems, pendingApplication] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        orderId,
        purchaseBatchId: batchId
      },
      select: {
        id: true,
        currentStatus: true
      }
    }),
    prisma.purchasePaymentApplication.findFirst({
      where: {
        orderId,
        purchaseInfoId: batchId,
        status: PaymentApplicationStatus.PENDING
      },
      orderBy: { createdAt: 'asc' }
    })
  ])

  if (!batchItems.length) {
    return res.status(404).json({ message: 'Purchase batch not found or contains no items' })
  }

  if (!pendingApplication) {
    return res.status(404).json({ message: 'This batch has no pending payment request' })
  }

  const blockedItem = batchItems.find((item) => item.currentStatus !== OrderStatus.PURCHASE_PAYMENT)

  if (blockedItem) {
    return res.status(400).json({ message: 'Some items in this batch have not reached payment approval' })
  }

  const approvedPercent = await prisma.$transaction(async (tx) => {
    await tx.purchasePaymentApplication.update({
      where: { id: pendingApplication.id },
      data: {
        status: PaymentApplicationStatus.APPROVED,
        approvedById: req.user!.id,
        approvedAt: new Date()
      }
    })

    const approvedApplications = await tx.purchasePaymentApplication.findMany({
      where: {
        purchaseInfoId: batchId,
        status: PaymentApplicationStatus.APPROVED
      },
      select: {
        paymentPercent: true
      }
    })
    const totalApprovedPercent = sumDecimals(approvedApplications.map((application) => application.paymentPercent))
    const nextStatus = totalApprovedPercent.greaterThanOrEqualTo(100) ? OrderStatus.SHIPPED_TO_CUSTOMER : OrderStatus.PURCHASING

    await tx.orderItem.updateMany({
      where: {
        orderId,
        purchaseBatchId: batchId
      },
      data: {
        currentStatus: nextStatus
      }
    })

    await tx.orderItemStatusRecord.createMany({
      data: batchItems.map((item) => ({
        orderId,
        orderItemId: item.id,
        fromStatus: item.currentStatus,
        toStatus: nextStatus,
        note: nextStatus === OrderStatus.SHIPPED_TO_CUSTOMER
          ? 'Approved payments have reached 100%; moving to shipping'
          : `Payment request approved; cumulative payments: ${totalApprovedPercent.toString()}%. Awaiting further requests`,
        operatorId: req.user!.id
      }))
    })

    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        currentStatus: true,
        winningAmount: true
      }
    })

    await tx.order.update({
      where: { id: orderId },
      data: {
        currentStatus: summarizeItemStatuses(orderItems)
      }
    })

    return totalApprovedPercent
  })

  return res.json({
    message: approvedPercent.greaterThanOrEqualTo(100)
      ? 'Approved payments have reached 100%; moved to shipping'
      : `Payment request approved; cumulative payments: ${approvedPercent.toString()}%. Further requests may be submitted up to 100%`
  })
}

export async function rejectPurchaseBatch(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Only managers can reject payment requests' })
  }

  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const [batchItems, pendingApplication] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        orderId,
        purchaseBatchId: batchId
      },
      select: {
        id: true,
        currentStatus: true
      }
    }),
    prisma.purchasePaymentApplication.findFirst({
      where: {
        orderId,
        purchaseInfoId: batchId,
        status: PaymentApplicationStatus.PENDING
      },
      orderBy: { createdAt: 'asc' }
    })
  ])

  if (!batchItems.length) {
    return res.status(404).json({ message: 'Purchase batch not found or contains no items' })
  }

  if (!pendingApplication) {
    return res.status(404).json({ message: 'This batch has no payment request awaiting rejection' })
  }

  const blockedItem = batchItems.find((item) => item.currentStatus !== OrderStatus.PURCHASE_PAYMENT)

  if (blockedItem) {
    return res.status(400).json({ message: 'Some items in this batch have not reached payment approval' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchasePaymentApplication.update({
      where: { id: pendingApplication.id },
      data: {
        status: PaymentApplicationStatus.REJECTED,
        approvedById: req.user!.id,
        approvedAt: new Date()
      }
    })

    await tx.orderItem.updateMany({
      where: {
        orderId,
        purchaseBatchId: batchId
      },
      data: {
        currentStatus: OrderStatus.PURCHASING
      }
    })

    await tx.orderItemStatusRecord.createMany({
      data: batchItems.map((item) => ({
        orderId,
        orderItemId: item.id,
        fromStatus: item.currentStatus,
        toStatus: OrderStatus.PURCHASING,
        note: 'Payment request rejected. It can be resubmitted',
        operatorId: req.user!.id
      }))
    })

    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        currentStatus: true,
        winningAmount: true
      }
    })

    await tx.order.update({
      where: { id: orderId },
      data: {
        currentStatus: summarizeItemStatuses(orderItems)
      }
    })
  })

  return res.json({ message: 'Payment request rejected. Staff may resubmit it' })
}

async function reviewShippingBatch(req: Request, res: Response, decision: ShippingApprovalDecision) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Only managers can approve shipping requests' })
  }

  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const batchItems = await prisma.orderItem.findMany({
    where: {
      orderId,
      purchaseBatchId: batchId
    },
    select: {
      id: true,
      currentStatus: true
    }
  })

  if (!batchItems.length) {
    return res.status(404).json({ message: 'Purchase batch not found or contains no items' })
  }

  if (batchItems.some((item) => item.currentStatus !== OrderStatus.ARRIVED_COMPANY)) {
    return res.status(400).json({ message: 'Some items in this batch have not reached shipping approval' })
  }

  const transition = getShippingApprovalTransition(decision)

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: {
        orderId,
        purchaseBatchId: batchId
      },
      data: {
        currentStatus: transition.nextStatus
      }
    })

    await tx.orderItemStatusRecord.createMany({
      data: batchItems.map((item) => ({
        orderId,
        orderItemId: item.id,
        fromStatus: item.currentStatus,
        toStatus: transition.nextStatus,
        note: transition.note,
        operatorId: req.user!.id
      }))
    })

    const orderItems = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        currentStatus: true,
        winningAmount: true
      }
    })

    await tx.order.update({
      where: { id: orderId },
      data: {
        currentStatus: summarizeItemStatuses(orderItems)
      }
    })
  })

  return res.json({
    message: decision === 'APPROVE'
      ? 'Shipping request approved'
      : 'Shipping request rejected. Staff may revise and resubmit it'
  })
}

export async function approveShippingBatch(req: Request, res: Response) {
  return reviewShippingBatch(req, res, 'APPROVE')
}

export async function rejectShippingBatch(req: Request, res: Response) {
  return reviewShippingBatch(req, res, 'REJECT')
}

class ShippingApplicationRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
  }
}

function isShippingApplicationConcurrencyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}

export async function createShippingApplication(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const parsed = createShippingApplicationSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid shipping request details',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  let batchIds: string[]

  try {
    batchIds = normalizeShippingBatchIds(parsed.data.batchIds)
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Purchase batches must be unique' })
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const [order, file, purchaseBatches, conflictingApplication] = await Promise.all([
        tx.order.findUnique({
          where: { id: orderId },
          select: { id: true }
        }),
        tx.file.findFirst({
          where: {
            id: parsed.data.fileId,
            orderId,
            category: FileCategory.SHIPPING_APPLICATION
          },
          select: { id: true, uploaderId: true, originalName: true }
        }),
        tx.purchaseInfo.findMany({
          where: {
            id: { in: batchIds },
            orderId
          },
          include: {
            batchItems: {
              select: {
                id: true,
                currentStatus: true
              }
            }
          }
        }),
        tx.shippingApplication.findFirst({
          where: {
            status: ShippingApplicationStatus.PENDING,
            batches: {
              some: {
                purchaseInfoId: { in: batchIds }
              }
            }
          },
          select: { id: true }
        })
      ])

      if (!order) {
        throw new ShippingApplicationRequestError(404, 'Order not found')
      }

      if (!file) {
        throw new ShippingApplicationRequestError(400, 'Shipping approval Excel file not found or does not belong to this order')
      }

      if (!isBossOrAdmin(req.user!.role) && file.uploaderId !== req.user!.id) {
        throw new ShippingApplicationRequestError(403, 'You can only use shipping approval Excel files that you uploaded')
      }

      if (!/\.xlsx?$/i.test(file.originalName)) {
        throw new ShippingApplicationRequestError(400, 'Shipping approval file must be .xls or .xlsx')
      }

      if (purchaseBatches.length !== batchIds.length) {
        throw new ShippingApplicationRequestError(404, 'Some purchase batches were not found or do not belong to this order')
      }

      if (conflictingApplication) {
        throw new ShippingApplicationRequestError(409, 'Selected purchase batches already have a pending shipping request')
      }

      const emptyBatch = purchaseBatches.find((batch) => !batch.batchItems.length)
      const blockedBatch = purchaseBatches.find((batch) => batch.batchItems.some((item) => item.currentStatus !== OrderStatus.SHIPPED_TO_CUSTOMER))

      if (emptyBatch) {
        throw new ShippingApplicationRequestError(400, 'Purchase batch contains no items')
      }

      if (blockedBatch) {
        throw new ShippingApplicationRequestError(409, 'Only batches with all items in shipping can be selected')
      }

      const batchItems = purchaseBatches.flatMap((batch) => batch.batchItems)
      const movedItems = await tx.orderItem.updateMany({
        where: {
          id: { in: batchItems.map((item) => item.id) },
          orderId,
          currentStatus: OrderStatus.SHIPPED_TO_CUSTOMER
        },
        data: { currentStatus: OrderStatus.ARRIVED_COMPANY }
      })

      if (movedItems.count !== batchItems.length) {
        throw new ShippingApplicationRequestError(409, 'Purchase batch status changed. Please refresh and resubmit')
      }

      const created = await tx.shippingApplication.create({
        data: {
          orderId,
          fileId: parsed.data.fileId,
          logisticsCompany: parsed.data.logisticsCompany,
          trackingNo: parsed.data.trackingNo,
          remark: parsed.data.remark,
          createdById: req.user!.id,
          batches: {
            create: batchIds.map((purchaseInfoId) => ({ purchaseInfoId }))
          }
        }
      })

      await tx.orderItemStatusRecord.createMany({
        data: batchItems.map((item) => ({
          orderId,
          orderItemId: item.id,
          fromStatus: item.currentStatus,
          toStatus: OrderStatus.ARRIVED_COMPANY,
          note: 'Combined shipping request submitted',
          operatorId: req.user!.id
        }))
      })

      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { currentStatus: true, winningAmount: true }
      })

      await tx.order.update({
        where: { id: orderId },
        data: { currentStatus: summarizeItemStatuses(orderItems) }
      })

      return created
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })

    return res.status(201).json({
      message: `Shipping request submitted for ${batchIds.length} purchase batches; awaiting manager approval`,
      application
    })
  } catch (error) {
    if (error instanceof ShippingApplicationRequestError) {
      return res.status(error.statusCode).json({ message: error.message })
    }

    if (isShippingApplicationConcurrencyError(error)) {
      return res.status(409).json({ message: 'Purchase batch status was updated by another operation. Please refresh and retry' })
    }

    throw error
  }
}

async function reviewGroupedShippingApplication(req: Request, res: Response, decision: GroupedShippingDecision) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Only managers can approve shipping requests' })
  }

  const orderId = String(req.params.id)
  const applicationId = String(req.params.applicationId)
  try {
    const batchCount = await prisma.$transaction(async (tx) => {
      const application = await tx.shippingApplication.findFirst({
        where: {
          id: applicationId,
          orderId,
          status: ShippingApplicationStatus.PENDING
        },
        include: {
          batches: {
            include: {
              purchaseInfo: {
                include: {
                  batchItems: {
                    select: {
                      id: true,
                      currentStatus: true
                    }
                  }
                }
              }
            }
          }
        }
      })

      if (!application) {
        throw new ShippingApplicationRequestError(404, 'Combined shipping request not found or already reviewed')
      }

      const batchItems = application.batches.flatMap((batch) => batch.purchaseInfo.batchItems)

      if (!batchItems.length || batchItems.some((item) => item.currentStatus !== OrderStatus.ARRIVED_COMPANY)) {
        throw new ShippingApplicationRequestError(409, 'A batch in this request is no longer awaiting shipping approval')
      }

      const transition = getGroupedShippingTransition(decision)
      const reviewedAt = new Date()
      const claimedApplication = await tx.shippingApplication.updateMany({
        where: {
          id: application.id,
          status: ShippingApplicationStatus.PENDING
        },
        data: {
          status: transition.applicationStatus,
          approvedById: req.user!.id,
          approvedAt: reviewedAt
        }
      })

      if (claimedApplication.count !== 1) {
        throw new ShippingApplicationRequestError(409, 'This shipping request was reviewed by someone else. Please refresh the list')
      }

      const movedItems = await tx.orderItem.updateMany({
        where: {
          id: { in: batchItems.map((item) => item.id) },
          orderId,
          currentStatus: OrderStatus.ARRIVED_COMPANY
        },
        data: { currentStatus: transition.nextStatus }
      })

      if (movedItems.count !== batchItems.length) {
        throw new ShippingApplicationRequestError(409, 'Purchase batch status changed. Please refresh before reviewing again')
      }

      await tx.orderItemStatusRecord.createMany({
        data: batchItems.map((item) => ({
          orderId,
          orderItemId: item.id,
          fromStatus: transition.fromStatus,
          toStatus: transition.nextStatus,
          note: transition.note,
          operatorId: req.user!.id
        }))
      })

      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { currentStatus: true, winningAmount: true }
      })

      await tx.order.update({
        where: { id: orderId },
        data: { currentStatus: summarizeItemStatuses(orderItems) }
      })

      return application.batches.length
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })

    return res.json({
      message: decision === 'APPROVE'
        ? `Approved ${batchCount} purchase batches`
        : `Rejected ${batchCount} purchase batches. Staff may revise and resubmit`
    })
  } catch (error) {
    if (error instanceof ShippingApplicationRequestError) {
      return res.status(error.statusCode).json({ message: error.message })
    }

    if (isShippingApplicationConcurrencyError(error)) {
      return res.status(409).json({ message: 'This shipping request was updated by another operation. Please refresh and retry' })
    }

    throw error
  }
}

export async function approveShippingApplication(req: Request, res: Response) {
  return reviewGroupedShippingApplication(req, res, 'APPROVE')
}

export async function rejectShippingApplication(req: Request, res: Response) {
  return reviewGroupedShippingApplication(req, res, 'REJECT')
}

export async function updatePurchaseBatchContract(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const rawFileId = req.body.purchaseContractFileId
  const purchaseContractFileId = rawFileId === null || rawFileId === '' || rawFileId === undefined
    ? null
    : String(rawFileId)

  const purchaseInfo = await prisma.purchaseInfo.findFirst({
    where: {
      id: batchId,
      orderId
    },
    select: {
      id: true
    }
  })

  if (!purchaseInfo) {
    return res.status(404).json({ message: 'Purchase batch not found' })
  }

  if (purchaseContractFileId) {
    const file = await prisma.file.findFirst({
      where: {
        id: purchaseContractFileId,
        orderId,
        category: FileCategory.PURCHASE_CONTRACT
      },
      select: {
        id: true
      }
    })

    if (!file) {
      return res.status(404).json({ message: 'Purchase contract file not found' })
    }
  }

  const updated = await prisma.purchaseInfo.update({
    where: { id: batchId },
    data: {
      purchaseContractFileId
    },
    include: {
      purchaseContractFile: {
        select: {
          id: true,
          originalName: true,
          storagePath: true
        }
      }
    }
  })

  return res.json({
    message: purchaseContractFileId ? 'Purchase contract replaced' : 'Purchase contract removed',
    purchaseInfo: updated
  })
}

export async function approveOrderPaymentApplication(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!isBossOrAdmin(req.user.role)) {
    return res.status(403).json({ message: 'Only managers can approve payment requests' })
  }

  return res.status(400).json({ message: 'Please review payment requests individually by batch' })
}

export async function exportOrderPaymentApplication(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      creator: {
        select: {
          username: true,
          displayName: true
        }
      },
      purchaseInfos: {
        include: {
          paymentApplications: {
            orderBy: { createdAt: 'desc' }
          },
          batchItems: {
            select: {
              lineNo: true,
              materialCode: true,
              materialDescription: true,
              deliveryTime: true,
              currentStatus: true
            },
            orderBy: { lineNo: 'asc' }
          }
        },
        orderBy: { updatedAt: 'asc' }
      }
    }
  })

  const pendingPurchaseInfos = order?.purchaseInfos.filter((purchaseInfo) =>
    purchaseInfo.batchItems.some((item) => item.currentStatus === OrderStatus.PURCHASE_PAYMENT)
  ) || []
  const exportPurchaseInfos = pendingPurchaseInfos.length
    ? pendingPurchaseInfos
    : order?.purchaseInfos.filter((purchaseInfo) => purchaseInfo.batchItems.length > 0) || []

  if (!order || !exportPurchaseInfos.length) {
    return res.status(404).json({ message: 'Payment request not found' })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Payment Request')
  const headers = ['Customer / Order Number', 'Order Delivery Date', 'Applicant', 'Delivery Date', 'Payee', 'Payment Percentage', 'Purchase Amount', 'Advance Payment', 'Balance Payment', 'Bank', 'Account Number', 'Remarks']

  sheet.addRow(headers)
  exportPurchaseInfos.forEach((purchaseInfo) => {
    const orderDeliveryTime = Array.from(new Set(purchaseInfo.batchItems
      .map((item) => item.deliveryTime || '')
      .filter(Boolean)))
      .join('、')

    sheet.addRow([
      `${order.inquiryCompany}/${order.orderNo}`,
      orderDeliveryTime,
      order.creator.displayName || order.creator.username,
      purchaseInfo.deliveryTime || formatExportDate(order.inquiryDate),
      purchaseInfo.supplierName || '',
      purchaseInfo.paymentPercent ? `${purchaseInfo.paymentPercent.toString()}%` : '',
      purchaseInfo.purchaseCost.toString(),
      purchaseInfo.advancePaymentAmount.toString(),
      purchaseInfo.arrivalPaymentAmount.toString(),
      purchaseInfo.bankName || '',
      purchaseInfo.bankAccount || '',
      getLatestPaymentApplicationRemark(purchaseInfo)
    ])
  })

  sheet.addRow([])
  sheet.addRow(['Included Items'])
  sheet.addRow(['Payee', 'No.', 'Item Code', 'Item Description', 'Order Delivery Date'])
  exportPurchaseInfos.forEach((purchaseInfo) => {
    purchaseInfo.batchItems.forEach((item) => {
      sheet.addRow([
        purchaseInfo.supplierName || '',
        item.lineNo,
        item.materialCode || '',
        item.materialDescription || '',
        item.deliveryTime || ''
      ])
    })
  })

  sheet.columns.forEach((column) => {
    column.width = 22
  })
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(exportPurchaseInfos.length + 3).font = { bold: true }
  sheet.getRow(exportPurchaseInfos.length + 4).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = encodeURIComponent(`${order.orderNo}-Order Payment Request.xlsx`)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
  return res.send(Buffer.from(buffer))
}

export async function exportPurchasePaymentApplication(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const batchId = String(req.params.batchId)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      creator: {
        select: {
          username: true,
          displayName: true
        }
      },
      purchaseInfos: {
        where: { id: batchId },
        include: {
          paymentApplications: {
            orderBy: { createdAt: 'desc' }
          },
          batchItems: {
            select: {
              lineNo: true,
              materialCode: true,
              materialDescription: true,
              deliveryTime: true
            },
            orderBy: { lineNo: 'asc' }
          }
        }
      }
    }
  })

  const purchaseInfo = order?.purchaseInfos[0]

  if (!order || !purchaseInfo) {
    return res.status(404).json({ message: 'Payment request not found' })
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Payment Request')
  const headers = ['Customer / Order Number', 'Order Delivery Date', 'Applicant', 'Delivery Date', 'Payee', 'Payment Percentage', 'Advance Payment', 'Balance Payment', 'Bank', 'Account Number', 'Remarks']
  const orderDeliveryTime = Array.from(new Set(purchaseInfo.batchItems
    .map((item) => item.deliveryTime || '')
    .filter(Boolean)))
    .join('、')

  sheet.addRow(headers)
  sheet.addRow([
    `${order.inquiryCompany}/${order.orderNo}`,
    orderDeliveryTime,
    order.creator.displayName || order.creator.username,
    purchaseInfo.deliveryTime || formatExportDate(order.inquiryDate),
    purchaseInfo.supplierName || '',
    purchaseInfo.paymentPercent ? `${purchaseInfo.paymentPercent.toString()}%` : '',
    purchaseInfo.advancePaymentAmount.toString(),
    purchaseInfo.arrivalPaymentAmount.toString(),
    purchaseInfo.bankName || '',
    purchaseInfo.bankAccount || '',
    getLatestPaymentApplicationRemark(purchaseInfo)
  ])
  sheet.addRow([])
  sheet.addRow(['Included Items'])
  purchaseInfo.batchItems.forEach((item) => {
    sheet.addRow([`${item.lineNo}. ${item.materialCode || item.materialDescription || '-'} ${item.deliveryTime ? `/${item.deliveryTime}` : ''}`])
  })

  sheet.columns.forEach((column) => {
    column.width = 22
  })
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(4).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = encodeURIComponent(`${order.orderNo}-Payment Request.xlsx`)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
  return res.send(Buffer.from(buffer))
}

export async function updateDeliveryInfo(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined
  const parsed = updateDeliveryInfoSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid shipping details', errors: parsed.error.flatten().fieldErrors })
  }

  const input = parsed.data
  const shippingDate = parseDate(input.shippingDate)
  const expectedDeliveryDate = parseDate(input.expectedDeliveryDate)

  if (input.shippingDate && !shippingDate) {
    return res.status(400).json({ message: 'Invalid shipping date format' })
  }

  if (input.expectedDeliveryDate && !expectedDeliveryDate) {
    return res.status(400).json({ message: 'Invalid delivery date format' })
  }

  const orderItem = await ensureOrderItem(orderId, orderItemId)

  if (orderItemId && !orderItem) {
    return res.status(404).json({ message: 'Item not found' })
  }

  const updateData = {
    shippingDate,
    buyerCompany: input.buyerCompany,
    shippingAmount: input.shippingAmount !== undefined ? new Prisma.Decimal(input.shippingAmount) : undefined,
    weight: input.weight,
    packageCount: input.packageCount,
    packageSize: input.packageSize,
    contractNo: input.contractNo,
    salesperson: input.salesperson,
    goodsName: input.goodsName,
    supplierBrand: input.supplierBrand,
    shippingQuantity: input.shippingQuantity,
    expectedDeliveryDate,
    needsWoodenBox: input.needsWoodenBox,
    woodenBoxPrice: input.woodenBoxPrice,
    woodenBoxFreight: input.woodenBoxFreight,
    route: input.route,
    needsTransfer: input.needsTransfer,
    transferLogistics: input.transferLogistics,
    estimatedTransferPrice: input.estimatedTransferPrice,
    billingWeight: input.billingWeight,
    freightEstimate: input.freightEstimate,
    applicant: input.applicant,
    approver: input.approver,
    customerLogisticsCompany: input.buyerLogisticsCompany,
    customerTrackingNo: input.buyerLogisticsNo,
    remark: input.remark
  }
  const createData = {
    orderId,
    orderItemId,
    shippingDate,
    buyerCompany: input.buyerCompany,
    shippingAmount: new Prisma.Decimal(input.shippingAmount || 0),
    weight: input.weight,
    packageCount: input.packageCount,
    packageSize: input.packageSize,
    contractNo: input.contractNo,
    salesperson: input.salesperson,
    goodsName: input.goodsName,
    supplierBrand: input.supplierBrand,
    shippingQuantity: input.shippingQuantity,
    expectedDeliveryDate,
    needsWoodenBox: input.needsWoodenBox,
    woodenBoxPrice: input.woodenBoxPrice,
    woodenBoxFreight: input.woodenBoxFreight,
    route: input.route,
    needsTransfer: input.needsTransfer,
    transferLogistics: input.transferLogistics,
    estimatedTransferPrice: input.estimatedTransferPrice,
    billingWeight: input.billingWeight,
    freightEstimate: input.freightEstimate,
    applicant: input.applicant,
    approver: input.approver,
    customerLogisticsCompany: input.buyerLogisticsCompany,
    customerTrackingNo: input.buyerLogisticsNo,
    remark: input.remark
  }
  const existingShippingInfo = orderItemId
    ? null
    : await prisma.shippingInfo.findFirst({ where: { orderId, orderItemId: null }, select: { id: true } })
  const shippingInfo = orderItemId
    ? await prisma.shippingInfo.upsert({
        where: { orderItemId },
        update: updateData,
        create: createData
      })
    : existingShippingInfo
      ? await prisma.shippingInfo.update({ where: { id: existingShippingInfo.id }, data: updateData })
      : await prisma.shippingInfo.create({ data: createData })

  return res.json({ message: 'Shipping details saved', shippingInfo })
}

type CustomerPaymentTransaction = Pick<
  Prisma.TransactionClient,
  'order' | 'customerPayment' | 'orderItem' | 'orderItemStatusRecord'
>

interface SaveOrderCustomerPaymentInput {
  orderId: string
  existingPaymentId: string | null
  status: CustomerPaymentStatus
  paidAmount: Prisma.Decimal
  paidAt: Date | null
  remark?: string
  operatorId: string
}

interface CompleteOrderCustomerPaymentItemsInput {
  orderId: string
  operatorId: string
  itemIds: string[]
}

export async function saveOrderCustomerPayment(
  client: Pick<CustomerPaymentTransaction, 'customerPayment'>,
  input: SaveOrderCustomerPaymentInput
) {
  const updateData = {
    status: input.status,
    paidAmount: input.paidAmount,
    paidAt: input.paidAt,
    remark: input.remark
  }

  if (input.existingPaymentId) {
    return client.customerPayment.update({
      where: { id: input.existingPaymentId },
      data: updateData
    })
  }

  return client.customerPayment.create({
    data: {
      orderId: input.orderId,
      orderItemId: null,
      ...updateData,
      createdById: input.operatorId
    }
  })
}

export async function completeOrderCustomerPaymentItems(
  client: Pick<CustomerPaymentTransaction, 'orderItem' | 'orderItemStatusRecord'>,
  input: CompleteOrderCustomerPaymentItemsInput
) {
  for (const itemId of input.itemIds) {
    const updated = await client.orderItem.updateMany({
      where: {
        id: itemId,
        orderId: input.orderId,
        currentStatus: OrderStatus.CUSTOMER_PAID
      },
      data: { currentStatus: OrderStatus.COMPLETED }
    })

    if (updated.count !== 1) {
      continue
    }

    await client.orderItemStatusRecord.create({
      data: {
        orderId: input.orderId,
        orderItemId: itemId,
        fromStatus: OrderStatus.CUSTOMER_PAID,
        toStatus: OrderStatus.COMPLETED,
        note: 'Customer has paid in full. Order completed',
        operatorId: input.operatorId
      }
    })
  }
}

type SerializableTransactionRunner = Pick<typeof prisma, '$transaction'>

function isTransactionConflict(error: unknown): error is { code: 'P2034' } {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2034'
}

export async function runSerializableTransactionWithRetry<T>(
  client: SerializableTransactionRunner,
  operation: (transaction: CustomerPaymentTransaction) => Promise<T>
): Promise<T> {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      })
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === maxAttempts) {
        throw error
      }
    }
  }

  throw new Error('Serializable transaction retry limit reached')
}

interface CustomerPaymentHandlerDependencies {
  transaction<T>(operation: (transaction: CustomerPaymentTransaction) => Promise<T>): Promise<T>
  saveOrderPayment: typeof saveOrderCustomerPayment
  completeEligibleItems: typeof completeOrderCustomerPaymentItems
  refreshOrderSummary(orderId: string): Promise<unknown>
}

export function createUpdateCustomerPaymentHandler(
  dependencies: CustomerPaymentHandlerDependencies = {
    transaction: (operation) => runSerializableTransactionWithRetry(prisma, operation),
    saveOrderPayment: saveOrderCustomerPayment,
    completeEligibleItems: completeOrderCustomerPaymentItems,
    refreshOrderSummary: refreshOrderSummaryFromItems
  }
) {
  return async function updateCustomerPaymentHandler(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    const orderId = String(req.params.id)
    const orderItemId = req.params.itemId ? String(req.params.itemId) : undefined

    if (orderItemId) {
      return res.status(400).json({
        message: 'Customer payments are recorded per order; per-item payments are no longer supported'
      })
    }

    const parsed = updateCustomerPaymentSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid customer payment details',
        errors: parsed.error.flatten().fieldErrors
      })
    }

    const input = parsed.data
    const paidAt = parseDate(input.paidAt)

    if (input.paidAt && !paidAt) {
      return res.status(400).json({ message: 'Invalid payment date format' })
    }

    const paidAmount = new Prisma.Decimal(input.customerPaymentAmount ?? 0)
    const updateData = {
      status: resolveCustomerPaymentStatus(input.customerPaymentAmount),
      paidAmount,
      paidAt,
      remark: input.remark
    }
    const createData = {
      orderId,
      orderItemId,
      status: resolveCustomerPaymentStatus(input.customerPaymentAmount),
      paidAmount,
      paidAt,
      remark: input.remark,
      createdById: req.user.id
    }

    const transactionResult = await dependencies.transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        select: { winningAmount: true }
      })

      if (!order) {
        return { kind: 'ORDER_NOT_FOUND' as const }
      }

      const existingPayment = await transaction.customerPayment.findFirst({
        where: { orderId, orderItemId: null },
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'desc' }
        ],
        select: { id: true }
      })
      const orderTotal = Prisma.Decimal.max(new Prisma.Decimal(order.winningAmount ?? 0), 0)

      if (paidAmount.greaterThan(orderTotal)) {
        return { kind: 'AMOUNT_EXCEEDS_TOTAL' as const }
      }

      if (paidAmount.lessThan(orderTotal)) {
        const completedItems = await transaction.orderItem.findMany({
          where: {
            orderId,
            currentStatus: OrderStatus.COMPLETED
          },
          select: { id: true },
          take: 1
        })

        if (completedItems.length > 0) {
          return { kind: 'COMPLETED_PAYMENT_MUST_STAY_FULL' as const }
        }
      }

      const fullyPaid = orderTotal.greaterThan(0) && paidAmount.equals(orderTotal)
      const eligibleItems = fullyPaid
        ? await transaction.orderItem.findMany({
            where: {
              orderId,
              currentStatus: OrderStatus.CUSTOMER_PAID
            },
            select: { id: true }
          })
        : []
      const customerPayment = await dependencies.saveOrderPayment(transaction, {
        orderId,
        existingPaymentId: existingPayment?.id ?? null,
        status: resolveCustomerPaymentStatus(input.customerPaymentAmount),
        paidAmount,
        paidAt,
        remark: input.remark,
        operatorId: req.user!.id
      })

      if (fullyPaid) {
        await dependencies.completeEligibleItems(transaction, {
          orderId,
          operatorId: req.user!.id,
          itemIds: eligibleItems.map((item) => item.id)
        })
      }

      return {
        kind: 'SAVED' as const,
        customerPayment,
        orderTotal
      }
    })

    if (transactionResult.kind === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ message: 'Order not found' })
    }

    if (transactionResult.kind === 'AMOUNT_EXCEEDS_TOTAL') {
      return res.status(400).json({ message: 'Payment amount cannot exceed the order total' })
    }

    if (transactionResult.kind === 'COMPLETED_PAYMENT_MUST_STAY_FULL') {
      return res.status(400).json({
        message: 'Total payments for a completed order must equal the order total'
      })
    }

    await dependencies.refreshOrderSummary(orderId)

    const summary = buildOrderCustomerPaymentSummary({
      winningAmount: transactionResult.orderTotal,
      orderPayment: { paidAmount }
    })

    return res.json({
      message: 'Customer payment saved',
      customerPayment: transactionResult.customerPayment,
      summary: {
        orderTotal: summary.orderTotal.toString(),
        paidAmount: summary.paidAmount.toString(),
        remainingAmount: summary.remainingAmount.toString(),
        state: summary.state
      }
    })
  }
}

export const updateCustomerPayment = createUpdateCustomerPaymentHandler()

export async function uploadOrderFile(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const id = String(req.params.id)
  const orderItemId = req.params.itemId ? String(req.params.itemId) : String(req.body.orderItemId || '') || undefined
  const fileType = String(req.body.fileType || '')
  const category = fileTypeCategoryMap[fileType] || String(req.body.category || '')

  if (!Object.values(FileCategory).includes(category as FileCategory)) {
    return res.status(400).json({ message: 'Invalid file type' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Please select a file to upload' })
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true }
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const orderItem = await ensureOrderItem(id, orderItemId)

  if (orderItemId && !orderItem) {
    return res.status(404).json({ message: 'Item not found' })
  }

  const storagePath = req.file.path.replace(process.cwd(), '').replaceAll('\\', '/').replace(/^\//, '')
  const originalName = normalizeUploadedFilename(req.file.originalname)

  const file = await prisma.file.create({
    data: {
      orderId: id,
      uploaderId: req.user.id,
      category: category as FileCategory,
      targetType: orderItemId ? FileTargetType.ORDER_ITEM : FileTargetType.ORDER,
      targetId: orderItemId || id,
      originalName,
      storagePath,
      mimeType: req.file.mimetype,
      size: req.file.size
    },
    include: {
      uploader: {
        select: {
          id: true,
          username: true,
          displayName: true
        }
      }
    }
  })

  return res.status(201).json({
    message: 'File uploaded successfully',
    file: {
      ...file,
      url: `${env.fileBaseUrl}/${storagePath.replace(/^uploads\//, '')}`,
      uploader: {
        id: file.uploader.id,
        username: file.uploader.username,
        realName: file.uploader.displayName
      }
    }
  })
}

export async function listAllOrderFiles(req: Request, res: Response) {
  const page = getPositiveIntQuery(req.query.page, 1, 100000)
  const pageSize = getPositiveIntQuery(req.query.pageSize, 10, 100)
  const search = getQueryString(req.query.search)
  const categoryQuery = getQueryString(req.query.category)
  const category = Object.values(FileCategory).includes(categoryQuery as FileCategory)
    ? (categoryQuery as FileCategory)
    : undefined

  const conditions: Prisma.FileWhereInput[] = []

  if (category) {
    conditions.push({ category })
  }

  if (search) {
    conditions.push({
      OR: [
        { originalName: { contains: search, mode: 'insensitive' } },
        {
          order: {
            is: {
              OR: [
                { orderNo: { contains: search, mode: 'insensitive' } },
                { inquiryCompany: { contains: search, mode: 'insensitive' } },
                { inquiryPerson: { contains: search, mode: 'insensitive' } },
                { inquiryNo: { contains: search, mode: 'insensitive' } },
                { productCode: { contains: search, mode: 'insensitive' } },
                { productNameCn: { contains: search, mode: 'insensitive' } },
                { modelSpec: { contains: search, mode: 'insensitive' } }
              ]
            }
          }
        },
        {
          uploader: {
            is: {
              OR: [
                { username: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } }
              ]
            }
          }
        }
      ]
    })
  }

  const where: Prisma.FileWhereInput = conditions.length ? { AND: conditions } : {}
  const [files, total] = await prisma.$transaction([
    prisma.file.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            inquiryCompany: true,
            productNameCn: true,
            currentStatus: true,
            createdAt: true
          }
        },
        uploader: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.file.count({ where })
  ])

  return res.json({
    items: files.map((file) => ({
      id: file.id,
      category: file.category,
      targetType: file.targetType,
      targetId: file.targetId,
      originalName: file.originalName,
      storagePath: file.storagePath,
      url: `${env.fileBaseUrl}/${file.storagePath.replace(/^uploads\//, '')}`,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      order: file.order
        ? {
            id: file.order.id,
            orderNo: file.order.orderNo,
            inquiryCompany: file.order.inquiryCompany,
            productNameCn: file.order.productNameCn,
            currentStatus: file.order.currentStatus,
            createdAt: file.order.createdAt
          }
        : null,
      uploader: {
        id: file.uploader.id,
        username: file.uploader.username,
        realName: file.uploader.displayName
      }
    })),
    pagination: {
      page,
      pageSize,
      total
    }
  })
}

export async function downloadOrderFile(req: Request, res: Response) {
  const fileId = String(req.params.fileId)
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      originalName: true,
      storagePath: true
    }
  })

  if (!file) {
    return res.status(404).json({ message: 'File not found' })
  }

  const uploadRoot = path.resolve(process.cwd(), env.uploadDir)
  const filePath = path.resolve(process.cwd(), file.storagePath)

  if (filePath !== uploadRoot && !filePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return res.status(400).json({ message: 'Invalid file path' })
  }

  return res.download(filePath, file.originalName, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ message: 'File not found or unavailable for download' })
    }
  })
}

export async function deleteOrderFile(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const fileId = String(req.params.fileId)
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      storagePath: true,
      uploaderId: true,
      order: {
        select: {
          creatorId: true,
          ownerId: true
        }
      },
      shippingApplicationFor: {
        select: {
          id: true,
          status: true
        }
      }
    }
  })

  if (!file) {
    return res.status(404).json({ message: 'File not found' })
  }

  const canDeleteFile = isBossOrAdmin(req.user.role)
    || file.uploaderId === req.user.id
    || file.order?.creatorId === req.user.id
    || file.order?.ownerId === req.user.id

  if (!canDeleteFile) {
    return res.status(403).json({ message: 'You do not have permission to delete this file' })
  }

  if (file.shippingApplicationFor && file.shippingApplicationFor.status !== ShippingApplicationStatus.REJECTED) {
    return res.status(400).json({ message: 'Pending or approved shipping approval Excel files cannot be deleted' })
  }

  const uploadRoot = path.resolve(process.cwd(), env.uploadDir)
  const filePath = path.resolve(process.cwd(), file.storagePath)

  if (filePath !== uploadRoot && !filePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return res.status(400).json({ message: 'Invalid file path' })
  }

  await prisma.$transaction(async (tx) => {
    if (file.shippingApplicationFor) {
      await tx.shippingApplication.delete({ where: { id: file.shippingApplicationFor.id } })
    }
    await tx.order.updateMany({
      where: { bidContractFileId: fileId },
      data: { bidContractFileId: null }
    })
    await tx.supplierQuote.updateMany({
      where: { quoteFileId: fileId },
      data: { quoteFileId: null }
    })
    await tx.purchaseInfo.updateMany({
      where: { purchaseContractFileId: fileId },
      data: { purchaseContractFileId: null }
    })
    await tx.purchaseInfo.updateMany({
      where: { paymentApplicationFileId: fileId },
      data: { paymentApplicationFileId: null }
    })
    await tx.file.delete({ where: { id: fileId } })
  })

  let physicalFileDeleted = true

  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      physicalFileDeleted = false
    }
  }

  return res.json({
    message: physicalFileDeleted ? 'File deleted' : 'File record deleted. The server file will be cleaned up later'
  })
}

export async function exportShippingApplication(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const orderId = String(req.params.id)
  const parsed = shippingApplicationExportQuerySchema.safeParse(req.query)

  if (!parsed.success) {
    return res.status(400).json({
      message: parsed.error.issues[0]?.message || 'Invalid shipping request export parameters'
    })
  }

  const batchIds = normalizeShippingBatchIds(parsed.data.batchIds)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      inquiryCompany: true,
      creator: {
        select: {
          username: true,
          displayName: true
        }
      }
    }
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const purchaseBatches = await prisma.purchaseInfo.findMany({
    where: {
      id: { in: batchIds },
      orderId
    },
    include: {
      batchItems: {
        select: {
          id: true,
          lineNo: true,
          materialDescription: true,
          deliveryTime: true,
          quantity: true,
          purchaseQuantity: true,
          manufacturer: true,
          winningAmount: true,
          taxIncludedTotal: true,
          shippingInfo: {
            select: {
              shippingDate: true,
              weight: true,
              packageCount: true,
              packageSize: true,
              contractNo: true,
              salesperson: true,
              goodsName: true,
              supplierBrand: true,
              shippingQuantity: true,
              expectedDeliveryDate: true,
              needsWoodenBox: true,
              woodenBoxPrice: true,
              woodenBoxFreight: true,
              route: true,
              needsTransfer: true,
              transferLogistics: true,
              estimatedTransferPrice: true,
              billingWeight: true,
              freightEstimate: true,
              applicant: true,
              approver: true,
              customerLogisticsCompany: true,
              customerTrackingNo: true,
              remark: true
            }
          }
        }
      }
    }
  })

  if (purchaseBatches.length !== batchIds.length) {
    return res.status(404).json({ message: 'Some purchase batches were not found or do not belong to this order' })
  }

  if (purchaseBatches.some((batch) => !batch.batchItems.length)) {
    return res.status(400).json({ message: 'Selected purchase batches have no items to export' })
  }

  const selectedItems = purchaseBatches.flatMap((batch) => batch.batchItems.map((item) => ({
    ...item,
    purchaseSupplierName: batch.supplierName,
    purchaseDeliveryTime: batch.deliveryTime,
    itemDeliveryTime: item.deliveryTime
  })))
  let workbook: ExcelJS.Workbook

  try {
    workbook = await buildShippingApplicationWorkbook({
      orderNo: order.orderNo,
      inquiryCompany: order.inquiryCompany,
      creatorName: order.creator.displayName || order.creator.username,
      exportedByName: req.user.realName || req.user.username,
      items: selectedItems
    })
  } catch (error) {
    if (error instanceof ShippingApplicationFieldConflictError) {
      return res.status(400).json({
        message: `Selected items have inconsistent ${error.fields.join(', ')}. Please align the shipping details first`
      })
    }
    throw error
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `Shipping Request-${order.orderNo.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  return res.send(Buffer.from(buffer))
}

export async function exportPurchaseContract(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: purchaseContractOrderInclude
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  const workbook = buildPurchaseContractWorkbook([order])

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `${order.orderNo.replace(/[\\/:*?"<>|]/g, '_')}-Purchase Contract.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  return res.send(Buffer.from(buffer))
}

export async function deleteOrder(req: Request, res: Response) {
  const orderId = String(req.params.id)
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNo: true,
      files: {
        select: {
          storagePath: true
        }
      }
    }
  })

  if (!order) {
    return res.status(404).json({ message: 'Order not found' })
  }

  await prisma.order.delete({
    where: { id: orderId }
  })

  const uploadRoot = path.resolve(process.cwd(), env.uploadDir)

  order.files.forEach((file) => {
    const filePath = path.resolve(process.cwd(), file.storagePath)

    if (filePath === uploadRoot || !filePath.startsWith(`${uploadRoot}${path.sep}`)) {
      return
    }

    fs.rmSync(filePath, { force: true })
  })

  fs.rmSync(path.resolve(uploadRoot, 'orders', orderId), { recursive: true, force: true })

  return res.json({ message: 'Order deleted', order: { id: order.id, orderNo: order.orderNo } })
}

export async function createOrder(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const parsed = createOrderSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid order details',
      errors: parsed.error.flatten().fieldErrors
    })
  }

  const input = parsed.data
  const inquiryDate = new Date(input.inquiryDate)

  if (Number.isNaN(inquiryDate.getTime())) {
    return res.status(400).json({ message: 'Invalid inquiry date format' })
  }

  try {
    const winningAmount = sumDecimals(input.items.map((item) => toDecimal(item.taxIncludedTotal)))
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNo: input.orderNo,
          inquiryCompany: input.inquiryCompany,
          declarationCompany: input.declarationCompany || 'None',
          inquiryPerson: input.inquiryPerson,
          inquiryDate,
          inquiryNo: input.inquiryNo,
          productCode: input.productCode,
          productNameCn: input.productNameCn,
          modelSpec: input.modelSpec,
          quantity: toDecimal(input.quantity),
          currentStatus: OrderStatus.PURCHASING,
          bidResult: BidResult.WON,
          winningAmount: winningAmount.equals(0) ? null : winningAmount,
          creatorId: req.user!.id,
          ownerId: req.user!.id,
          items: {
            create: input.items.map((item, index) => ({
              lineNo: index + 1,
              materialCode: item.materialCode,
              materialDescription: item.materialDescription,
              remark: item.remark,
              supplierRemark: item.supplierRemark,
              manufacturer: item.manufacturer,
              quantity: toDecimal(item.quantity),
              unit: item.unit,
              quotedPrice: toDecimal(item.quotedPrice),
              taxIncludedTotal: toDecimal(item.taxIncludedTotal),
              deliveryTime: item.deliveryTime,
              inquiryRemark: item.inquiryRemark,
              applicantDepartment: item.applicantDepartment,
              currentStatus: OrderStatus.PURCHASING,
              bidResult: BidResult.WON,
              winningAmount: toDecimal(item.taxIncludedTotal)
            }))
          }
        },
        include: {
          items: {
            orderBy: { lineNo: 'asc' }
          }
        }
      })

      await tx.inquiry.create({
        data: {
          inquiryNo: buildOrderInquiryNo(input.orderNo),
          inquiryCompany: input.inquiryCompany,
          inquiryPerson: input.inquiryPerson,
          inquiryDate,
          remark: `Automatically generated from order ${input.orderNo}`,
          creatorId: req.user!.id,
          items: {
            create: input.items.map((item, index) => ({
              lineNo: index + 1,
              materialCode: item.materialCode || null,
              materialName: item.materialDescription || item.materialCode || `Item ${index + 1}`,
              modelSpec: item.remark || null,
              manufacturer: item.manufacturer || null,
              supplierName: item.manufacturer || null,
              unit: item.unit || null,
              quantity: toDecimal(item.quantity),
              quotedPrice: toDecimal(item.quotedPrice),
              totalAmount: toDecimal(item.taxIncludedTotal),
              deliveryTime: item.deliveryTime || null,
              result: InquiryResult.WON,
              winningPrice: toDecimal(item.taxIncludedTotal),
              remark: [item.supplierRemark, item.inquiryRemark, item.applicantDepartment].filter(Boolean).join('；') || null
            }))
          }
        }
      })

      return createdOrder
    })

    return res.status(201).json({
      message: 'Order created successfully',
      order
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'Order number already exists' })
    }

    return res.status(500).json({ message: 'Failed to create order' })
  }
}
