import { tokenizeSearchText } from '../../utils/searchTokens.js'

export function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function tokenizeForSimilarity(value: unknown) {
  return tokenizeSearchText(String(value ?? ''))
    .map((token) => normalizeText(token))
    .filter(Boolean)
}

export function countTokenMatches(left: unknown, right: unknown) {
  const leftTokens = tokenizeForSimilarity(left)
  const rightText = normalizeText(right)

  return leftTokens.filter((token) => rightText.includes(token)).length
}

export function quantitySimilarityScore(left?: number | null, right?: number | null) {
  if (!left || !right) {
    return 0
  }

  const diffRate = Math.abs(left - right) / Math.max(left, right)

  if (diffRate <= 0.1) {
    return 5
  }

  if (diffRate <= 0.3) {
    return 3
  }

  return 0
}
