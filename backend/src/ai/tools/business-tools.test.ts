import assert from 'node:assert/strict'
import test from 'node:test'

import { Prisma } from '@prisma/client'

import { calculateRecommendedQuoteFromData } from './calculateRecommendedQuote.tool.js'
import { executeGetDelayedOrders } from './delayedOrders.tool.js'
import { executeGetEmployeePerformance } from './employeePerformance.tool.js'
import { executeGetCustomerDealRanking } from './customerDealRanking.tool.js'
import { executeGetHistoricalQuoteRecommendation } from './historicalQuoteRecommendation.tool.js'
import { executeAnalyzeManufacturerPerformance } from './manufacturerPerformance.tool.js'
import { executeGetMonthlyBusinessInsights } from './monthlyBusinessInsights.tool.js'
import { executeGetOrderDetail } from './orderDetail.tool.js'
import { executeAnalyzeProductPerformance } from './productPerformance.tool.js'
import { executeSearchSimilarWonOrders } from './similarWonOrders.tool.js'
import { executeGetUnpaidOrders } from './unpaidOrders.tool.js'
import type { ToolContext } from './tool-types.js'

const employeeContext: ToolContext = {
  user: {
    id: 'user-1',
    username: 'u1',
    realName: null,
    role: 'EMPLOYEE'
  }
}

const bossContext: ToolContext = {
  user: {
    id: 'boss-1',
    username: 'boss',
    realName: null,
    role: 'BOSS'
  }
}

test('get_order_detail applies employee order scope', async () => {
  const calls: unknown[] = []
  const db = {
    order: {
      findFirst: async (args: unknown) => {
        calls.push(args)
        return null
      }
    }
  }

  const result = await executeGetOrderDetail({ orderNo: 'A001' }, employeeContext, db)

  assert.equal(result.found, false)
  assert.match(JSON.stringify(calls[0]), /creatorId/)
  assert.match(JSON.stringify(calls[0]), /ownerId/)
})

test('search_similar_won_orders ranks code and name matches', async () => {
  const db = {
    order: {
      findMany: async () => [
        {
          id: 'o1',
          orderNo: 'A001',
          inquiryCompany: '客户A',
          inquiryDate: new Date('2026-01-01'),
          winningAmount: { toString: () => '1000' },
          quotedAmount: { toString: () => '1200' },
          items: [
            {
              id: 'i1',
              materialCode: 'ABC-1',
              materialDescription: '冷却风机',
              remark: 'GFDD520',
              quantity: { toString: () => '2' },
              quotedPrice: { toString: () => '500' },
              winningAmount: { toString: () => '900' },
              purchaseTotal: { toString: () => '600' }
            }
          ]
        },
        {
          id: 'o2',
          orderNo: 'B001',
          inquiryCompany: '客户B',
          inquiryDate: new Date('2024-01-01'),
          winningAmount: { toString: () => '200' },
          quotedAmount: null,
          items: [
            {
              id: 'i2',
              materialCode: 'ZZZ',
              materialDescription: '无关产品',
              remark: '',
              quantity: { toString: () => '1' },
              quotedPrice: null,
              winningAmount: { toString: () => '200' },
              purchaseTotal: null
            }
          ]
        }
      ]
    }
  }

  const result = await executeSearchSimilarWonOrders({
    materialCode: 'ABC-1',
    materialName: '冷却风机',
    modelSpec: 'GFDD520',
    quantity: 2,
    customerName: '客户A'
  }, bossContext, db)

  assert.equal(result.matches[0].orderNo, 'A001')
  assert.equal(result.matches.length, 1)
  assert.ok(result.matches[0].score > 0)
  assert.ok(result.matches[0].reasons.includes('Item code match'))
})

test('calculate_recommended_quote returns insufficient data when history is empty', () => {
  const result = calculateRecommendedQuoteFromData({
    targetProfitRate: 0.2,
    purchaseCost: 500,
    similarOrders: []
  })

  assert.equal(result.dataSufficient, false)
  assert.ok(result.dataInsufficientReasons.includes('No similar historical won orders found'))
})

test('calculate_recommended_quote calculates a deterministic range', () => {
  const result = calculateRecommendedQuoteFromData({
    targetProfitRate: 0.2,
    purchaseCost: 800,
    similarOrders: [
      { unitPrice: 1000, orderNo: 'A001' },
      { unitPrice: 1100, orderNo: 'A002' },
      { unitPrice: 900, orderNo: 'A003' }
    ]
  })

  assert.equal(result.dataSufficient, true)
  assert.equal(result.referencePrice, 1000)
  assert.ok(result.recommendedRange.low <= result.recommendedRange.middle)
  assert.ok(result.recommendedRange.middle <= result.recommendedRange.high)
})

test('get_customer_deal_ranking ranks won orders by customer within the requested year', async () => {
  const calls: unknown[] = []
  const db = {
    order: {
      findMany: async (args: unknown) => {
        calls.push(args)
        return [
          {
            id: 'o1',
            orderNo: 'A001',
            inquiryCompany: '客户A',
            inquiryDate: new Date('2026-01-01'),
            winningAmount: { toString: () => '1000' },
            profit: { toString: () => '200' },
            items: [{ materialDescription: '冷却风机' }]
          },
          {
            id: 'o2',
            orderNo: 'A002',
            inquiryCompany: '客户A',
            inquiryDate: new Date('2026-02-01'),
            winningAmount: { toString: () => '500' },
            profit: { toString: () => '80' },
            items: [{ materialDescription: '变频器' }]
          },
          {
            id: 'o3',
            orderNo: 'B001',
            inquiryCompany: '客户B',
            inquiryDate: new Date('2026-03-01'),
            winningAmount: { toString: () => '3000' },
            profit: { toString: () => '600' },
            items: [{ materialDescription: '冷却风机' }]
          }
        ]
      }
    }
  }

  const result = await executeGetCustomerDealRanking({ year: 2026, sortBy: 'orderCount' }, employeeContext, db)

  assert.equal(result.year, 2026)
  assert.equal(result.totalWonOrderCount, 3)
  assert.equal(result.rankings[0].companyName, '客户A')
  assert.equal(result.rankings[0].wonOrderCount, 2)
  assert.equal(result.rankings[0].winningAmount, 1500)
  assert.equal(result.rankings[0].profit, 280)
  assert.match(JSON.stringify(calls[0]), /creatorId/)
  assert.match(JSON.stringify(calls[0]), /bidResult/)
})

test('get_historical_quote_recommendation uses won and lost history for pricing advice', async () => {
  const db = {
    order: {
      findMany: async () => [
        {
          id: 'o1',
          orderNo: 'W001',
          inquiryCompany: '客户A',
          inquiryDate: new Date('2026-01-01'),
          bidResult: 'WON',
          winningAmount: { toString: () => '1000' },
          quotedAmount: { toString: () => '1100' },
          items: [
            {
              materialCode: 'FAN-1',
              materialDescription: '冷却风机',
              remark: 'GFDD520',
              quantity: { toString: () => '2' },
              quotedPrice: { toString: () => '500' },
              winningAmount: { toString: () => '1000' },
              purchaseTotal: { toString: () => '700' }
            }
          ]
        },
        {
          id: 'o2',
          orderNo: 'L001',
          inquiryCompany: '客户B',
          inquiryDate: new Date('2026-02-01'),
          bidResult: 'LOST',
          winningAmount: null,
          quotedAmount: { toString: () => '1400' },
          items: [
            {
              materialCode: 'FAN-1',
              materialDescription: '冷却风机',
              remark: 'GFDD520',
              quantity: { toString: () => '2' },
              quotedPrice: { toString: () => '700' },
              winningAmount: null,
              purchaseTotal: null
            }
          ]
        }
      ]
    }
  }

  const result = await executeGetHistoricalQuoteRecommendation({
    materialCode: 'FAN-1',
    materialName: '冷却风机',
    modelSpec: 'GFDD520',
    quantity: 2,
    purchaseCost: 350,
    targetProfitRate: 0.2
  }, bossContext, db)

  assert.equal(result.wonMatches.length, 1)
  assert.equal(result.lostMatches.length, 1)
  assert.equal(result.recommendation.referencePrice, 500)
  assert.ok(result.recommendation.recommendedRange.middle >= 500)
  assert.match(result.summary, /historical won/)
})

test('analyze_product_performance counts fuzzy inquiry and won product matches', async () => {
  const db = {
    inquiryItem: {
      findMany: async () => [
        {
          id: 'inq-1',
          materialCode: 'FAN-1',
          materialName: '冷却风机 GFDD520-120/A3',
          modelSpec: '850m3/h',
          manufacturer: '绍兴上虞',
          supplierName: '供应商A',
          quotedPrice: { toString: () => '430' },
          result: 'WON',
          inquiry: { inquiryCompany: '客户A', inquiryDate: new Date('2026-05-01') }
        },
        {
          id: 'inq-2',
          materialCode: 'FAN-2',
          materialName: '变压器风机GFDD520',
          modelSpec: '120/B3',
          manufacturer: '绍兴上虞',
          supplierName: '供应商B',
          quotedPrice: { toString: () => '460' },
          result: 'LOST',
          inquiry: { inquiryCompany: '客户B', inquiryDate: new Date('2026-05-02') }
        },
        {
          id: 'inq-3',
          materialCode: 'OTHER',
          materialName: '电磁阀',
          modelSpec: 'SMC',
          manufacturer: 'SMC',
          supplierName: '供应商C',
          quotedPrice: { toString: () => '80' },
          result: 'WON',
          inquiry: { inquiryCompany: '客户C', inquiryDate: new Date('2026-05-03') }
        }
      ]
    },
    order: {
      findMany: async () => [
        {
          id: 'o1',
          orderNo: 'W001',
          inquiryCompany: '客户A',
          inquiryDate: new Date('2026-05-04'),
          bidResult: 'WON',
          winningAmount: { toString: () => '860' },
          items: [
            {
              materialCode: 'FAN-1',
              materialDescription: '冷却风机\\GFDD520-120/A3',
              remark: '850m3/h',
              manufacturer: '绍兴上虞',
              quantity: { toString: () => '2' },
              quotedPrice: { toString: () => '430' },
              winningAmount: { toString: () => '860' }
            }
          ]
        }
      ]
    }
  }

  const result = await executeAnalyzeProductPerformance({ year: 2026, month: 5, productKeyword: '冷却风机 GFDD520' }, bossContext, db)

  assert.equal(result.inquiryCount, 2)
  assert.equal(result.inquiryWonCount, 1)
  assert.equal(result.orderWonCount, 1)
  assert.equal(result.topManufacturers[0].name, '绍兴上虞')
  assert.ok(result.matchedProducts.length >= 2)
})

test('analyze_manufacturer_performance groups fuzzy manufacturer and supplier names', async () => {
  const db = {
    inquiryItem: {
      findMany: async () => [
        {
          id: 'inq-1',
          materialName: '冷却风机',
          modelSpec: 'GFDD520',
          manufacturer: '绍兴上虞风机厂',
          supplierName: '供应商A',
          result: 'WON',
          quotedPrice: { toString: () => '430' },
          inquiry: { inquiryCompany: '客户A', inquiryDate: new Date('2026-05-01') }
        },
        {
          id: 'inq-2',
          materialName: '变压器风机',
          modelSpec: 'GFDD520',
          manufacturer: '上虞风机',
          supplierName: '供应商B',
          result: 'LOST',
          quotedPrice: { toString: () => '460' },
          inquiry: { inquiryCompany: '客户B', inquiryDate: new Date('2026-05-02') }
        }
      ]
    },
    order: {
      findMany: async () => [
        {
          id: 'o1',
          orderNo: 'W001',
          inquiryCompany: '客户A',
          inquiryDate: new Date('2026-05-04'),
          bidResult: 'WON',
          winningAmount: { toString: () => '860' },
          items: [
            {
              materialDescription: '冷却风机',
              remark: 'GFDD520',
              manufacturer: '绍兴上虞风机厂',
              quantity: { toString: () => '2' },
              quotedPrice: { toString: () => '430' },
              winningAmount: { toString: () => '860' }
            }
          ]
        }
      ]
    }
  }

  const result = await executeAnalyzeManufacturerPerformance({ year: 2026, month: 5, manufacturerKeyword: '上虞风机' }, bossContext, db)

  assert.equal(result.inquiryCount, 2)
  assert.equal(result.inquiryWonCount, 1)
  assert.equal(result.orderWonCount, 1)
  assert.equal(result.topProducts[0].name, '冷却风机')
})

test('get_monthly_business_insights returns hot products and manufacturers for a month', async () => {
  const db = {
    inquiryItem: {
      findMany: async () => [
        {
          id: 'inq-1',
          materialName: '冷却风机 GFDD520',
          modelSpec: '120/A3',
          manufacturer: '绍兴上虞',
          supplierName: '供应商A',
          result: 'WON',
          quotedPrice: { toString: () => '430' },
          inquiry: { inquiryCompany: '客户A', inquiryDate: new Date('2026-05-01') }
        },
        {
          id: 'inq-2',
          materialName: '冷却风机 GFDD520',
          modelSpec: '120/B3',
          manufacturer: '绍兴上虞',
          supplierName: '供应商B',
          result: 'LOST',
          quotedPrice: { toString: () => '460' },
          inquiry: { inquiryCompany: '客户B', inquiryDate: new Date('2026-05-02') }
        },
        {
          id: 'inq-3',
          materialName: '电磁阀',
          modelSpec: 'SMC',
          manufacturer: 'SMC',
          supplierName: '供应商C',
          result: 'WON',
          quotedPrice: { toString: () => '80' },
          inquiry: { inquiryCompany: '客户C', inquiryDate: new Date('2026-05-03') }
        }
      ]
    },
    order: {
      findMany: async () => []
    }
  }

  const result = await executeGetMonthlyBusinessInsights({ year: 2026, month: 5 }, bossContext, db)

  assert.equal(result.totalInquiryCount, 3)
  assert.equal(result.totalInquiryWonCount, 2)
  assert.equal(result.hotProducts[0].name, '冷却风机 GFDD520')
  assert.equal(result.hotManufacturers[0].name, '绍兴上虞')
})

test('get_unpaid_orders finds supplier and customer unpaid records within scope', async () => {
  const db = {
    purchaseInfo: {
      findMany: async () => [{ id: 'p1', order: { orderNo: 'A001' }, purchaseCost: { toString: () => '100' } }]
    },
    order: {
      findMany: async () => [{ id: 'o1', orderNo: 'A002', inquiryCompany: '客户A', customerPayments: [] }]
    }
  }

  const result = await executeGetUnpaidOrders({}, employeeContext, db)

  assert.equal(result.supplierUnpaid.length, 1)
  assert.equal(result.customerUnpaid.length, 1)
})

test('get_unpaid_orders filters customers by effective cumulative amounts with order-level precedence', async () => {
  let customerQuery: any
  const baseOrder = {
    inquiryCompany: '客户A',
    currentStatus: 'CUSTOMER_PAID',
    updatedAt: new Date('2026-08-01T00:00:00.000Z')
  }
  const db = {
    purchaseInfo: {
      findMany: async () => []
    },
    order: {
      findMany: async (query: any) => {
        customerQuery = query
        return [
          {
            ...baseOrder,
            id: 'paid-order',
            orderNo: 'A001',
            winningAmount: new Prisma.Decimal(1000),
            customerPayments: [
              { id: 'order-payment', orderItemId: null, paidAmount: new Prisma.Decimal(1000), updatedAt: new Date('2026-08-03') },
              { id: 'stale-item', orderItemId: 'item-1', paidAmount: new Prisma.Decimal(0), updatedAt: new Date('2026-08-01') }
            ]
          },
          {
            ...baseOrder,
            id: 'partial-order',
            orderNo: 'A002',
            winningAmount: new Prisma.Decimal(1000),
            customerPayments: [
              { id: 'order-payment-2', orderItemId: null, paidAmount: new Prisma.Decimal(250), updatedAt: new Date('2026-08-03') }
            ]
          },
          {
            ...baseOrder,
            id: 'paid-legacy',
            orderNo: 'A003',
            winningAmount: new Prisma.Decimal(1000),
            customerPayments: [
              { id: 'legacy-1', orderItemId: 'item-2', paidAmount: new Prisma.Decimal(700), updatedAt: new Date('2026-08-01') },
              { id: 'legacy-2', orderItemId: 'item-3', paidAmount: new Prisma.Decimal(500), updatedAt: new Date('2026-08-01') }
            ]
          }
        ]
      }
    }
  }

  const result = await executeGetUnpaidOrders({ limit: 10 }, employeeContext, db)

  assert.deepEqual(
    result.customerUnpaid.map((order: any) => order.id),
    ['partial-order']
  )
  assert.equal(customerQuery.take, undefined)
})

test('get_delayed_orders uses configurable thresholds', async () => {
  const oldDate = new Date('2026-01-01')
  const db = {
    order: {
      findMany: async () => [
        {
          id: 'o1',
          orderNo: 'A001',
          inquiryCompany: '客户A',
          currentStatus: 'PURCHASING',
          updatedAt: oldDate,
          createdAt: oldDate,
          items: []
        }
      ]
    }
  }

  const result = await executeGetDelayedOrders({ statusDays: 7 }, bossContext, db, new Date('2026-02-01'))

  assert.equal(result.items.length, 1)
  assert.match(result.items[0].reason, /remained/)
})

test('get_employee_performance prevents employees from querying others', async () => {
  const db = {}

  await assert.rejects(
    () => executeGetEmployeePerformance({ userId: 'other-user' }, employeeContext, db),
    /permission/
  )
})
