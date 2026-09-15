import { getInquiryReadScope, getOrderReadScope } from '../security/tool-permissions.js'
import { decimalToNumber } from '../utils/serialize.js'
import { countTokenMatches, normalizeText, tokenizeForSimilarity } from '../utils/similarity.js'
import type { ToolContext } from './tool-types.js'

export interface AnalysisDateRange {
  year: number
  month: number | null
  start: Date
  end: Date
}

export interface AnalysisProductInput {
  productKeyword?: string
  modelSpec?: string
}

export interface AnalysisManufacturerInput {
  manufacturerKeyword?: string
}

export function getAnalysisDateRange(year?: number, month?: number, now = new Date()): AnalysisDateRange {
  const selectedYear = year || now.getFullYear()
  const startMonth = month ? month - 1 : 0
  const endYear = month === 12 ? selectedYear + 1 : selectedYear
  const endMonth = month ? month : 12

  return {
    year: selectedYear,
    month: month || null,
    start: new Date(Date.UTC(selectedYear, startMonth, 1)),
    end: new Date(Date.UTC(endYear, endMonth, 1))
  }
}

function textIncludesAnyToken(text: string, keyword?: string) {
  const tokens = tokenizeForSimilarity(keyword)

  if (!tokens.length) {
    return true
  }

  const normalizedText = normalizeText(text)
  return tokens.some((token) => normalizedText.includes(token))
}

export function matchesProduct(input: AnalysisProductInput, itemText: string) {
  if (!input.productKeyword && !input.modelSpec) {
    return true
  }

  const keywordMatch = input.productKeyword ? countTokenMatches(input.productKeyword, itemText) > 0 : true
  const specMatch = input.modelSpec ? countTokenMatches(input.modelSpec, itemText) > 0 : true

  return keywordMatch && specMatch
}

export function matchesManufacturer(input: AnalysisManufacturerInput, manufacturerText: string) {
  return textIncludesAnyToken(manufacturerText, input.manufacturerKeyword)
}

export function displayProductName(item: {
  materialName?: string | null
  materialDescription?: string | null
  modelSpec?: string | null
  remark?: string | null
}) {
  return item.materialName || item.materialDescription || 'Unnamed product'
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function incrementMap(map: Map<string, number>, key: string, amount = 1) {
  map.set(key || '-', (map.get(key || '-') || 0) + amount)
}

export function mapToRanking(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, limit)
}

export function averagePrice(values: Array<unknown>) {
  const prices = values
    .map(decimalToNumber)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  return prices.length ? roundMoney(prices.reduce((total, price) => total + price, 0) / prices.length) : null
}

export function buildInquiryItemWhere(context: ToolContext, range: AnalysisDateRange) {
  return {
    inquiry: {
      AND: [
        getInquiryReadScope(context.user),
        {
          inquiryDate: {
            gte: range.start,
            lt: range.end
          }
        }
      ]
    }
  }
}

export function buildOrderWhere(context: ToolContext, range: AnalysisDateRange) {
  return {
    AND: [
      getOrderReadScope(context.user),
      {
        inquiryDate: {
          gte: range.start,
          lt: range.end
        }
      }
    ]
  }
}
