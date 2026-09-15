import { BidResult, FileCategory, InvoiceStatus, OrderStatus, PaymentApplicationStatus, ShippingApplicationStatus, UserRole } from '@prisma/client'
import type { Request, Response } from 'express'

import { prisma } from '../utils/prisma.js'
import { buildBusinessTrend } from '../utils/businessTrend.js'
import { buildInquiryCompanyAnalysis, type InquiryAnalysisSortBy } from '../utils/inquiryCompanyAnalysis.js'
import { buildOrderCustomerPaymentSummary, buildRecoverySummary } from '../utils/orderCustomerPayment.js'
import {
  filterPendingApprovalItems,
  getPendingApprovalUnitCount,
  getPendingApprovalSubmittedAt,
  mergePendingApprovalItems,
  parsePendingApprovalType,
  parseSubmittedDateRange,
  resolveLegacyShippingValues,
  resolvePendingPaymentValues
} from '../utils/pendingApprovalSearch.js'

const businessAnalysisUsernames = new Set(['Hengan1', 'Hengan3', 'Hengan4'])

const unfinishedStatuses = [
  OrderStatus.INQUIRY,
  OrderStatus.QUOTED,
  OrderStatus.BID_WON,
  OrderStatus.PURCHASING,
  OrderStatus.PURCHASE_PAYMENT,
  OrderStatus.SUPPLIER_SHIPPED,
  OrderStatus.ARRIVED_COMPANY,
  OrderStatus.SHIPPED_TO_CUSTOMER,
  OrderStatus.CUSTOMER_PAID
]

function toMoney(value: { toString(): string } | null | undefined) {
  return value?.toString() || '0'
}

function toRate(value: { toString(): string } | null | undefined) {
  return value?.toString() || '0'
}

function getGroupCount(count: unknown) {
  if (typeof count === 'object' && count !== null && 'id' in count) {
    return (count as { id?: number }).id || 0
  }

  return 0
}

function mapReminderOrder(order: {
  id: string
  orderNo: string
  inquiryCompany: string
  productNameCn: string | null
  currentStatus: OrderStatus
  createdAt: Date
}) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    inquiryCompany: order.inquiryCompany,
    productNameCn: order.productNameCn,
    currentStatus: order.currentStatus,
    createdAt: order.createdAt
  }
}

function isBossOrAdmin(role: UserRole) {
  return role === UserRole.BOSS || role === UserRole.ADMIN
}

function canViewBusinessAnalysis(user: { role: UserRole; username: string }) {
  return isBossOrAdmin(user.role) || businessAnalysisUsernames.has(user.username)
}

function sumPaymentPercent(applications: Array<{ paymentPercent: { toString(): string }; status: PaymentApplicationStatus }>, status: PaymentApplicationStatus) {
  return applications
    .filter((application) => application.status === status)
    .reduce((total, application) => total + Number(application.paymentPercent.toString() || 0), 0)
}

function getPaymentSummaryStatus(pendingPercent: number, approvedPercent: number, applicationCount: number) {
  if (pendingPercent > 0) {
    return 'PENDING'
  }

  if (approvedPercent >= 100) {
    return 'APPROVED_FULL'
  }

  if (applicationCount > 0 || approvedPercent > 0) {
    return 'APPROVED_PARTIAL'
  }

  return 'NOT_SUBMITTED'
}

function getMonthRange(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  const matched = text.match(/^(\d{4})-(\d{2})$/)
  const now = new Date()
  const year = matched ? Number(matched[1]) : now.getFullYear()
  const month = matched ? Number(matched[2]) : now.getMonth() + 1
  const safeMonth = month >= 1 && month <= 12 ? month : now.getMonth() + 1

  return {
    start: new Date(Date.UTC(year, safeMonth - 1, 1)),
    end: new Date(Date.UTC(safeMonth === 12 ? year + 1 : year, safeMonth === 12 ? 0 : safeMonth, 1))
  }
}

function getProfitRankingOrderBy(query: Request['query']) {
  const sortBy = typeof query.profitRankingSortBy === 'string' ? query.profitRankingSortBy : 'profitRate'
  const sortOrder = query.profitRankingSortOrder === 'asc' ? 'asc' : 'desc'

  if (sortBy === 'winningAmount') {
    return { winningAmount: sortOrder } as const
  }

  if (sortBy === 'profit') {
    return { profit: sortOrder } as const
  }

  return { profitRate: sortOrder } as const
}

async function findPendingApprovalPurchaseInfos() {
  return prisma.purchaseInfo.findMany({
    where: {
      OR: [
        {
          batchItems: {
            some: {
              currentStatus: OrderStatus.ARRIVED_COMPANY
            }
          }
        },
        {
          batchItems: {
            some: {
              currentStatus: OrderStatus.PURCHASE_PAYMENT
            }
          },
          paymentApplications: {
            some: {
              status: PaymentApplicationStatus.PENDING
            }
          }
        }
      ]
    },
    orderBy: {
      updatedAt: 'desc'
    },
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          inquiryCompany: true,
          files: {
            where: {
              category: FileCategory.SHIPPING_APPLICATION
            },
            select: {
              id: true,
              originalName: true,
              targetId: true
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      },
      batchItems: {
        select: {
          id: true,
          lineNo: true,
          materialCode: true,
          materialDescription: true,
          currentStatus: true,
          statusRecords: {
            where: {
              toStatus: OrderStatus.ARRIVED_COMPANY
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1,
            select: {
              createdAt: true
            }
          }
        },
        orderBy: { lineNo: 'asc' }
      },
      paymentApplications: {
        where: {
          status: PaymentApplicationStatus.PENDING
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 1,
        select: {
          createdAt: true,
          paymentPercent: true,
          advancePaymentAmount: true,
          arrivalPaymentAmount: true,
          bankName: true,
          bankAccount: true
        }
      }
    }
  })
}

function mapPendingApproval(info: Awaited<ReturnType<typeof findPendingApprovalPurchaseInfos>>[number]) {
  const batchItemIds = new Set(info.batchItems.map((item) => item.id))
  const shippingApplicationFile = info.order.files.find((file) => file.targetId && batchItemIds.has(file.targetId)) || null
  const type = info.batchItems.some((item) => item.currentStatus === OrderStatus.ARRIVED_COMPANY) ? 'SHIPPING' as const : 'PAYMENT' as const
  const submittedAt = getPendingApprovalSubmittedAt(
    type,
    info.paymentApplications[0]?.createdAt,
    info.batchItems.flatMap((item) => item.statusRecords.map((record) => record.createdAt))
  )
  const pendingApplication = info.paymentApplications[0]
  const pendingPaymentValues = resolvePendingPaymentValues(
    type === 'PAYMENT' && pendingApplication
      ? {
          paymentPercent: pendingApplication.paymentPercent.toString(),
          advancePaymentAmount: toMoney(pendingApplication.advancePaymentAmount),
          arrivalPaymentAmount: toMoney(pendingApplication.arrivalPaymentAmount),
          bankName: pendingApplication.bankName,
          bankAccount: pendingApplication.bankAccount
        }
      : null
  )

  if (type === 'PAYMENT' && !pendingPaymentValues) {
    throw new Error('Pending payment request not found')
  }

  const paymentValues = pendingPaymentValues || {
    paymentPercent: null,
    advancePaymentAmount: '0',
    arrivalPaymentAmount: '0',
    bankName: null,
    bankAccount: null
  }
  const shippingValues = resolveLegacyShippingValues(
    type,
    info.supplierLogisticsCompany,
    info.supplierTrackingNo
  )

  return {
    id: info.id,
    orderId: info.order.id,
    orderNo: info.order.orderNo,
    inquiryCompany: info.order.inquiryCompany,
    supplierName: info.supplierName,
    type,
    submittedAt,
    purchaseCost: toMoney(info.purchaseCost),
    deliveryTime: info.deliveryTime,
    ...paymentValues,
    ...shippingValues,
    itemCount: info.batchItems.length,
    shippingApplicationFile,
    items: info.batchItems.map((item) => ({
      id: item.id,
      lineNo: item.lineNo,
      materialCode: item.materialCode,
      materialDescription: item.materialDescription,
      currentStatus: item.currentStatus
    }))
  }
}

async function findPendingGroupedShippingApplications() {
  return prisma.shippingApplication.findMany({
    where: {
      status: ShippingApplicationStatus.PENDING
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      order: {
        select: {
          id: true,
          orderNo: true,
          inquiryCompany: true
        }
      },
      file: {
        select: {
          id: true,
          originalName: true,
          targetId: true
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
    }
  })
}

function mapPendingGroupedShippingApplication(
  application: Awaited<ReturnType<typeof findPendingGroupedShippingApplications>>[number]
) {
  const purchaseInfos = application.batches.map((batch) => batch.purchaseInfo)
  const items = purchaseInfos.flatMap((batch) => batch.batchItems)
  const supplierNames = Array.from(new Set(purchaseInfos.map((batch) => batch.supplierName).filter(Boolean)))
  const deliveryTimes = Array.from(new Set(purchaseInfos.map((batch) => batch.deliveryTime).filter(Boolean)))
  const purchaseCost = purchaseInfos.reduce((total, batch) => total + Number(batch.purchaseCost || 0), 0)

  return {
    id: application.id,
    orderId: application.order.id,
    orderNo: application.order.orderNo,
    inquiryCompany: application.order.inquiryCompany,
    supplierName: supplierNames.join('+') || null,
    type: 'SHIPPING' as const,
    submittedAt: application.createdAt,
    purchaseCost: purchaseCost.toFixed(2),
    deliveryTime: deliveryTimes.length === 1 ? deliveryTimes[0] || null : deliveryTimes.length > 1 ? 'Multiple' : null,
    paymentPercent: null,
    advancePaymentAmount: '0',
    arrivalPaymentAmount: '0',
    bankName: null,
    bankAccount: null,
    itemCount: items.length,
    shippingApplicationFile: application.file,
    logisticsCompany: application.logisticsCompany,
    trackingNo: application.trackingNo,
    groupedShipping: true,
    purchaseBatchIds: purchaseInfos.map((batch) => batch.id),
    purchaseBatches: purchaseInfos.map((batch) => ({
      id: batch.id,
      supplierName: batch.supplierName,
      items: batch.batchItems
    })),
    items
  }
}

export async function getPendingApprovals(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const submittedDate = typeof req.query.submittedDate === 'string' ? req.query.submittedDate.trim() : ''
  const approvalType = parsePendingApprovalType(req.query.type)

  if (approvalType === null) {
    return res.status(400).json({ message: 'Invalid approval type' })
  }

  if (submittedDate && !parseSubmittedDateRange(submittedDate)) {
    return res.status(400).json({ message: 'Invalid submission date format' })
  }

  const [purchaseInfos, groupedShippingApplications] = await Promise.all([
    findPendingApprovalPurchaseInfos(),
    findPendingGroupedShippingApplications()
  ])
  const allItems = mergePendingApprovalItems(
    purchaseInfos.map(mapPendingApproval),
    groupedShippingApplications.map(mapPendingGroupedShippingApplication)
  )
  const typeItems = filterPendingApprovalItems(allItems, { type: approvalType })
  const items = filterPendingApprovalItems(typeItems, {
    orderNo: req.query.orderNo,
    submittedDate
  })

  return res.json({
    count: getPendingApprovalUnitCount(items),
    totalCount: getPendingApprovalUnitCount(typeItems),
    items
  })
}

export async function getPaymentApplicationSummary(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const userScope = isBossOrAdmin(req.user.role)
    ? {}
    : {
        OR: [
          { order: { creatorId: req.user.id } },
          { order: { ownerId: req.user.id } },
          { paymentApplications: { some: { createdById: req.user.id } } }
        ]
      }

  const purchaseInfos = await prisma.purchaseInfo.findMany({
    where: {
      ...userScope,
      batchItems: {
        some: {}
      }
    },
    orderBy: {
      updatedAt: 'desc'
    },
    include: {
      order: {
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
      },
      batchItems: {
        select: {
          id: true,
          lineNo: true,
          materialCode: true,
          materialDescription: true,
          deliveryTime: true,
          currentStatus: true
        },
        orderBy: { lineNo: 'asc' }
      },
      paymentApplications: {
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  const items = purchaseInfos.map((info) => {
    const pendingPercent = sumPaymentPercent(info.paymentApplications, PaymentApplicationStatus.PENDING)
    const approvedPercent = sumPaymentPercent(info.paymentApplications, PaymentApplicationStatus.APPROVED)
    const latestApplication = info.paymentApplications[0]
    const activeApplications = info.paymentApplications.filter((application) => application.status !== PaymentApplicationStatus.REJECTED)
    const status = getPaymentSummaryStatus(pendingPercent, approvedPercent, activeApplications.length)

    return {
      id: info.id,
      orderId: info.order.id,
      orderNo: info.order.orderNo,
      inquiryCompany: info.order.inquiryCompany,
      creatorName: info.order.creator.displayName || info.order.creator.username,
      supplierName: info.supplierName,
      purchaseCost: toMoney(info.purchaseCost),
      deliveryTime: info.deliveryTime,
      itemCount: info.batchItems.length,
      itemDescriptions: info.batchItems.map((item) => ({
        id: item.id,
        lineNo: item.lineNo,
        materialCode: item.materialCode,
        materialDescription: item.materialDescription,
        deliveryTime: item.deliveryTime,
        currentStatus: item.currentStatus
      })),
      status,
      applicationCount: info.paymentApplications.length,
      pendingPercent: pendingPercent.toString(),
      approvedPercent: approvedPercent.toString(),
      remainingPercent: Math.max(0, 100 - pendingPercent - approvedPercent).toString(),
      latestPaymentPercent: latestApplication?.paymentPercent.toString() || null,
      latestApplicationStatus: latestApplication?.status || null,
      latestApplicationAt: latestApplication?.createdAt || null,
      bankName: latestApplication?.bankName || info.bankName,
      bankAccount: latestApplication?.bankAccount || info.bankAccount
    }
  })

  const summary = items.reduce((result, item) => {
    result.total += 1

    if (item.status === 'NOT_SUBMITTED') {
      result.notSubmitted += 1
    } else if (item.status === 'PENDING') {
      result.pending += 1
      result.submitted += 1
    } else if (item.status === 'APPROVED_FULL') {
      result.approvedFull += 1
      result.submitted += 1
    } else {
      result.approvedPartial += 1
      result.submitted += 1
    }

    return result
  }, {
    total: 0,
    notSubmitted: 0,
    pending: 0,
    approvedPartial: 0,
    approvedFull: 0,
    submitted: 0
  })

  return res.json({
    summary,
    items
  })
}

export async function getBossDashboard(req: Request, res: Response) {
  const inquiryAnalysisMonthRange = getMonthRange(req.query.inquiryAnalysisMonth)
  const inquiryAnalysisSortBy = ['orderCount', 'wonCount', 'winRate'].includes(String(req.query.inquiryAnalysisSortBy))
    ? String(req.query.inquiryAnalysisSortBy)
    : 'orderCount'
  const inquiryAnalysisSortOrder = req.query.inquiryAnalysisSortOrder === 'asc' ? 'asc' : 'desc'
  const profitRankingOrderBy = getProfitRankingOrderBy(req.query)
  const [
    totalOrderCount,
    totalStats,
    wonTrendOrders,
    employeeGroups,
    companyGroups,
    profitRateOrders,
    purchaseCompanyGroups,
    inquiryCompanyAnalysisOrders,
    unfinishedOrders,
    unpaidOrderCandidates,
    invoicePendingOrders,
    recoveryOrders
  ] = await prisma.$transaction([
    prisma.order.count(),
    prisma.order.aggregate({
      _sum: {
        winningAmount: true,
        profit: true
      },
      _avg: {
        profitRate: true
      }
    }),
    prisma.order.findMany({
      where: {
        bidResult: BidResult.WON
      },
      select: {
        inquiryDate: true,
        winningAmount: true,
        profit: true
      }
    }),
    prisma.order.groupBy({
      by: ['creatorId'],
      _count: {
        id: true
      },
      _sum: {
        winningAmount: true,
        profit: true
      },
      orderBy: {
        _sum: {
          winningAmount: 'desc'
        }
      },
      take: 10
    }),
    prisma.order.groupBy({
      by: ['inquiryCompany'],
      _count: {
        id: true
      },
      _sum: {
        winningAmount: true,
        profit: true
      },
      orderBy: {
        _sum: {
          winningAmount: 'desc'
        }
      },
      take: 10
    }),
    prisma.order.findMany({
      where: {
        profitRate: {
          not: null
        }
      },
      orderBy: profitRankingOrderBy,
      take: 10,
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        productNameCn: true,
        winningAmount: true,
        profit: true,
        profitRate: true
      }
    }),
    prisma.purchaseInfo.groupBy({
      by: ['supplierName'],
      where: {
        supplierName: {
          not: null
        }
      },
      _count: {
        id: true
      },
      _sum: {
        purchaseCost: true
      },
      orderBy: {
        _sum: {
          purchaseCost: 'desc'
        }
      },
      take: 10
    }),
    prisma.inquiryItem.findMany({
      where: {
        inquiry: {
          inquiryDate: {
            gte: inquiryAnalysisMonthRange.start,
            lt: inquiryAnalysisMonthRange.end
          }
        }
      },
      select: {
        result: true,
        inquiry: {
          select: {
            inquiryCompany: true
          }
        }
      }
    }),
    prisma.order.findMany({
      where: {
        currentStatus: {
          in: unfinishedStatuses
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10,
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        productNameCn: true,
        currentStatus: true,
        createdAt: true
      }
    }),
    prisma.order.findMany({
      where: {
        bidResult: 'WON'
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        productNameCn: true,
        currentStatus: true,
        createdAt: true,
        winningAmount: true,
        customerPayments: {
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'desc' }
          ],
          select: {
            id: true,
            updatedAt: true,
            orderItemId: true,
            paidAmount: true
          }
        }
      }
    }),
    prisma.order.findMany({
      where: {
        OR: [
          {
            purchaseInfos: {
              none: {}
            }
          },
          {
            purchaseInfos: {
              some: {
                invoiceStatus: {
                  not: InvoiceStatus.ISSUED
                }
              }
            }
          }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10,
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        productNameCn: true,
        currentStatus: true,
        createdAt: true
      }
    }),
    prisma.order.findMany({
      select: {
        winningAmount: true,
        customerPayments: {
          orderBy: [
            { updatedAt: 'desc' },
            { id: 'desc' }
          ],
          select: {
            id: true,
            updatedAt: true,
            orderItemId: true,
            paidAmount: true
          }
        }
      }
    })
  ])

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: employeeGroups.map((group) => group.creatorId)
      }
    },
    select: {
      id: true,
      username: true,
      displayName: true
    }
  })
  const userMap = new Map(users.map((user) => [user.id, user]))
  const trend = buildBusinessTrend(wonTrendOrders)
  const inquiryCompanyAnalysis = buildInquiryCompanyAnalysis(
    inquiryCompanyAnalysisOrders,
    inquiryAnalysisSortBy as InquiryAnalysisSortBy,
    inquiryAnalysisSortOrder
  )
  const recoverySummary = buildRecoverySummary(recoveryOrders.map((order) => ({
    winningAmount: order.winningAmount,
    orderPayment: order.customerPayments
      .filter((payment) => payment.orderItemId === null)
      .sort((left, right) => {
        const updatedAtDifference = right.updatedAt.getTime() - left.updatedAt.getTime()

        return updatedAtDifference || right.id.localeCompare(left.id)
      })[0] || null,
    itemPayments: order.customerPayments.filter((payment) => payment.orderItemId !== null)
  })))
  const unpaidOrders = unpaidOrderCandidates.filter((order) => {
    const orderPayment = order.customerPayments.find((payment) => payment.orderItemId === null) || null
    const summary = buildOrderCustomerPaymentSummary({
      winningAmount: order.winningAmount,
      orderPayment,
      itemPayments: order.customerPayments.filter((payment) => payment.orderItemId !== null)
    })

    return summary.state !== 'PAID'
  }).slice(0, 10)

  return res.json({
    summary: {
      totalOrderCount,
      totalWinningAmount: toMoney(totalStats._sum.winningAmount),
      totalProfit: toMoney(totalStats._sum.profit),
      averageProfitRate: toRate(totalStats._avg.profitRate),
      receivedAmount: toMoney(recoverySummary.paidAmount),
      recoveryRate: toRate(recoverySummary.recoveryRate)
    },
    trend,
    rankings: {
      employees: employeeGroups.map((group) => {
        const user = userMap.get(group.creatorId)

        return {
          userId: group.creatorId,
          username: user?.username || '-',
          realName: user?.displayName || null,
          orderCount: getGroupCount(group._count),
          winningAmount: toMoney(group._sum?.winningAmount),
          profit: toMoney(group._sum?.profit)
        }
      }),
      companies: companyGroups.map((group) => ({
        companyName: group.inquiryCompany,
        orderCount: getGroupCount(group._count),
        winningAmount: toMoney(group._sum?.winningAmount),
        profit: toMoney(group._sum?.profit)
      })),
      profitRates: profitRateOrders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        inquiryCompany: order.inquiryCompany,
        productNameCn: order.productNameCn,
        winningAmount: toMoney(order.winningAmount),
        profit: toMoney(order.profit),
        profitRate: toRate(order.profitRate)
      })),
      purchaseCompanies: purchaseCompanyGroups.map((group) => ({
        companyName: group.supplierName || '-',
        orderCount: getGroupCount(group._count),
        purchaseAmount: toMoney(group._sum?.purchaseCost)
      })),
      inquiryCompanyAnalysis
    },
    reminders: {
      unfinishedOrders: unfinishedOrders.map(mapReminderOrder),
      unpaidOrders: unpaidOrders.map(mapReminderOrder),
      invoicePendingOrders: invoicePendingOrders.map(mapReminderOrder)
    }
  })
}

export async function getBusinessAnalysis(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  if (!canViewBusinessAnalysis(req.user)) {
    return res.status(403).json({ message: 'You do not have permission to view business analytics' })
  }

  const ownOrderWhere = {
    creatorId: req.user.id
  }
  const ownInquiryWhere = isBossOrAdmin(req.user.role) ? {} : { creatorId: req.user.id }
  const inquiryAnalysisMonthRange = getMonthRange(req.query.inquiryAnalysisMonth)
  const inquiryAnalysisSortBy = ['orderCount', 'wonCount', 'winRate'].includes(String(req.query.inquiryAnalysisSortBy))
    ? String(req.query.inquiryAnalysisSortBy)
    : 'orderCount'
  const inquiryAnalysisSortOrder = req.query.inquiryAnalysisSortOrder === 'asc' ? 'asc' : 'desc'

  const [companyGroups, profitRateOrders, purchaseCompanyGroups, inquiryCompanyAnalysisOrders] = await prisma.$transaction([
    prisma.order.groupBy({
      by: ['inquiryCompany'],
      where: ownOrderWhere,
      _count: {
        id: true
      },
      _sum: {
        winningAmount: true,
        profit: true
      },
      orderBy: {
        _sum: {
          winningAmount: 'desc'
        }
      },
      take: 20
    }),
    prisma.order.findMany({
      where: {
        ...ownOrderWhere,
        profitRate: {
          not: null
        }
      },
      orderBy: {
        profitRate: 'desc'
      },
      take: 20,
      select: {
        id: true,
        orderNo: true,
        inquiryCompany: true,
        productNameCn: true,
        winningAmount: true,
        profit: true,
        profitRate: true
      }
    }),
    prisma.purchaseInfo.groupBy({
      by: ['supplierName'],
      where: {
        order: ownOrderWhere,
        supplierName: {
          not: null
        }
      },
      _count: {
        id: true
      },
      _sum: {
        purchaseCost: true
      },
      orderBy: {
        _sum: {
          purchaseCost: 'desc'
        }
      },
      take: 20
    }),
    prisma.inquiryItem.findMany({
      where: {
        inquiry: {
          ...ownInquiryWhere,
          inquiryDate: {
            gte: inquiryAnalysisMonthRange.start,
            lt: inquiryAnalysisMonthRange.end
          }
        }
      },
      select: {
        result: true,
        inquiry: {
          select: {
            inquiryCompany: true
          }
        }
      }
    })
  ])
  const inquiryCompanyAnalysis = buildInquiryCompanyAnalysis(
    inquiryCompanyAnalysisOrders,
    inquiryAnalysisSortBy as InquiryAnalysisSortBy,
    inquiryAnalysisSortOrder
  )

  return res.json({
    rankings: {
      companies: companyGroups.map((group) => ({
        companyName: group.inquiryCompany,
        orderCount: getGroupCount(group._count),
        winningAmount: toMoney(group._sum?.winningAmount),
        profit: toMoney(group._sum?.profit)
      })),
      profitRates: profitRateOrders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        inquiryCompany: order.inquiryCompany,
        productNameCn: order.productNameCn,
        winningAmount: toMoney(order.winningAmount),
        profit: toMoney(order.profit),
        profitRate: toRate(order.profitRate)
      })),
      purchaseCompanies: purchaseCompanyGroups.map((group) => ({
        companyName: group.supplierName || '-',
        orderCount: getGroupCount(group._count),
        purchaseAmount: toMoney(group._sum?.purchaseCost)
      })),
      inquiryCompanyAnalysis
    }
  })
}
