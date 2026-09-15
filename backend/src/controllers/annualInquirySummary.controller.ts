import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'

import {
  buildAnnualInquirySummary,
  buildAnnualInquirySummaryWhere
} from '../utils/annualInquirySummary.js'
import { buildAnnualInquirySummaryWorkbook } from '../utils/annualInquirySummaryWorkbook.js'
import { parseAnnualPurchaseContractYear } from '../utils/annualPurchaseContracts.js'
import type { InquiryCompanySourceItem } from '../utils/inquiryCompanyAnalysis.js'
import { prisma } from '../utils/prisma.js'

interface AnnualInquirySummaryDependencies {
  findInquiryItems: (where: Prisma.InquiryItemWhereInput) => Promise<InquiryCompanySourceItem[]>
  buildWorkbook: typeof buildAnnualInquirySummaryWorkbook
}

const defaultDependencies: AnnualInquirySummaryDependencies = {
  findInquiryItems: (where) => prisma.inquiryItem.findMany({
    where,
    select: {
      result: true,
      inquiry: {
        select: { inquiryCompany: true }
      }
    }
  }),
  buildWorkbook: buildAnnualInquirySummaryWorkbook
}

export function createAnnualInquirySummaryHandler(
  dependencies: AnnualInquirySummaryDependencies = defaultDependencies
) {
  return async function exportAnnualInquirySummary(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    const year = parseAnnualPurchaseContractYear(req.query.year)
    if (!year) {
      return res.status(400).json({ message: 'Invalid year' })
    }

    try {
      const where = buildAnnualInquirySummaryWhere({
        year,
        role: req.user.role,
        userId: req.user.id
      })
      const rows = await dependencies.findInquiryItems(where)
      const summary = buildAnnualInquirySummary(rows)

      if (!summary.length) {
        return res.status(404).json({ message: 'No inquiry summary data for this year' })
      }

      const workbook = dependencies.buildWorkbook(summary)
      const buffer = await workbook.xlsx.writeBuffer()
      const filename = `${year}-Annual Inquiry Summary.xlsx`

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
      return res.send(Buffer.from(buffer))
    } catch {
      return res.status(500).json({ message: 'Failed to export annual inquiry summary' })
    }
  }
}

export const exportAnnualInquirySummary = createAnnualInquirySummaryHandler()
