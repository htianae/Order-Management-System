interface DeliverySortableOrder {
  createdAt: Date
  items: Array<{ deliveryTime: string | null }>
}

function parseDeliveryDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const match = value.trim().match(/^(\d{4})([-/])(\d{2})\2(\d{2})$/)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[3])
  const day = Number(match[4])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}

function getEarliestDeliveryTime(order: DeliverySortableOrder) {
  const timestamps = order.items
    .map((item) => parseDeliveryDate(item.deliveryTime))
    .filter((timestamp): timestamp is number => timestamp !== null)

  return timestamps.length ? Math.min(...timestamps) : null
}

export function sortAndPaginateOrdersByDeliveryTime<T extends DeliverySortableOrder>(
  orders: T[],
  sortOrder: 'asc' | 'desc',
  skip: number,
  take: number
) {
  return [...orders]
    .sort((left, right) => {
      const leftTime = getEarliestDeliveryTime(left)
      const rightTime = getEarliestDeliveryTime(right)

      if (leftTime === null || rightTime === null) {
        if (leftTime === null && rightTime !== null) {
          return 1
        }

        if (leftTime !== null && rightTime === null) {
          return -1
        }
      } else if (leftTime !== rightTime) {
        return sortOrder === 'asc' ? leftTime - rightTime : rightTime - leftTime
      }

      return right.createdAt.getTime() - left.createdAt.getTime()
    })
    .slice(skip, skip + take)
}
