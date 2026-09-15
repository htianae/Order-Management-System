import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'

import {
  buildAnnualPurchaseContractWhere,
  parseAnnualPurchaseContractYear
} from '../utils/annualPurchaseContracts.js'
import { prisma } from '../utils/prisma.js'
import {
  buildPurchaseContractWorkbook,
  purchaseContractOrderInclude,
  type PurchaseContractOrder,
  type PurchaseContractWorkbookOptions
} from '../utils/purchaseContractWorkbook.js'

interface AnnualPurchaseContractDependencies {
  findCompanies: (where: Prisma.OrderWhereInput) => Promise<Array<{ inquiryCompany: string }>>
  findOrders: (where: Prisma.OrderWhereInput) => Promise<PurchaseContractOrder[]>
  buildWorkbook: (
    orders: PurchaseContractOrder[],
    options?: PurchaseContractWorkbookOptions
  ) => ReturnType<typeof buildPurchaseContractWorkbook>
}

const defaultDependencies: AnnualPurchaseContractDependencies = {
  findCompanies: (where) => prisma.order.findMany({
    where,
    select: { inquiryCompany: true },
    orderBy: { inquiryCompany: 'asc' }
  }),
  findOrders: (where) => prisma.order.findMany({
    where,
    include: purchaseContractOrderInclude,
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' }
    ]
  }),
  buildWorkbook: buildPurchaseContractWorkbook
}

export function createAnnualPurchaseContractHandlers(
  dependencies: AnnualPurchaseContractDependencies = defaultDependencies
) {
  return {
    async listCompanies(req: Request, res: Response) {
      if (!req.user) {
        return res.status(401).json({ message: 'Please sign in' })
      }

      const year = parseAnnualPurchaseContractYear(req.query.year)
      if (!year) {
        return res.status(400).json({ message: 'Invalid year' })
      }

      try {
        const where = buildAnnualPurchaseContractWhere({
          year,
          role: req.user.role,
          userId: req.user.id
        })
        const rows = await dependencies.findCompanies(where)
        const items = [...new Set(
          rows
            .map((row) => row.inquiryCompany)
            .filter((company) => Boolean(company.trim()))
        )].sort((left, right) => (
          left.trim().localeCompare(right.trim(), 'zh-CN')
          || left.localeCompare(right, 'zh-CN')
        ))

        return res.json({ items })
      } catch {
        return res.status(500).json({ message: 'Failed to load customers' })
      }
    },

    async exportContracts(req: Request, res: Response) {
      if (!req.user) {
        return res.status(401).json({ message: 'Please sign in' })
      }

      const year = parseAnnualPurchaseContractYear(req.query.year)
      const inquiryCompany = typeof req.query.inquiryCompany === 'string'
        && req.query.inquiryCompany.trim()
        ? req.query.inquiryCompany
        : ''

      if (!year || !inquiryCompany) {
        return res.status(400).json({ message: 'Year and customer are required' })
      }

      try {
        const where = buildAnnualPurchaseContractWhere({
          year,
          role: req.user.role,
          userId: req.user.id,
          inquiryCompany
        })
        const orders = await dependencies.findOrders(where)

        if (!orders.length) {
          return res.status(404).json({ message: 'No matching purchase contract data' })
        }

        const workbook = dependencies.buildWorkbook(orders, { includeCreatedAt: true })
        const buffer = await workbook.xlsx.writeBuffer()
        const safeCompany = inquiryCompany.trim().replace(/[\\/:*?"<>|]/g, '_')
        const filename = `${year}-${safeCompany}-Annual Purchase Contract Summary.xlsx`

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
        return res.send(Buffer.from(buffer))
      } catch {
        return res.status(500).json({ message: 'Failed to export annual purchase contracts' })
      }
    }
  }
}

const annualPurchaseContractHandlers = createAnnualPurchaseContractHandlers()

export const listAnnualPurchaseContractCompanies = annualPurchaseContractHandlers.listCompanies
export const exportAnnualPurchaseContracts = annualPurchaseContractHandlers.exportContracts
