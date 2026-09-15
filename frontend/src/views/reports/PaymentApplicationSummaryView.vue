<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Payment Request Summary</h1>
        <p>Track payment requests by purchase group and find orders with unsubmitted or pending requests.</p>
      </div>
      <div class="header-actions">
        <el-button :disabled="!selectedSummaryItems.length" @click="exportSelectedOrdersExcel">Export Selected Orders Excel</el-button>
        <el-button :disabled="!summary.items.length" @click="exportOrdersExcel()">Export All Orders Excel</el-button>
        <el-button :disabled="!summary.summary.notSubmitted" @click="exportOrdersExcel('NOT_SUBMITTED')">Export Not Requested Excel</el-button>
        <el-button :disabled="!summary.summary.pending" @click="exportOrdersExcel('PENDING')">Export Under Review Excel</el-button>
        <el-button :loading="loading" @click="loadSummary">Refresh</el-button>
      </div>
    </div>

    <el-skeleton v-if="loading && !loaded" :rows="8" animated />

    <template v-else>
      <section class="summary-grid">
        <div class="summary-card">
          <span>Purchase Group</span>
          <strong>{{ summary.summary.total }}</strong>
        </div>
        <div class="summary-card">
          <span>Not Requested</span>
          <strong>{{ summary.summary.notSubmitted }}</strong>
        </div>
        <div class="summary-card">
          <span>Under Review</span>
          <strong>{{ summary.summary.pending }}</strong>
        </div>
        <div class="summary-card">
          <span>Requested</span>
          <strong>{{ summary.summary.submitted }}</strong>
        </div>
      </section>

      <section class="filter-panel">
        <el-radio-group v-model="statusFilter">
          <el-radio-button label="">All</el-radio-button>
          <el-radio-button label="NOT_SUBMITTED">Not Requested</el-radio-button>
          <el-radio-button label="PENDING">Under Review</el-radio-button>
          <el-radio-button label="APPROVED_PARTIAL">Approved below 100%</el-radio-button>
          <el-radio-button label="APPROVED_FULL">Fully paid (100%)</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="orderNoFilter"
          class="order-no-filter"
          clearable
          placeholder="Search by order number"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </section>

      <el-table :data="filteredItems" class="data-table" border @selection-change="handleSummarySelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column type="expand" width="48">
          <template #default="{ row }">
            <el-table :data="row.itemDescriptions" class="data-table nested-table" border>
              <el-table-column label="No." prop="lineNo" width="80" align="center" />
              <el-table-column label="Material Code" prop="materialCode" min-width="140" />
              <el-table-column label="Material Description" prop="materialDescription" min-width="260" />
              <el-table-column label="Current Stage" width="150">
                <template #default="{ row: item }">{{ ORDER_STATUS_TEXT[item.currentStatus] || item.currentStatus }}</template>
              </el-table-column>
            </el-table>
          </template>
        </el-table-column>
        <el-table-column label="Order Number" min-width="160">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.orderId)">{{ row.orderNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Customer" prop="inquiryCompany" min-width="160" />
        <el-table-column label="Created By" prop="creatorName" width="120" />
        <el-table-column label="Purchase Manufacturer" min-width="150">
          <template #default="{ row }">{{ row.supplierName || '-' }}</template>
        </el-table-column>
        <el-table-column label="Purchase Cost" width="130">
          <template #default="{ row }">{{ formatMoney(row.purchaseCost) }}</template>
        </el-table-column>
        <el-table-column label="Material" width="90">
          <template #default="{ row }">{{ row.itemCount }}  items</template>
        </el-table-column>
        <el-table-column label="Request Status" width="150">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Approved Percentage" width="120">
          <template #default="{ row }">{{ formatPercent(row.approvedPercent) }}</template>
        </el-table-column>
        <el-table-column label="Percentage Under Review" width="120">
          <template #default="{ row }">{{ formatPercent(row.pendingPercent) }}</template>
        </el-table-column>
        <el-table-column label="Remaining Requestable Amount" width="120">
          <template #default="{ row }">{{ formatPercent(row.remainingPercent) }}</template>
        </el-table-column>
        <el-table-column label="Latest Request" width="170">
          <template #default="{ row }">{{ row.latestApplicationAt ? formatDateTime(row.latestApplicationAt) : '-' }}</template>
        </el-table-column>
      </el-table>
    </template>
  </section>
</template>

<script setup lang="ts">
import * as XLSX from 'xlsx'
import { Search } from '@element-plus/icons-vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { getPaymentApplicationSummaryApi } from '@/api/reports'
import { ORDER_STATUS_TEXT } from '@/config/order'
import type { PaymentApplicationSummaryItem, PaymentApplicationSummaryResponse, PaymentApplicationSummaryStatus } from '@/types/report'
import { filterPaymentSummaryItems } from '@/utils/paymentSummaryFilter'

const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const statusFilter = ref<PaymentApplicationSummaryStatus | ''>('')
const orderNoFilter = ref('')
const selectedSummaryItems = ref<PaymentApplicationSummaryItem[]>([])
const summary = reactive<PaymentApplicationSummaryResponse>({
  summary: {
    total: 0,
    notSubmitted: 0,
    pending: 0,
    approvedPartial: 0,
    approvedFull: 0,
    submitted: 0
  },
  items: []
})

const PAYMENT_SUMMARY_STATUS_TEXT: Record<PaymentApplicationSummaryStatus, string> = {
  NOT_SUBMITTED: 'Not Requested',
  PENDING: 'Under Review',
  APPROVED_PARTIAL: 'Approved below 100%',
  APPROVED_FULL: 'Fully paid (100%)'
}

const statusTagType: Record<PaymentApplicationSummaryStatus, 'info' | 'warning' | 'success'> = {
  NOT_SUBMITTED: 'info',
  PENDING: 'warning',
  APPROVED_PARTIAL: 'info',
  APPROVED_FULL: 'success'
}

const statusSortWeight: Record<PaymentApplicationSummaryStatus, number> = {
  PENDING: 0,
  NOT_SUBMITTED: 1,
  APPROVED_PARTIAL: 2,
  APPROVED_FULL: 3
}

const filteredItems = computed(() => {
  return sortByOrderNo(filterPaymentSummaryItems(summary.items, orderNoFilter.value, statusFilter.value))
})

function sortByOrderNo(items: PaymentApplicationSummaryItem[]) {
  return [...items].sort((left, right) => {
    const orderCompare = left.orderNo.localeCompare(right.orderNo, 'en-US', {
      numeric: true,
      sensitivity: 'base'
    })

    if (orderCompare !== 0) {
      return orderCompare
    }

    const statusCompare = statusSortWeight[left.status] - statusSortWeight[right.status]

    if (statusCompare !== 0) {
      return statusCompare
    }

    return new Date(right.latestApplicationAt || 0).getTime() - new Date(left.latestApplicationAt || 0).getTime()
  })
}

function getStatusText(status: PaymentApplicationSummaryStatus) {
  return PAYMENT_SUMMARY_STATUS_TEXT[status]
}

function getStatusTagType(status: PaymentApplicationSummaryStatus) {
  return statusTagType[status]
}

function formatMoney(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
}

function formatPercent(value: string | number | null | undefined) {
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, '')}%`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function getApplicationPercent(item: PaymentApplicationSummaryItem) {
  return Number(item.latestPaymentPercent || 0)
}

function getPaymentDescription(percent: number) {
  if (!percent) {
    return '-'
  }

  const percentText = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

  if (percent >= 100) {
    return 'Full payment 100%'
  }

  if (percent > 50) {
    return `Balance Payment ${percentText}%`
  }

  return `Advance Payment${percentText}%Balance Payment ${(100 - percent).toFixed(2).replace(/\.00$/, '')}%`
}

function getApplicationPaymentAmount(item: PaymentApplicationSummaryItem) {
  return Number(item.purchaseCost || 0) * getApplicationPercent(item) / 100
}

function getOrderDeliveryTimes(item: PaymentApplicationSummaryItem) {
  const filled = Array.from(new Set(item.itemDescriptions
    .map((detail) => detail.deliveryTime || '')
    .filter(Boolean)))

  return filled.length ? filled.join(', ') : '-'
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportRowsExcel(rows: PaymentApplicationSummaryItem[], statusLabel: string) {
  if (!rows.length) {
    ElMessage.warning(`Nothing to export: ${statusLabel} Payment Request Summary`)
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((item) => ({
      'Order Number': item.orderNo,
      Customer: item.inquiryCompany,
      'Order Delivery Date': getOrderDeliveryTimes(item),
      'Created By': item.creatorName,
      'Purchase Manufacturer': item.supplierName || '-',
      'Purchase Cost': Number(item.purchaseCost || 0),
      'Delivery Date': item.deliveryTime || '-',
      Material: `${item.itemCount}  items`,
      'Requested Percentage': formatPercent(item.latestPaymentPercent),
      'Payment Notes': getPaymentDescription(getApplicationPercent(item)),
      'Actual Payment Date': formatDate(item.latestApplicationAt),
      'Payment Amount': getApplicationPaymentAmount(item)
    }))
  )

  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 32 },
    { wch: 20 },
    { wch: 14 },
    { wch: 32 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, `Payment Request-${statusLabel}`)
  downloadWorkbook(workbook, `Payment Request Summary-${statusLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function exportOrdersExcel(status?: PaymentApplicationSummaryStatus) {
  const effectiveStatus = status ?? statusFilter.value
  const rows = sortByOrderNo(filterPaymentSummaryItems(summary.items, orderNoFilter.value, effectiveStatus))
  const statusLabel = status
    ? getStatusText(status)
    : statusFilter.value
      ? getStatusText(statusFilter.value)
      : 'All Orders'

  exportRowsExcel(rows, statusLabel)
}

function exportSelectedOrdersExcel() {
  exportRowsExcel(sortByOrderNo(selectedSummaryItems.value), 'Selected Orders')
}

function handleSummarySelectionChange(selection: PaymentApplicationSummaryItem[]) {
  selectedSummaryItems.value = selection
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

async function loadSummary() {
  loading.value = true

  try {
    const { data } = await getPaymentApplicationSummaryApi()
    Object.assign(summary.summary, data.summary)
    summary.items = data.items
    loaded.value = true
  } catch {
    ElMessage.error('Payment Request Summary could not be loaded')
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)
</script>

<style scoped>
.filter-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.order-no-filter {
  width: min(320px, 100%);
}
</style>
