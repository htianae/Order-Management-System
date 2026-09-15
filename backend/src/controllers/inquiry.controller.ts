import { InquiryResult, Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { z } from 'zod'

import { prisma } from '../utils/prisma.js'
import { tokenizeSearchText } from '../utils/searchTokens.js'

function isBossOrAdmin(role: string | undefined) {
  return role === 'BOSS' || role === 'ADMIN'
}

const inquiryItemSchema = z.object({
  materialCode: z.string().trim().optional().nullable(),
  materialName: z.string().trim().min(1, 'Please enter the item name'),
  modelSpec: z.string().trim().optional().nullable(),
  manufacturer: z.string().trim().optional().nullable(),
  supplierName: z.string().trim().optional().nullable(),
  unit: z.string().trim().optional().nullable(),
  quantity: z.number().nonnegative().optional().nullable(),
  quotedPrice: z.number().nonnegative().optional().nullable(),
  totalAmount: z.number().nonnegative().optional().nullable(),
  deliveryTime: z.string().trim().optional().nullable(),
  result: z.nativeEnum(InquiryResult).default(InquiryResult.PENDING),
  winningPrice: z.number().nonnegative().optional().nullable(),
  remark: z.string().trim().optional().nullable()
})

const createInquirySchema = z.object({
  inquiryNo: z.string().trim().optional().nullable(),
  inquiryCompany: z.string().trim().min(1, 'Please enter the customer'),
  inquiryPerson: z.string().trim().optional().nullable(),
  inquiryDate: z.string().trim().min(1, 'Please select the inquiry date'),
  remark: z.string().trim().optional().nullable(),
  overwrite: z.boolean().optional(),
  items: z.array(inquiryItemSchema).min(1, 'Please enter at least one inquiry item')
})

const bulkCreateInquirySchema = z.object({
  inquiries: z.array(createInquirySchema).min(1, 'Please import at least one inquiry')
})

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function toDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? undefined : new Prisma.Decimal(value)
}

function parseDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function serializeDecimal(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toString()
}

type CreateInquiryInput = z.infer<typeof createInquirySchema>

async function createInquiryRecord(tx: Prisma.TransactionClient, input: CreateInquiryInput, creatorId: string, inquiryDate: Date) {
  if (input.overwrite && input.inquiryNo) {
    await tx.inquiry.deleteMany({
      where: {
        inquiryNo: input.inquiryNo
      }
    })
  }

  return tx.inquiry.create({
    data: {
      inquiryNo: input.inquiryNo || null,
      inquiryCompany: input.inquiryCompany,
      inquiryPerson: input.inquiryPerson || null,
      inquiryDate,
      remark: input.remark || null,
      creatorId,
      items: {
        create: input.items.map((item, index) => ({
          lineNo: index + 1,
          materialCode: item.materialCode || null,
          materialName: item.materialName,
          modelSpec: item.modelSpec || null,
          manufacturer: item.manufacturer || null,
          supplierName: item.supplierName || null,
          unit: item.unit || null,
          quantity: toDecimal(item.quantity),
          quotedPrice: toDecimal(item.quotedPrice),
          totalAmount: toDecimal(item.totalAmount),
          deliveryTime: item.deliveryTime || null,
          result: item.result,
          winningPrice: toDecimal(item.winningPrice),
          remark: item.remark || null
        }))
      }
    },
    select: {
      id: true,
      inquiryCompany: true
    }
  })
}

function buildInquiryItemWhere(query: Request['query']): Prisma.InquiryItemWhereInput {
  const conditions: Prisma.InquiryItemWhereInput[] = []
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const companyName = typeof query.companyName === 'string' ? query.companyName.trim() : ''
  const manufacturer = typeof query.manufacturer === 'string' ? query.manufacturer.trim() : ''
  const supplier = typeof query.supplier === 'string' ? query.supplier.trim() : ''
  const deliveryTime = typeof query.deliveryTime === 'string' ? query.deliveryTime.trim() : ''
  const result = typeof query.result === 'string' ? query.result.trim() : ''
  const inquiryDate = typeof query.inquiryDate === 'string' ? query.inquiryDate.trim() : ''
  const year = query.year ? Number(query.year) : undefined

  if (search) {
    tokenizeSearchText(search).forEach((token) => {
      conditions.push({
        OR: [
          { materialName: { contains: token, mode: 'insensitive' } },
          { materialCode: { contains: token, mode: 'insensitive' } },
          { modelSpec: { contains: token, mode: 'insensitive' } },
          { remark: { contains: token, mode: 'insensitive' } },
          { manufacturer: { contains: token, mode: 'insensitive' } },
          { supplierName: { contains: token, mode: 'insensitive' } },
          { inquiry: { inquiryNo: { contains: token, mode: 'insensitive' } } },
          { inquiry: { inquiryCompany: { contains: token, mode: 'insensitive' } } }
        ]
      })
    })
  }

  if (companyName) {
    conditions.push({ inquiry: { inquiryCompany: { contains: companyName, mode: 'insensitive' } } })
  }

  if (manufacturer) {
    conditions.push({ manufacturer: { contains: manufacturer, mode: 'insensitive' } })
  }

  if (supplier) {
    conditions.push({ supplierName: { contains: supplier, mode: 'insensitive' } })
  }

  if (deliveryTime) {
    conditions.push({ deliveryTime: { contains: deliveryTime, mode: 'insensitive' } })
  }

  if (result && Object.values(InquiryResult).includes(result as InquiryResult)) {
    conditions.push({ result: result as InquiryResult })
  }

  if (inquiryDate) {
    const parsed = parseDate(inquiryDate)

    if (parsed) {
      const nextDay = new Date(parsed)
      nextDay.setDate(nextDay.getDate() + 1)
      conditions.push({
        inquiry: {
          inquiryDate: {
            gte: parsed,
            lt: nextDay
          }
        }
      })
    }
  }

  if (year && Number.isFinite(year)) {
    conditions.push({
      inquiry: {
        inquiryDate: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`)
        }
      }
    })
  }

  return conditions.length ? { AND: conditions } : {}
}

function buildInquiryItemOrderBy(query: Request['query']): Prisma.InquiryItemOrderByWithRelationInput[] {
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'inquiryDate'
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc'
  const directSortFields = new Set(['materialCode', 'materialName', 'modelSpec', 'manufacturer', 'quotedPrice', 'supplierName', 'result'])
  let primary: Prisma.InquiryItemOrderByWithRelationInput

  if (sortBy === 'companyName') {
    primary = { inquiry: { inquiryCompany: sortOrder } }
  } else if (sortBy === 'inquiryDate') {
    primary = { inquiry: { inquiryDate: sortOrder } }
  } else if (directSortFields.has(sortBy)) {
    primary = { [sortBy]: sortOrder } as Prisma.InquiryItemOrderByWithRelationInput
  } else {
    primary = { inquiry: { inquiryDate: 'desc' } }
  }

  return [primary, { inquiry: { inquiryDate: 'desc' } }, { createdAt: 'desc' }, { lineNo: 'asc' }]
}

export async function listInquiryItems(req: Request, res: Response) {
  const page = parsePositiveInt(req.query.page, 1)
  const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 20), 100)
  const where = buildInquiryItemWhere(req.query)
  const orderBy = buildInquiryItemOrderBy(req.query)

  const [items, total] = await Promise.all([
    prisma.inquiryItem.findMany({
      where,
      include: {
        inquiry: {
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true
              }
            }
          }
        }
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.inquiryItem.count({ where })
  ])

  return res.json({
    items: items.map((item) => ({
      id: item.id,
      inquiryId: item.inquiryId,
      lineNo: item.lineNo,
      materialCode: item.materialCode,
      materialName: item.materialName,
      modelSpec: item.modelSpec,
      manufacturer: item.manufacturer,
      supplierName: item.supplierName,
      unit: item.unit,
      quantity: serializeDecimal(item.quantity),
      quotedPrice: serializeDecimal(item.quotedPrice),
      totalAmount: serializeDecimal(item.totalAmount),
      deliveryTime: item.deliveryTime,
      result: item.result,
      winningPrice: serializeDecimal(item.winningPrice),
      remark: item.remark,
      inquiry: {
        id: item.inquiry.id,
        inquiryNo: item.inquiry.inquiryNo,
        inquiryCompany: item.inquiry.inquiryCompany,
        inquiryPerson: item.inquiry.inquiryPerson,
        inquiryDate: item.inquiry.inquiryDate,
        remark: item.inquiry.remark,
        creator: {
          id: item.inquiry.creator.id,
          username: item.inquiry.creator.username,
          realName: item.inquiry.creator.displayName
        }
      }
    })),
    pagination: {
      page,
      pageSize,
      total
    }
  })
}

export async function createInquiry(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const parsed = createInquirySchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid inquiry details', errors: parsed.error.flatten().fieldErrors })
  }

  const inquiryDate = parseDate(parsed.data.inquiryDate)

  if (!inquiryDate) {
    return res.status(400).json({ message: 'Invalid inquiry date format' })
  }

  const inquiry = await prisma.$transaction((tx) => createInquiryRecord(tx, parsed.data, req.user!.id, inquiryDate))

  return res.status(201).json({
    message: 'Inquiry saved',
    inquiry
  })
}

export async function bulkCreateInquiries(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Please sign in' })
  }

  const parsed = bulkCreateInquirySchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid bulk inquiry details', errors: parsed.error.flatten().fieldErrors })
  }

  const normalized = parsed.data.inquiries.map((inquiry) => ({
    input: inquiry,
    inquiryDate: parseDate(inquiry.inquiryDate)
  }))
  const invalid = normalized.find((item) => !item.inquiryDate)

  if (invalid) {
    return res.status(400).json({ message: `Invalid inquiry date format：${invalid.input.inquiryNo || invalid.input.inquiryCompany}` })
  }

  const result = await prisma.$transaction(async (tx) => {
    let inquiryCount = 0
    let itemCount = 0

    for (const item of normalized) {
      await createInquiryRecord(tx, item.input, req.user!.id, item.inquiryDate!)
      inquiryCount += 1
      itemCount += item.input.items.length
    }

    return { inquiryCount, itemCount }
  }, {
    timeout: 60000
  })

  return res.status(201).json({
    message: `Imported ${result.inquiryCount} inquiries with ${result.itemCount} items`,
    ...result
  })
}

export async function deleteInquiry(req: Request, res: Response) {
  if (!isBossOrAdmin(req.user?.role)) {
    return res.status(403).json({ message: 'Only managers can delete inquiries' })
  }

  const inquiryId = String(req.params.id)
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      inquiryCompany: true
    }
  })

  if (!inquiry) {
    return res.status(404).json({ message: 'Inquiry not found' })
  }

  await prisma.inquiry.delete({
    where: { id: inquiryId }
  })

  return res.json({
    message: 'Inquiry deleted',
    inquiry
  })
}
