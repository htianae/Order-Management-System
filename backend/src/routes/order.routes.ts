import { Router } from 'express'
import { UserRole } from '@prisma/client'

import {
  approveOrderPaymentApplication,
	  approveShippingApplication,
	  approvePurchaseBatch,
	  approveShippingBatch,
	  createOrder,
  createShippingApplication,
  deleteOrder,
  deleteOrderFile,
  downloadOrderFile,
  exportHistoryOrders,
  exportOrderPaymentApplication,
  exportPurchaseContract,
  exportPurchasePaymentApplication,
  exportShippingApplication,
  getOrderById,
  listAllOrderFiles,
  listMyOrders,
  listOrders,
  rejectPurchaseBatch,
  rejectShippingBatch,
  rejectShippingApplication,
  updateBidInfo,
  updateCustomerPayment,
  updateDeliveryInfo,
  updateOrderItemBasicInfo,
  updatePurchaseItemPricing,
  updateOrderItemStatus,
  updateOrderBasicInfo,
  updatePurchaseBatchContract,
  updatePurchaseBatchBasicInfo,
  updateSupplierQuoteSelection,
  uploadOrderFile,
  updatePurchaseInfo,
  updatePurchaseBatch,
  updateQuoteInfo,
  updateWinningInfo,
  updateOrderStatus
} from '../controllers/order.controller.js'
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware.js'
import { uploadOrderFile as uploadOrderFileMiddleware } from '../middlewares/upload.middleware.js'

const router = Router()

router.get('/', authenticate, listOrders)
router.post('/', authenticate, createOrder)
router.get('/mine', authenticate, listMyOrders)
router.get('/files/all', authenticate, authorizeRoles(UserRole.BOSS, UserRole.ADMIN), listAllOrderFiles)
router.get('/files/:fileId/download', authenticate, downloadOrderFile)
router.delete('/files/:fileId', authenticate, deleteOrderFile)
router.get('/history/export', authenticate, exportHistoryOrders)
router.get('/:id/shipping-application/export', authenticate, exportShippingApplication)
router.get('/:id/purchase-contract/export', authenticate, exportPurchaseContract)
router.get('/:id/payment-application/export', authenticate, exportOrderPaymentApplication)
router.get('/:id/purchase-batches/:batchId/payment-application/export', authenticate, exportPurchasePaymentApplication)
router.patch('/:id/items/:itemId/quotes/:quoteId/selection', authenticate, updateSupplierQuoteSelection)
router.patch('/:id/items/:itemId/basic-info', authenticate, updateOrderItemBasicInfo)
router.patch('/:id/purchase-item-pricing', authenticate, updatePurchaseItemPricing)
router.patch('/:id/items/:itemId/quote-info', authenticate, updateQuoteInfo)
router.patch('/:id/items/:itemId/bid-info', authenticate, updateBidInfo)
router.patch('/:id/items/:itemId/winning-info', authenticate, updateWinningInfo)
router.patch('/:id/items/:itemId/purchase-info', authenticate, updatePurchaseInfo)
router.patch('/:id/purchase-batch', authenticate, updatePurchaseBatch)
router.patch('/:id/purchase-batches/:batchId', authenticate, updatePurchaseBatch)
router.patch('/:id/purchase-batches/:batchId/basic-info', authenticate, updatePurchaseBatchBasicInfo)
router.patch('/:id/purchase-batches/:batchId/contract', authenticate, updatePurchaseBatchContract)
router.patch('/:id/payment-application/approve', authenticate, approveOrderPaymentApplication)
router.patch('/:id/purchase-batches/:batchId/approve', authenticate, approvePurchaseBatch)
router.patch('/:id/purchase-batches/:batchId/reject', authenticate, rejectPurchaseBatch)
router.patch('/:id/purchase-batches/:batchId/shipping/approve', authenticate, approveShippingBatch)
router.patch('/:id/purchase-batches/:batchId/shipping/reject', authenticate, rejectShippingBatch)
router.post('/:id/shipping-applications', authenticate, createShippingApplication)
router.patch('/:id/shipping-applications/:applicationId/approve', authenticate, approveShippingApplication)
router.patch('/:id/shipping-applications/:applicationId/reject', authenticate, rejectShippingApplication)
router.patch('/:id/items/:itemId/delivery-info', authenticate, updateDeliveryInfo)
router.patch('/:id/items/:itemId/customer-payment', authenticate, updateCustomerPayment)
router.post('/:id/items/:itemId/files', authenticate, uploadOrderFileMiddleware.single('file'), uploadOrderFile)
router.patch('/:id/quote-info', authenticate, updateQuoteInfo)
router.patch('/:id/bid-info', authenticate, updateBidInfo)
router.patch('/:id/winning-info', authenticate, updateWinningInfo)
router.patch('/:id/purchase-info', authenticate, updatePurchaseInfo)
router.patch('/:id/delivery-info', authenticate, updateDeliveryInfo)
router.patch('/:id/customer-payment', authenticate, updateCustomerPayment)
router.patch('/:id/items/:itemId/status', authenticate, updateOrderItemStatus)
router.patch('/:id/basic-info', authenticate, updateOrderBasicInfo)
router.patch('/:id/status', authenticate, updateOrderStatus)
router.post('/:id/files', authenticate, uploadOrderFileMiddleware.single('file'), uploadOrderFile)
router.delete('/:id', authenticate, deleteOrder)
router.get('/:id', authenticate, getOrderById)

export default router
