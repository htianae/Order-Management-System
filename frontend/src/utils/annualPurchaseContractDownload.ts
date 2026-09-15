export function getShanghaiCalendarYear(value = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'Asia/Shanghai'
  }).format(value))
}

export function getAnnualPurchaseContractFilename(
  contentDisposition: string | undefined,
  fallback: string
) {
  const encodedFilename = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]

  if (!encodedFilename) {
    return fallback
  }

  try {
    return decodeURIComponent(encodedFilename.replace(/^"|"$/g, ''))
  } catch {
    return fallback
  }
}
