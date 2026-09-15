<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Pending Approvals</h1>
        <p>Payment and shipping requests are reviewed separately and can be searched independently.</p>
      </div>
      <el-button :loading="isRefreshing" @click="refreshAll">Refresh All</el-button>
    </div>

    <section class="approval-section">
      <div class="approval-section-heading">
        <div>
          <h2>Payment Request</h2>
          <p v-if="hasActiveFilters(paymentSection)">
            Matched {{ paymentSection.count }} records; total: {{ paymentSection.totalCount }} pending payment requests.
          </p>
          <p v-else>Currently {{ paymentSection.totalCount }}  pending payment requests.</p>
        </div>
      </div>

      <section class="filter-panel approval-filter-panel">
        <el-input
          v-model="paymentSection.filters.orderNo"
          class="approval-filter-control"
          clearable
          placeholder="Enter Order Number"
          @keyup.enter="loadSection(paymentSection)"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-date-picker
          v-model="paymentSection.filters.submittedDate"
          class="approval-filter-control"
          type="date"
          value-format="YYYY-MM-DD"
          clearable
          placeholder="Select submission date"
        />
        <el-button type="primary" :loading="paymentSection.loading" @click="loadSection(paymentSection)">
          <el-icon><Search /></el-icon>
          <span>Search Payment Request</span>
        </el-button>
        <el-button
          :disabled="!hasActiveFilters(paymentSection)"
          @click="clearSectionFilters(paymentSection)"
        >
          Clear
        </el-button>
      </section>

      <el-skeleton v-if="paymentSection.loading && !paymentSection.loaded" :rows="6" animated />
      <el-empty v-else-if="paymentSection.error && !paymentSection.loaded" description="Could not load payment requests. Please try again." />
      <el-table v-else :data="paymentSection.items" class="data-table" border>
        <el-table-column type="expand" width="48">
          <template #default="{ row }">
            <approval-item-table :items="row.items" />
          </template>
        </el-table-column>
        <el-table-column label="Submitted At" width="175">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="Order Number" min-width="170">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.orderId)">{{ row.orderNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Customer" prop="inquiryCompany" min-width="160" />
        <el-table-column label="Purchase Manufacturer" min-width="140">
          <template #default="{ row }">{{ row.supplierName || '-' }}</template>
        </el-table-column>
        <el-table-column label="Requested Payment Amount" min-width="210">
          <template #default="{ row }">{{ formatPaymentRequest(row) }}</template>
        </el-table-column>
        <el-table-column label="Purchase Cost" width="130">
          <template #default="{ row }">{{ formatMoney(row.purchaseCost) }}</template>
        </el-table-column>
        <el-table-column label="Payment Percentage" width="110">
          <template #default="{ row }">{{ formatPercent(row.paymentPercent) }}</template>
        </el-table-column>
        <el-table-column label="Advance Payment" width="130">
          <template #default="{ row }">{{ formatMoney(row.advancePaymentAmount) }}</template>
        </el-table-column>
        <el-table-column label="Balance Payment" width="130">
          <template #default="{ row }">{{ formatMoney(row.arrivalPaymentAmount) }}</template>
        </el-table-column>
        <el-table-column label="Bank" min-width="140">
          <template #default="{ row }">{{ row.bankName || '-' }}</template>
        </el-table-column>
        <el-table-column label="Account Number" min-width="140">
          <template #default="{ row }">{{ row.bankAccount || '-' }}</template>
        </el-table-column>
        <el-table-column label="Material" width="90">
          <template #default="{ row }">{{ row.itemCount }}  items</template>
        </el-table-column>
        <el-table-column label="Actions" width="230" fixed="right">
          <template #default="{ row }">
            <approval-actions :item="asPendingApproval(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="approval-section approval-section-separated">
      <div class="approval-section-heading">
        <div>
          <h2>Shipping Request</h2>
          <p v-if="hasActiveFilters(shippingSection)">
            Matched {{ shippingSection.count }}  purchase packages ({{ shippingSection.items.length }}  requests),
            Total: {{ shippingSection.totalCount }}  pending purchase packages.
          </p>
          <p v-else>
            Currently {{ shippingSection.totalCount }}  pending purchase packages ({{ shippingSection.items.length }}  requests).
          </p>
        </div>
      </div>

      <section class="filter-panel approval-filter-panel">
        <el-input
          v-model="shippingSection.filters.orderNo"
          class="approval-filter-control"
          clearable
          placeholder="Enter Order Number"
          @keyup.enter="loadSection(shippingSection)"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-date-picker
          v-model="shippingSection.filters.submittedDate"
          class="approval-filter-control"
          type="date"
          value-format="YYYY-MM-DD"
          clearable
          placeholder="Select submission date"
        />
        <el-button type="primary" :loading="shippingSection.loading" @click="loadSection(shippingSection)">
          <el-icon><Search /></el-icon>
          <span>Search Shipping Request</span>
        </el-button>
        <el-button
          :disabled="!hasActiveFilters(shippingSection)"
          @click="clearSectionFilters(shippingSection)"
        >
          Clear
        </el-button>
      </section>

      <el-skeleton v-if="shippingSection.loading && !shippingSection.loaded" :rows="6" animated />
      <el-empty v-else-if="shippingSection.error && !shippingSection.loaded" description="Could not load shipping requests. Please try again." />
      <el-table v-else :data="shippingSection.items" class="data-table" border>
        <el-table-column label="Submitted At" width="175">
          <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
        </el-table-column>
        <el-table-column label="Order Number" min-width="170">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.orderId)">{{ row.orderNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Customer" prop="inquiryCompany" min-width="160" />
        <el-table-column label="Purchase Manufacturer" min-width="160">
          <template #default="{ row }">{{ row.supplierName || '-' }}</template>
        </el-table-column>
        <el-table-column label="Carrier" min-width="150">
          <template #default="{ row }">{{ row.logisticsCompany || '-' }}</template>
        </el-table-column>
        <el-table-column label="Tracking Number" min-width="170">
          <template #default="{ row }">{{ row.trackingNo || '-' }}</template>
        </el-table-column>
        <el-table-column label="Actions" width="250" fixed="right">
          <template #default="{ row }">
            <approval-actions :item="asPendingApproval(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { AxiosError } from 'axios'
import { Search } from '@element-plus/icons-vue'
import { ElButton, ElMessage, ElTable, ElTableColumn } from 'element-plus'
import { computed, defineComponent, h, markRaw, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  approvePurchaseBatch,
  approveShippingApplication,
  approveShippingBatch,
  downloadOrderFileApi,
  exportOrderPaymentApplicationApi,
  exportShippingApplicationApi,
  rejectPurchaseBatch,
  rejectShippingApplication,
  rejectShippingBatch
} from '@/api/orders'
import { getPendingApprovalsApi } from '@/api/reports'
import { ORDER_STATUS_TEXT } from '@/config/order'
import { usePendingApprovalsStore } from '@/stores/pendingApprovals'
import type { PendingApprovalItem } from '@/types/report'
import { createLatestRequestGuard } from '@/utils/latestRequest'
import { formatPendingPaymentRequest } from '@/utils/pendingPaymentRequest'
import { resolvePendingShippingExportBatchIds } from '@/utils/pendingShippingExport'

type ApprovalType = 'PAYMENT' | 'SHIPPING'

interface ApprovalSectionState {
  type: ApprovalType
  filters: {
    orderNo: string
    submittedDate: string
  }
  items: PendingApprovalItem[]
  count: number
  totalCount: number
  loading: boolean
  loaded: boolean
  error: boolean
  requestGuard: ReturnType<typeof createLatestRequestGuard>
}

const router = useRouter()
const pendingApprovalsStore = usePendingApprovalsStore()
const exportingApprovalId = ref('')
const approvingApprovalId = ref('')
const rejectingApprovalId = ref('')

function createSection(type: ApprovalType): ApprovalSectionState {
  return reactive({
    type,
    filters: {
      orderNo: '',
      submittedDate: ''
    },
    items: [],
    count: 0,
    totalCount: 0,
    loading: false,
    loaded: false,
    error: false,
    requestGuard: markRaw(createLatestRequestGuard())
  })
}

const paymentSection = createSection('PAYMENT')
const shippingSection = createSection('SHIPPING')
const isRefreshing = computed(() => paymentSection.loading || shippingSection.loading)

const ApprovalItemTable = defineComponent({
  name: 'ApprovalItemTable',
  props: {
    items: {
      type: Array as () => PendingApprovalItem['items'],
      required: true
    }
  },
  setup(props) {
    return () => h(ElTable, { data: props.items, class: 'data-table nested-table', border: true }, {
      default: () => [
        h(ElTableColumn, { label: 'No.', prop: 'lineNo', width: 80, align: 'center' }),
        h(ElTableColumn, { label: 'Material Code', prop: 'materialCode', minWidth: 140 }),
        h(ElTableColumn, { label: 'Material Description', prop: 'materialDescription', minWidth: 260 }),
        h(ElTableColumn, { label: 'Current Stage', width: 150 }, {
          default: ({ row }: { row: PendingApprovalItem['items'][number] }) => (
            ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus
          )
        })
      ]
    })
  }
})

const ApprovalActions = defineComponent({
  name: 'ApprovalActions',
  props: {
    item: {
      type: Object as () => PendingApprovalItem,
      required: true
    }
  },
  setup(props) {
    return () => {
      const shippingExportUnavailable = props.item.type === 'SHIPPING'
        && !props.item.shippingApplicationFile
        && !resolvePendingShippingExportBatchIds(props.item)

      return [
        h(ElButton, { type: 'primary', link: true, onClick: () => goDetail(props.item.orderId) }, () => 'View'),
        h(ElButton, {
          type: 'primary',
          link: true,
          disabled: shippingExportUnavailable,
          title: shippingExportUnavailable ? 'Cannot export: purchase package details are missing' : undefined,
          loading: exportingApprovalId.value === props.item.id,
          onClick: () => handleExportApproval(props.item)
        }, () => shippingExportUnavailable ? 'Cannot export' : 'Export Excel'),
        h(ElButton, {
          type: 'success',
          link: true,
          loading: approvingApprovalId.value === props.item.id,
          onClick: () => handleApproveApproval(props.item)
        }, () => props.item.type === 'SHIPPING' && props.item.groupedShipping ? 'All Approved' : 'Approved'),
        h(ElButton, {
          type: 'danger',
          link: true,
          loading: rejectingApprovalId.value === props.item.id,
          onClick: () => handleRejectApproval(props.item)
        }, () => 'Reject')
      ]
    }
  }
})

function hasActiveFilters(section: ApprovalSectionState) {
  return Boolean(section.filters.orderNo.trim() || section.filters.submittedDate)
}

function asPendingApproval(value: unknown) {
  return value as PendingApprovalItem
}

function formatPaymentRequest(value: unknown) {
  return formatPendingPaymentRequest(asPendingApproval(value))
}

function formatMoney(value: string) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
}

function formatPercent(value: string | null) {
  if (!value) {
    return '-'
  }

  return ['Multiple', '多种'].includes(value) ? 'Multiple' : `${value}%`
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

async function loadSection(section: ApprovalSectionState) {
  const requestId = section.requestGuard.begin()
  section.loading = true
  section.error = false

  try {
    const { data } = await getPendingApprovalsApi({
      type: section.type,
      orderNo: section.filters.orderNo.trim() || undefined,
      submittedDate: section.filters.submittedDate || undefined
    })

    if (!section.requestGuard.isLatest(requestId)) {
      return
    }

    section.items = data.items
    section.count = data.count
    section.totalCount = data.totalCount
    section.loaded = true
  } catch {
    if (!section.requestGuard.isLatest(requestId)) {
      return
    }

    section.error = true
    ElMessage.error(section.type === 'PAYMENT' ? 'Payment Request could not be loaded' : 'Shipping Request could not be loaded')
  } finally {
    if (section.requestGuard.isLatest(requestId)) {
      section.loading = false
    }
  }
}

async function refreshAll() {
  await Promise.all([loadSection(paymentSection), loadSection(shippingSection)])
}

async function clearSectionFilters(section: ApprovalSectionState) {
  section.filters.orderNo = ''
  section.filters.submittedDate = ''
  await loadSection(section)
}

async function syncAfterApproval() {
  await refreshAll()

  try {
    await pendingApprovalsStore.refresh()
  } catch {
    ElMessage.warning('The request was processed, but the pending count could not refresh. Select Refresh All later.')
  }
}

async function handleExportApproval(item: PendingApprovalItem) {
  const shippingBatchIds = item.type === 'SHIPPING' && !item.shippingApplicationFile
    ? resolvePendingShippingExportBatchIds(item)
    : null

  if (item.type === 'SHIPPING' && !item.shippingApplicationFile && !shippingBatchIds) {
    ElMessage.warning('Cannot export: this shipping record has no purchase package details')
    return
  }

  exportingApprovalId.value = item.id

  try {
    const { data } = item.type === 'PAYMENT'
      ? await exportOrderPaymentApplicationApi(item.orderId)
      : item.shippingApplicationFile
        ? await downloadOrderFileApi(item.shippingApplicationFile.id)
        : await exportShippingApplicationApi(item.orderId, shippingBatchIds!)
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = item.type === 'SHIPPING' && item.shippingApplicationFile
      ? item.shippingApplicationFile.originalName
      : `${item.orderNo.replace(/[\\/:*?"<>|]/g, '_')}-${item.type === 'PAYMENT' ? 'Order Payment Request' : 'Shipping Approval'}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error(item.type === 'PAYMENT' ? 'Payment Request could not be exported' : 'Shipping Approval could not be exported')
  } finally {
    exportingApprovalId.value = ''
  }
}

async function handleApproveApproval(item: PendingApprovalItem) {
  approvingApprovalId.value = item.id

  try {
    const { data } = item.type === 'PAYMENT'
      ? await approvePurchaseBatch(item.orderId, item.id)
      : item.groupedShipping
        ? await approveShippingApplication(item.orderId, item.id)
        : await approveShippingBatch(item.orderId, item.id)
    ElMessage.success(data.message || 'Request approved')
    await syncAfterApproval()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || (item.type === 'PAYMENT' ? 'Payment Request could not be approved' : 'Shipping Request could not be approved'))
  } finally {
    approvingApprovalId.value = ''
  }
}

async function handleRejectApproval(item: PendingApprovalItem) {
  rejectingApprovalId.value = item.id

  try {
    const { data } = item.type === 'PAYMENT'
      ? await rejectPurchaseBatch(item.orderId, item.id)
      : item.groupedShipping
        ? await rejectShippingApplication(item.orderId, item.id)
        : await rejectShippingBatch(item.orderId, item.id)
    ElMessage.success(data.message || 'Request rejected')
    await syncAfterApproval()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || (item.type === 'PAYMENT' ? 'Payment Request could not be rejected' : 'Shipping Request could not be rejected'))
  } finally {
    rejectingApprovalId.value = ''
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.approval-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.approval-section-heading h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.approval-section-heading p {
  margin: 0;
  color: #64748b;
}

.approval-section-separated {
  margin-top: 32px;
  padding-top: 28px;
  border-top: 1px solid #dfe4ec;
}

.approval-filter-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.approval-filter-control {
  width: 240px;
}

@media (max-width: 768px) {
  .approval-filter-control {
    width: 100%;
  }

  .approval-filter-panel :deep(.el-button) {
    margin-left: 0;
  }
}
</style>
