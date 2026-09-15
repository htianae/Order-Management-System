<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Order List</h1>
        <p>Browse all orders with search, pagination, and sorting.</p>
      </div>
      <el-button type="primary" @click="router.push({ name: 'orders-new' })">New Order</el-button>
    </div>

    <div class="list-toolbar">
      <el-input
        v-model.trim="searchText"
        class="search-input"
        clearable
        placeholder="Search order number, company, material, model, or creator"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select
        v-model="query.status"
        class="status-select"
        clearable
        placeholder="All Statuses"
        @change="handleStatusChange"
      >
        <el-option
          v-for="(label, value) in ORDER_STATUS_TEXT"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
      <el-button type="primary" @click="handleSearch">Search</el-button>
      <el-button @click="handleReset">Reset</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="orders"
      class="data-table"
      border
      @sort-change="handleSortChange"
    >
      <el-table-column label="Order Number" prop="orderNo" min-width="170" sortable="custom">
        <template #default="{ row }">
          <el-button type="primary" link @click="goDetail(row.id)">{{ row.orderNo }}</el-button>
        </template>
      </el-table-column>

      <el-table-column label="Customer" prop="inquiryCompany" min-width="180" sortable="custom" />

      <el-table-column label="Delivery Alerts" prop="deliveryReminder" width="120" align="center" sortable="custom">
        <template #default="{ row }">
          <span v-if="isDeliveryDueSoon(row)" class="delivery-warning-icon" title="Delivery is due in less than one month">❗</span>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column label="Delivery Date" prop="deliveryTime" min-width="150" sortable="custom">
        <template #default="{ row }">{{ getOrderDeliveryTimes(row) }}</template>
      </el-table-column>

      <el-table-column label="Status" prop="currentStatus" width="140">
        <template #default="{ row }">
          <el-tag>{{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Created By" prop="creatorName" width="140" sortable="custom">
        <template #default="{ row }">{{ row.creator.realName || row.creator.username }}</template>
      </el-table-column>

      <el-table-column label="Created At" prop="createdAt" width="190" sortable="custom">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>

      <el-table-column v-if="canDeleteOrders" label="Actions" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-button type="danger" link @click="handleDeleteOrder(row)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handlePageSizeChange"
        @current-change="loadOrders"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Sort } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { deleteOrderApi, getOrdersApi } from '@/api/orders'
import { ORDER_STATUS_TEXT } from '@/config/order'
import { useAuthStore } from '@/stores/auth'
import type { OrderListItem, OrderListPageQuery, OrderListPageSortBy } from '@/types/order'
import { createLatestRequestGuard } from '@/utils/latestRequest'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const orders = ref<OrderListItem[]>([])
const total = ref(0)
const searchText = ref('')
const canDeleteOrders = computed(() => authStore.isAuthenticated)
const requestGuard = createLatestRequestGuard()

const query = reactive<OrderListPageQuery>({
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc'
})

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function parseDeliveryDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const normalized = value.trim().replace(/\//g, '-')
  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)

  if (!match) {
    return null
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function isDeliveryDueSoon(order: OrderListItem) {
  const dates = (order.historyItems || [])
    .map((item) => parseDeliveryDate(item.deliveryTime))
    .filter((date): date is Date => Boolean(date))

  if (!dates.length) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneMonthLater = new Date(today)
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1)

  return dates.some((date) => date >= today && date <= oneMonthLater)
}

function getOrderDeliveryTimes(order: OrderListItem) {
  const filled = Array.from(new Set((order.historyItems || [])
    .map((item) => item.deliveryTime || '')
    .filter(Boolean)))

  if (!filled.length) {
    return '-'
  }

  if (filled.length <= 2) {
    return filled.join(', ')
  }

  return `${filled.slice(0, 2).join(', ')} and more (${filled.length} items total)`
}

async function loadOrders() {
  const requestId = requestGuard.begin()
  loading.value = true

  try {
    const { data } = await getOrdersApi(query)
    if (!requestGuard.isLatest(requestId)) {
      return
    }

    orders.value = data.items
    total.value = data.pagination.total
  } catch {
    if (requestGuard.isLatest(requestId)) {
      ElMessage.error('Order List could not be loaded')
    }
  } finally {
    if (requestGuard.isLatest(requestId)) {
      loading.value = false
    }
  }
}

function handleSearch() {
  query.page = 1
  query.search = searchText.value
  loadOrders()
}

function handleReset() {
  searchText.value = ''
  query.search = ''
  query.status = undefined
  query.page = 1
  query.pageSize = 10
  query.sortBy = 'createdAt'
  query.sortOrder = 'desc'
  loadOrders()
}

function handleStatusChange(value: string | undefined) {
  query.status = value || undefined
  query.page = 1
  loadOrders()
}

function handlePageSizeChange() {
  query.page = 1
  loadOrders()
}

function handleSortChange(sort: Sort) {
  query.page = 1

  if (!sort.order) {
    query.sortBy = 'createdAt'
    query.sortOrder = 'desc'
    loadOrders()
    return
  }

  query.sortBy = sort.prop as OrderListPageSortBy
  query.sortOrder = sort.order === 'ascending' ? 'asc' : 'desc'
  loadOrders()
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

async function handleDeleteOrder(order: OrderListItem) {
  try {
    await ElMessageBox.confirm(`Delete order ${order.orderNo} ? This cannot be undone.`, 'Delete Order', {
      type: 'warning',
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    })
  } catch {
    return
  }

  try {
    const { data } = await deleteOrderApi(order.id)
    ElMessage.success(data.message)
    loadOrders()
  } catch (error) {
    const axiosError = error as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosError.response?.data?.message || 'Order could not be deleted')
  }
}

onMounted(loadOrders)
</script>
