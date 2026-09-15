import {
  BidResult,
  CustomerPaymentStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentStatus
} from '@prisma/client'
import { z } from 'zod'

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional()
  )

const optionalDecimal = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().nonnegative('Must be at least 0').optional()
)

const optionalMoney = optionalDecimal.superRefine((value, context) => {
  if (value === undefined) {
    return
  }

  const rounded = Math.round(value * 100) / 100
  if (Math.abs(value - rounded) > 1e-9) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Amount must have no more than two decimal places'
    })
  }

  if (value > 999_999_999_999.99) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Amount exceeds the allowed range'
    })
  }
})

const requiredDecimal = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().nonnegative('Must be at least 0')
)

const optionalBoolean = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.boolean().optional()
)

const nullableDateText = z.preprocess(
  (value) => (value === '' || value === null ? null : value),
  z.string().trim().max(40).nullable().optional()
)

const statusAliasMap: Record<string, OrderStatus> = {
  WON: OrderStatus.BID_WON,
  LOST: OrderStatus.BID_LOST,
  SHIPPED_CUSTOMER: OrderStatus.SHIPPED_TO_CUSTOMER
}

const orderStatusSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return statusAliasMap[value] || value
  }

  return value
}, z.nativeEnum(OrderStatus))

export const createOrderItemSchema = z.object({
  materialCode: optionalText(120),
  materialDescription: optionalText(1000),
  remark: optionalText(1000),
  supplierRemark: optionalText(1000),
  manufacturer: optionalText(160),
  quantity: optionalDecimal,
  unit: optionalText(32),
  quotedPrice: optionalDecimal,
  taxIncludedTotal: optionalDecimal,
  deliveryTime: optionalText(120),
  inquiryRemark: optionalText(1000),
  applicantDepartment: optionalText(160)
})

export const createOrderSchema = z.object({
  orderNo: z.string().trim().min(1, 'Order number is required').max(80, 'Order number must not exceed 80 characters'),
  inquiryCompany: z.string().trim().min(1, 'Customer is required').max(160, 'Customer must not exceed 160 characters'),
  declarationCompany: optionalText(160),
  inquiryPerson: optionalText(80),
  inquiryDate: z.string().trim().min(1, 'Inquiry date is required'),
  inquiryNo: optionalText(80),
  productCode: optionalText(120),
  productNameCn: optionalText(200),
  modelSpec: optionalText(240),
  quantity: optionalDecimal,
  items: z.array(createOrderItemSchema).min(1, 'At least one order item is required')
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const updateOrderBasicInfoSchema = createOrderSchema.omit({ items: true }).partial().extend({
  orderNo: z.string().trim().min(1, 'Order number is required').max(80, 'Order number must not exceed 80 characters').optional(),
  inquiryCompany: z.string().trim().min(1, 'Customer is required').max(160, 'Customer must not exceed 160 characters').optional(),
  arrivedAtCompanyAt: nullableDateText
})

export type UpdateOrderBasicInfoInput = z.infer<typeof updateOrderBasicInfoSchema>

export const updateOrderItemBasicInfoSchema = createOrderItemSchema.partial()

export type UpdateOrderItemBasicInfoInput = z.infer<typeof updateOrderItemBasicInfoSchema>

const sharedOrderSortFields = [
  'orderNo',
  'inquiryCompany',
  'productNameCn',
  'currentStatus',
  'creatorName',
  'createdAt',
  'deliveryReminder'
] as const

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  orderNo: optionalText(80),
  companyName: optionalText(160),
  productName: optionalText(200),
  productCode: optionalText(120),
  modelSpec: optionalText(240),
  supplier: optionalText(160),
  creator: optionalText(120),
  status: z.nativeEnum(OrderStatus).optional(),
  bidResult: z.nativeEnum(BidResult).optional(),
  deliveryMonth: optionalText(7),
  deliveryTime: optionalText(120),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  amountMin: optionalDecimal,
  amountMax: optionalDecimal,
  sortBy: z.enum(sharedOrderSortFields).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
})

export type OrderListQuery = z.infer<typeof orderListQuerySchema>

export const orderListPageQuerySchema = orderListQuerySchema.extend({
  sortBy: z.enum([...sharedOrderSortFields, 'deliveryTime']).default('createdAt')
})

export type OrderListPageQuery = z.infer<typeof orderListPageQuerySchema>

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().max(1000, 'Remarks must not exceed 1,000 characters').optional()
    )
    .optional()
})

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>

export const updateOrderItemStatusSchema = updateOrderStatusSchema.extend({
  winningPrice: optionalDecimal,
  lostReason: optionalText(1000)
})

export type UpdateOrderItemStatusInput = z.infer<typeof updateOrderItemStatusSchema>

export const updateQuoteInfoSchema = z.object({
  supplierName: z.string().trim().min(1, 'Supplier name is required').max(160),
  contactName: optionalText(80),
  phone: optionalText(32),
  quotedPrice: requiredDecimal,
  deliveryTime: optionalText(120),
  remark: optionalText(1000),
  quoteFileId: optionalText(120),
  isSelected: z.coerce.boolean().default(false)
})

export const updateBidInfoSchema = z.object({
  bidPrice: requiredDecimal
})

export const updateWinningInfoSchema = z.object({
  result: z.enum(['WON', 'LOST']),
  winningPrice: optionalDecimal,
  winningContractFileId: optionalText(120),
  lostReason: optionalText(1000)
})

export const updatePurchaseInfoSchema = z.object({
  purchaseCost: optionalDecimal,
  purchaseContractFileId: optionalText(120),
  paymentApplicationFileId: optionalText(120),
  supplierName: optionalText(160),
  deliveryTime: optionalText(120),
  paymentPercent: optionalDecimal,
  bankName: optionalText(240),
  bankAccount: optionalText(120),
  advancePaymentAmount: optionalDecimal,
  advancePaymentStatus: z.nativeEnum(PaymentStatus).optional(),
  arrivalPaymentAmount: optionalDecimal,
  arrivalPaymentStatus: z.nativeEnum(PaymentStatus).optional(),
  paymentRemark: optionalText(1000),
  supplierLogisticsCompany: optionalText(160),
  supplierLogisticsNo: optionalText(120),
  invoiceStatus: z.nativeEnum(InvoiceStatus).optional()
})

export const purchaseItemPricingSchema = z.object({
  itemId: z.string().trim().min(1),
  purchaseQuantity: optionalDecimal,
  purchaseUnitPrice: optionalDecimal,
  purchaseTotal: optionalDecimal
})

export const updatePurchaseItemPricingSchema = z.object({
  items: z.array(purchaseItemPricingSchema).min(1, 'Please enter at least one item')
})

export const updatePurchaseBatchSchema = updatePurchaseInfoSchema.extend({
  itemIds: z.array(z.string().trim().min(1)).min(1, 'Please select at least one item'),
  itemPricing: z.array(purchaseItemPricingSchema).optional(),
  submitForApproval: z.coerce.boolean().optional()
})

export const updatePurchaseBatchBasicInfoSchema = z.object({
  purchaseCost: optionalDecimal,
  supplierName: optionalText(160),
  deliveryTime: optionalText(120)
})

export const createShippingApplicationSchema = z.object({
  batchIds: z.array(z.string().trim().min(1)).min(1, 'Please select at least one purchase batch'),
  fileId: z.string().trim().min(1, 'Please upload the shipping approval Excel file'),
  logisticsCompany: z.string().trim().min(1, 'Please enter the logistics company').max(160),
  trackingNo: z.string().trim().min(1, 'Please enter the tracking number').max(120),
  remark: optionalText(1000)
})

export const shippingApplicationExportQuerySchema = z.object({
  batchIds: z.string().trim().min(1, 'Please select the purchase batches to export').transform((value) => value
    .split(',')
    .map((batchId) => batchId.trim()))
    .refine((batchIds) => batchIds.every(Boolean), 'Purchase batch ID is required')
    .refine((batchIds) => new Set(batchIds).size === batchIds.length, 'Purchase batches must be unique')
})

export const updateDeliveryInfoSchema = z.object({
  productPhotoFileId: optionalText(120),
  deliveryPhotoFileId: optionalText(120),
  shippingDate: optionalText(40),
  buyerCompany: optionalText(160),
  shippingAmount: optionalDecimal,
  weight: optionalText(80),
  packageCount: optionalText(80),
  packageSize: optionalText(160),
  contractNo: optionalText(120),
  salesperson: optionalText(80),
  goodsName: optionalText(200),
  supplierBrand: optionalText(200),
  shippingQuantity: optionalText(80),
  expectedDeliveryDate: optionalText(40),
  needsWoodenBox: optionalBoolean,
  woodenBoxPrice: optionalText(120),
  woodenBoxFreight: optionalText(120),
  route: optionalText(200),
  needsTransfer: optionalBoolean,
  transferLogistics: optionalText(160),
  estimatedTransferPrice: optionalText(160),
  billingWeight: optionalText(80),
  freightEstimate: optionalText(2000),
  applicant: optionalText(80),
  approver: optionalText(80),
  buyerLogisticsCompany: optionalText(160),
  buyerLogisticsNo: optionalText(120),
  remark: optionalText(1000)
})

export const updateCustomerPaymentSchema = z.object({
  customerPaymentStatus: z.nativeEnum(CustomerPaymentStatus),
  customerPaymentAmount: optionalMoney,
  paidAt: optionalText(40),
  remark: optionalText(1000)
})
