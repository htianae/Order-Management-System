export function filterPaymentSummaryItems<T extends { orderNo: string; status: string }>(
  items: T[],
  orderNo: string,
  status = ''
) {
  const keyword = orderNo.trim().toLocaleLowerCase()

  return items.filter((item) => {
    const matchesOrderNo = !keyword || item.orderNo.toLocaleLowerCase().includes(keyword)
    const matchesStatus = !status || item.status === status

    return matchesOrderNo && matchesStatus
  })
}
