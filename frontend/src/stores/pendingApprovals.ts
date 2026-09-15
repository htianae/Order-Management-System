import { defineStore } from 'pinia'

import { getPendingApprovalsApi } from '@/api/reports'
import type { PendingApprovalItem, PendingApprovalsQuery } from '@/types/report'

export const usePendingApprovalsStore = defineStore('pendingApprovals', {
  state: () => ({
    count: 0,
    resultCount: 0,
    items: [] as PendingApprovalItem[],
    loading: false,
    loaded: false
  }),
  actions: {
    async refresh(params?: PendingApprovalsQuery) {
      this.loading = true

      try {
        const { data } = await getPendingApprovalsApi(params)
        this.count = data.totalCount
        this.resultCount = data.count
        this.items = data.items
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.count = 0
      this.resultCount = 0
      this.items = []
      this.loaded = false
    }
  }
})
