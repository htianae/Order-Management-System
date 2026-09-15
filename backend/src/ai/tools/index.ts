import { createCalculateRecommendedQuoteTool } from './calculateRecommendedQuote.tool.js'
import { createCustomerDealRankingTool } from './customerDealRanking.tool.js'
import { createCustomerHistoryTool } from './customerHistory.tool.js'
import { createDelayedOrdersTool } from './delayedOrders.tool.js'
import { createEmployeePerformanceTool } from './employeePerformance.tool.js'
import { createHistoricalQuoteRecommendationTool } from './historicalQuoteRecommendation.tool.js'
import { createManufacturerPerformanceTool } from './manufacturerPerformance.tool.js'
import { createMonthlyBusinessInsightsTool } from './monthlyBusinessInsights.tool.js'
import { createOrderDetailTool } from './orderDetail.tool.js'
import { createOrderSummaryTool } from './orderSummary.tool.js'
import { createProductPerformanceTool } from './productPerformance.tool.js'
import { createSimilarWonOrdersTool } from './similarWonOrders.tool.js'
import { ToolRegistry } from './tool-registry.js'
import { createUnpaidOrdersTool } from './unpaidOrders.tool.js'

export function createDefaultToolRegistry() {
  return new ToolRegistry([
    createOrderDetailTool(),
    createSimilarWonOrdersTool(),
    createCustomerHistoryTool(),
    createCustomerDealRankingTool(),
    createCalculateRecommendedQuoteTool(),
    createHistoricalQuoteRecommendationTool(),
    createProductPerformanceTool(),
    createManufacturerPerformanceTool(),
    createMonthlyBusinessInsightsTool(),
    createUnpaidOrdersTool(),
    createDelayedOrdersTool(),
    createEmployeePerformanceTool(),
    createOrderSummaryTool()
  ])
}
