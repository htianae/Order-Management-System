export function decimalToString(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString()
  }

  return String(value)
}

export function decimalToNumber(value: unknown) {
  const text = decimalToString(value)

  if (!text) {
    return null
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

export function serializeForAi(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map(serializeForAi)
  }

  if (value && typeof value === 'object') {
    if (value.constructor?.name === 'Decimal') {
      return value.toString()
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializeForAi(child)])
    )
  }

  return value
}
