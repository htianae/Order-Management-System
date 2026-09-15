import { http } from './http'
import type {
  BossFileListQuery,
  BossFileListResponse,
  CreateShippingApplicationPayload,
  CreateOrderPayload,
  CreateOrderResponse,
  MyOrdersResponse,
  OrderDetailResponse,
  OrderListQuery,
  OrderListPageQuery,
  OrderListResponse,
  UploadOrderFileResponse,
  UpdateOrderBasicInfoPayload,
  UpdateBidInfoPayload,
  UpdateCustomerPaymentPayload,
  UpdateDeliveryInfoPayload,
  UpdateOrderItemBasicInfoPayload,
  UpdateOrderItemStatusPayload,
  UpdateOrderItemStatusResponse,
  UpdateOrderStatusPayload,
  UpdateOrderStatusResponse,
  UpdatePurchaseItemPricingPayload,
  UpdatePurchaseBatchBasicInfoPayload,
  UpdatePurchaseBatchPayload,
  UpdatePurchaseInfoPayload,
  UpdateQuoteInfoPayload,
  UpdateWinningInfoPayload
} from '@/types/order'
import { resolveCustomerPaymentStatus } from '@/utils/customerPaymentAction'

export function createOrderApi(payload: CreateOrderPayload) {
  return http.post<CreateOrderResponse>('/orders', payload)
}

export function getOrdersApi(params: OrderListPageQuery) {
  return http.get<OrderListResponse>('/orders', { params })
}

export function exportHistoryOrdersApi(params: Partial<OrderListQuery>) {
  return http.get<Blob>('/orders/history/export', {
    params,
    responseType: 'blob'
  })
}

export function getMyOrdersApi(params: OrderListQuery) {
  return http.get<MyOrdersResponse>('/orders/mine', { params })
}

export function getBossOrderFilesApi(params: BossFileListQuery) {
  return http.get<BossFileListResponse>('/orders/files/all', { params })
}

export function downloadOrderFileApi(fileId: string) {
  return http.get<Blob>(`/orders/files/${fileId}/download`, {
    responseType: 'blob'
  })
}

export function deleteOrderFileApi(fileId: string) {
  return http.delete<{ message: string }>(`/orders/files/${fileId}`)
}

export function getOrderDetailApi(id: string) {
  return http.get<OrderDetailResponse>(`/orders/${id}`)
}

export function deleteOrderApi(id: string) {
  return http.delete<{ message: string; order: { id: string; orderNo: string } }>(`/orders/${id}`)
}

export function exportShippingApplicationApi(id: string, batchIds: string[]) {
  return http.get<Blob>(`/orders/${id}/shipping-application/export`, {
    params: { batchIds: batchIds.join(',') },
    responseType: 'blob'
  })
}

export function exportPurchaseContractApi(id: string) {
  return http.get<Blob>(`/orders/${id}/purchase-contract/export`, {
    responseType: 'blob'
  })
}

export function exportPurchasePaymentApplicationApi(orderId: string, batchId: string) {
  return http.get<Blob>(`/orders/${orderId}/purchase-batches/${batchId}/payment-application/export`, {
    responseType: 'blob'
  })
}

export function exportOrderPaymentApplicationApi(orderId: string) {
  return http.get<Blob>(`/orders/${orderId}/payment-application/export`, {
    responseType: 'blob'
  })
}

export function approveOrderPaymentApplicationApi(orderId: string) {
  return http.patch<{ message: string }>(`/orders/${orderId}/payment-application/approve`)
}

export function updateOrderStatusApi(id: string, payload: UpdateOrderStatusPayload) {
  return http.patch<UpdateOrderStatusResponse>(`/orders/${id}/status`, payload)
}

export function updateOrderBasicInfoApi(id: string, payload: UpdateOrderBasicInfoPayload) {
  return http.patch(`/orders/${id}/basic-info`, payload)
}

export function updateOrderItemBasicInfoApi(orderId: string, itemId: string, payload: UpdateOrderItemBasicInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/basic-info`, payload)
}

export function updateOrderItemStatusApi(orderId: string, itemId: string, payload: UpdateOrderItemStatusPayload) {
  return http.patch<UpdateOrderItemStatusResponse>(`/orders/${orderId}/items/${itemId}/status`, payload)
}

export function updateQuoteInfo(orderId: string, data: UpdateQuoteInfoPayload) {
  return http.patch(`/orders/${orderId}/quote-info`, data)
}

export function updateItemQuoteInfo(orderId: string, itemId: string, data: UpdateQuoteInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/quote-info`, data)
}

export function updateItemQuoteSelection(orderId: string, itemId: string, quoteId: string, isSelected: boolean) {
  return http.patch(`/orders/${orderId}/items/${itemId}/quotes/${quoteId}/selection`, { isSelected })
}

export function updateBidInfo(orderId: string, data: UpdateBidInfoPayload) {
  return http.patch(`/orders/${orderId}/bid-info`, data)
}

export function updateItemBidInfo(orderId: string, itemId: string, data: UpdateBidInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/bid-info`, data)
}

export function updateWinningInfo(orderId: string, data: UpdateWinningInfoPayload) {
  return http.patch(`/orders/${orderId}/winning-info`, data)
}

export function updateItemWinningInfo(orderId: string, itemId: string, data: UpdateWinningInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/winning-info`, data)
}

export function updatePurchaseInfo(orderId: string, data: UpdatePurchaseInfoPayload) {
  return http.patch(`/orders/${orderId}/purchase-info`, data)
}

export function updateItemPurchaseInfo(orderId: string, itemId: string, data: UpdatePurchaseInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/purchase-info`, data)
}

export function updatePurchaseItemPricing(orderId: string, data: UpdatePurchaseItemPricingPayload) {
  return http.patch(`/orders/${orderId}/purchase-item-pricing`, data)
}

export function updatePurchaseBatch(orderId: string, data: UpdatePurchaseBatchPayload, batchId?: string) {
  return http.patch(batchId ? `/orders/${orderId}/purchase-batches/${batchId}` : `/orders/${orderId}/purchase-batch`, data)
}

export function updatePurchaseBatchBasicInfo(orderId: string, batchId: string, data: UpdatePurchaseBatchBasicInfoPayload) {
  return http.patch(`/orders/${orderId}/purchase-batches/${batchId}/basic-info`, data)
}

export function updatePurchaseBatchContract(orderId: string, batchId: string, purchaseContractFileId: string | null) {
  return http.patch(`/orders/${orderId}/purchase-batches/${batchId}/contract`, {
    purchaseContractFileId
  })
}

export function approvePurchaseBatch(orderId: string, batchId: string) {
  return http.patch(`/orders/${orderId}/purchase-batches/${batchId}/approve`)
}

export function rejectPurchaseBatch(orderId: string, batchId: string) {
  return http.patch(`/orders/${orderId}/purchase-batches/${batchId}/reject`)
}

export function approveShippingBatch(orderId: string, batchId: string) {
  return http.patch<{ message: string }>(`/orders/${orderId}/purchase-batches/${batchId}/shipping/approve`)
}

export function rejectShippingBatch(orderId: string, batchId: string) {
  return http.patch<{ message: string }>(`/orders/${orderId}/purchase-batches/${batchId}/shipping/reject`)
}

export function createShippingApplication(orderId: string, data: CreateShippingApplicationPayload) {
  return http.post<{ message: string }>(`/orders/${orderId}/shipping-applications`, data)
}

export function approveShippingApplication(orderId: string, applicationId: string) {
  return http.patch<{ message: string }>(`/orders/${orderId}/shipping-applications/${applicationId}/approve`)
}

export function rejectShippingApplication(orderId: string, applicationId: string) {
  return http.patch<{ message: string }>(`/orders/${orderId}/shipping-applications/${applicationId}/reject`)
}

export function updateDeliveryInfo(orderId: string, data: UpdateDeliveryInfoPayload) {
  return http.patch(`/orders/${orderId}/delivery-info`, data)
}

export function updateItemDeliveryInfo(orderId: string, itemId: string, data: UpdateDeliveryInfoPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/delivery-info`, data)
}

export function updateCustomerPayment(orderId: string, data: UpdateCustomerPaymentPayload) {
  return http.patch(`/orders/${orderId}/customer-payment`, {
    ...data,
    customerPaymentStatus: resolveCustomerPaymentStatus(data.customerPaymentAmount)
  })
}

export function updateItemCustomerPayment(orderId: string, itemId: string, data: UpdateCustomerPaymentPayload) {
  return http.patch(`/orders/${orderId}/items/${itemId}/customer-payment`, {
    ...data,
    customerPaymentStatus: resolveCustomerPaymentStatus(data.customerPaymentAmount)
  })
}

export function uploadOrderFileApi(id: string, formData: FormData) {
  return http.post<UploadOrderFileResponse>(`/orders/${id}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export function uploadOrderItemFileApi(orderId: string, itemId: string, formData: FormData) {
  return http.post<UploadOrderFileResponse>(`/orders/${orderId}/items/${itemId}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
}

export function uploadOrderFile(orderId: string, fileType: string, file: File) {
  const formData = new FormData()
  formData.append('fileType', fileType)
  formData.append('file', file)
  return uploadOrderFileApi(orderId, formData)
}

export function uploadOrderItemFile(orderId: string, itemId: string, fileType: string, file: File) {
  const formData = new FormData()
  formData.append('fileType', fileType)
  formData.append('file', file)
  return uploadOrderItemFileApi(orderId, itemId, formData)
}
