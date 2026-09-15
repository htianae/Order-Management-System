<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>My Orders</h1>
        <p>View your orders and performance for this year.</p>
      </div>
      <el-button type="primary" @click="router.push({ name: 'orders-new' })">New Order</el-button>
    </div>

    <section class="summary-grid">
      <div class="summary-card">
        <span>{{ summary.year }}  Annual Order Count</span>
        <strong>{{ summary.orderCount }}</strong>
      </div>
      <div class="summary-card">
        <span>{{ summary.year }}  Annual Award Amount</span>
        <strong>{{ formatMoney(summary.winningAmount) }}</strong>
      </div>
      <div class="summary-card">
        <span>{{ summary.year }}  Annual Purchase Amount</span>
        <strong>{{ formatMoney(summary.purchaseAmount) }}</strong>
      </div>
    </section>

    <h2 class="detail-title">My Orders</h2>
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
      <el-table-column label="Declaring Company" prop="declarationCompany" min-width="160">
        <template #default="{ row }">{{ row.declarationCompany || '-' }}</template>
      </el-table-column>
      <el-table-column label="Product Name" min-width="180">
        <template #default="{ row }">{{ getFirstMaterialName(row) }}</template>
      </el-table-column>
      <el-table-column label="Status" prop="currentStatus" width="150" sortable="custom">
        <template #default="{ row }">
          <el-tag>{{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Created At" prop="createdAt" width="190" sortable="custom">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
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
        @current-change="loadMyOrders"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Sort } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getMyOrdersApi } from '@/api/orders'
import { ORDER_STATUS_TEXT } from '@/config/order'
import type { MyOrdersSummary, OrderListItem, OrderListQuery, OrderSortBy } from '@/types/order'

const router = useRouter()
const loading = ref(false)
const orders = ref<OrderListItem[]>([])
const total = ref(0)
const summary = reactive<MyOrdersSummary>({
  year: new Date().getFullYear(),
  orderCount: 0,
  winningAmount: '0',
  purchaseAmount: '0'
})

const query = reactive<OrderListQuery>({
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc'
})

function formatMoney(value: string) {
  const amount = Number(value || 0)
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
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

function getFirstMaterialName(row: OrderListItem) {
  const firstItem = row.historyItems?.[0]
  return firstItem?.materialName || firstItem?.materialCode || row.productNameCn || '-'
}

async function loadMyOrders() {
  loading.value = true

  try {
    const { data } = await getMyOrdersApi(query)
    orders.value = data.items
    total.value = data.pagination.total
    summary.year = data.summary.year
    summary.orderCount = data.summary.orderCount
    summary.winningAmount = data.summary.winningAmount
    summary.purchaseAmount = data.summary.purchaseAmount
  } catch {
    ElMessage.error('My Orders could not be loaded')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  query.page = 1
  loadMyOrders()
}

function handleSortChange(sort: Sort) {
  query.page = 1

  if (!sort.order) {
    query.sortBy = 'createdAt'
    query.sortOrder = 'desc'
    loadMyOrders()
    return
  }

  query.sortBy = sort.prop as OrderSortBy
  query.sortOrder = sort.order === 'ascending' ? 'asc' : 'desc'
  loadMyOrders()
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

onMounted(loadMyOrders)
</script>
