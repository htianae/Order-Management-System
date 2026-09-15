export const ORDER_STATUS_TEXT: Record<string, string> = {
  INQUIRY: 'Inquiry',
  QUOTED: 'Quote',
  BID_WON: 'Won',
  BID_LOST: 'Lost',
  PURCHASING: 'Purchase',
  PURCHASE_PAYMENT: 'Payment Request Pending Management Approval',
  SUPPLIER_SHIPPED: 'Logistics',
  ARRIVED_COMPANY: 'Shipping Request Pending Management Approval',
  SHIPPED_TO_CUSTOMER: 'Shipping / Logistics',
  CUSTOMER_PAID: 'Customer Payments',
  COMPLETED: 'Completed',
  LOST_ARCHIVED: 'Lost — Archived'
}

export const ORDER_STATUS_OPTIONS = [
  { label: 'Purchase', value: 'PURCHASING' },
  { label: 'Payment Request Pending Management Approval', value: 'PURCHASE_PAYMENT' },
  { label: 'Shipping / Logistics', value: 'SHIPPED_TO_CUSTOMER' },
  { label: 'Shipping Request Pending Management Approval', value: 'ARRIVED_COMPANY' },
  { label: 'Customer Payments', value: 'CUSTOMER_PAID' },
  { label: 'Completed', value: 'COMPLETED' }
]

export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PURCHASING: ['PURCHASE_PAYMENT'],
  PURCHASE_PAYMENT: ['SHIPPED_TO_CUSTOMER'],
  SHIPPED_TO_CUSTOMER: ['ARRIVED_COMPANY'],
  ARRIVED_COMPANY: ['CUSTOMER_PAID'],
  CUSTOMER_PAID: ['COMPLETED']
}

export const FILE_CATEGORY_TEXT: Record<string, string> = {
  SUPPLIER_QUOTE: 'Supplier Quote File',
  BID_CONTRACT: 'Customer Contract',
  PURCHASE_CONTRACT: 'Purchase Contract',
  PAYMENT_APPLICATION: 'Payment Request',
  SHIPPING_APPLICATION: 'Shipping Approval Excel',
  PRODUCT_IMAGE: 'Product Images',
  SHIPPING_IMAGE: 'Shipping Images',
  OTHER: 'Other'
}

export const FILE_CATEGORY_OPTIONS = [
  { label: 'Supplier Quote File', value: 'SUPPLIER_QUOTE' },
  { label: 'Customer Contract', value: 'BID_CONTRACT' },
  { label: 'Purchase Contract', value: 'PURCHASE_CONTRACT' },
  { label: 'Payment Request', value: 'PAYMENT_APPLICATION' },
  { label: 'Shipping Approval Excel', value: 'SHIPPING_APPLICATION' },
  { label: 'Product Images', value: 'PRODUCT_IMAGE' },
  { label: 'Shipping Images', value: 'SHIPPING_IMAGE' }
]

export const BUSINESS_FILE_TYPE_OPTIONS = [
  { label: 'Customer Contract', value: 'WINNING_CONTRACT' },
  { label: 'Purchase Contract', value: 'PURCHASE_CONTRACT' },
  { label: 'Payment Request', value: 'PAYMENT_APPLICATION' },
  { label: 'Shipping Approval Excel', value: 'SHIPPING_APPLICATION' },
  { label: 'Product Images', value: 'PRODUCT_PHOTO' },
  { label: 'Shipping Images', value: 'DELIVERY_PHOTO' },
  { label: 'Supplier Quote File', value: 'SUPPLIER_QUOTE_FILE' },
  { label: 'Other', value: 'OTHER' }
]
