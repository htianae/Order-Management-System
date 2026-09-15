export function tokenizeSearchText(value?: string) {
  if (!value?.trim()) {
    return []
  }

  return Array.from(new Set(value
    .trim()
    .split(/[\\/\s|,，;；]+/)
    .map((token) => token.trim())
    .filter(Boolean)))
}
