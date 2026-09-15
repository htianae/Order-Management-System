import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApprovedShippingSummaries } from './shippingApprovalSummaries'

test('builds approved shipping summaries grouped by purchase batch', () => {
  const summaries = buildApprovedShippingSummaries({
    inquiryCompany: '询价公司A',
    purchaseBatches: [
      {
        id: 'batch-1',
        supplierName: '供应商A',
        batchItems: [
          { id: 'item-1', lineNo: 1, materialDescription: '物料A', materialCode: null, currentStatus: 'CUSTOMER_PAID' },
          { id: 'item-2', lineNo: 2, materialDescription: '物料B', materialCode: null, currentStatus: 'CUSTOMER_PAID' }
        ]
      },
      {
        id: 'batch-2',
        supplierName: '供应商B',
        batchItems: [
          { id: 'item-3', lineNo: 3, materialDescription: '物料C', materialCode: null, currentStatus: 'ARRIVED_COMPANY' }
        ]
      }
    ],
    orderItems: [
      { id: 'item-1', shippingInfo: { buyerCompany: '购货单位A' } },
      { id: 'item-2', shippingInfo: { buyerCompany: '购货单位A' } },
      { id: 'item-3', shippingInfo: { buyerCompany: '购货单位B' } }
    ],
    itemStatusRecords: [
      {
        orderItem: { id: 'item-1' },
        fromStatus: 'ARRIVED_COMPANY',
        toStatus: 'CUSTOMER_PAID',
        createdAt: '2026-07-24T07:00:00.000Z'
      },
      {
        orderItem: { id: 'item-2' },
        fromStatus: 'ARRIVED_COMPANY',
        toStatus: 'CUSTOMER_PAID',
        createdAt: '2026-07-24T07:05:00.000Z'
      }
    ],
    files: [
      {
        id: 'file-1',
        category: 'SHIPPING_APPLICATION',
        targetId: 'item-1',
        originalName: '物流审批.xlsx'
      }
    ]
  })

  assert.deepEqual(summaries, [
    {
      batchId: 'batch-1',
      supplierName: '供应商A',
      buyerCompany: '询价公司A',
      purchasePackageText: '1. 物料A；2. 物料B',
      approvedAt: '2026-07-24T07:05:00.000Z',
      file: {
        id: 'file-1',
        category: 'SHIPPING_APPLICATION',
        targetId: 'item-1',
        originalName: '物流审批.xlsx'
      }
    }
  ])
})

test('uses placeholder values when buyer company or uploaded excel is missing', () => {
  const summaries = buildApprovedShippingSummaries({
    inquiryCompany: '询价公司A',
    purchaseBatches: [
      {
        id: 'batch-1',
        supplierName: null,
        batchItems: [
          { id: 'item-1', lineNo: 1, materialDescription: null, materialCode: 'M-1', currentStatus: 'COMPLETED' }
        ]
      }
    ],
    orderItems: [
      { id: 'item-1', shippingInfo: null }
    ],
    itemStatusRecords: [
      {
        orderItem: { id: 'item-1' },
        fromStatus: 'ARRIVED_COMPANY',
        toStatus: 'CUSTOMER_PAID',
        createdAt: '2026-07-24T07:00:00.000Z'
      }
    ],
    files: []
  })

  assert.equal(summaries[0].supplierName, null)
  assert.equal(summaries[0].buyerCompany, '询价公司A')
  assert.equal(summaries[0].purchasePackageText, '1. M-1')
  assert.equal(summaries[0].file, null)
})
