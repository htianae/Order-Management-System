export function createLatestRequestGuard() {
  let latestRequestId = 0

  return {
    begin() {
      latestRequestId += 1
      return latestRequestId
    },
    isLatest(requestId: number) {
      return requestId === latestRequestId
    }
  }
}
