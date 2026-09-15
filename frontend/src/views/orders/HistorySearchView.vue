<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Order History Search</h1>
        <p>Search historical records converted into confirmed orders.</p>
      </div>
    </div>

    <section class="form-section">
      <div class="table-toolbar">
        <div>
          <h2>Confirmed Orders</h2>
          <p>Won inquiries that have been converted into confirmed orders.</p>
        </div>
        <el-button type="success" plain :loading="exportingHistoryOrders" @click="handleExportHistoryOrders">
          Export Filtered Results to Excel
        </el-button>
      </div>

      <el-form class="advanced-search-form" :model="orderFilters" label-position="top" @submit.prevent>
        <el-form-item label="Material Name / Keyword">
          <el-input v-model.trim="orderFilters.search" clearable placeholder="Enter material name, code, model, manufacturer, supplier, or company" @keyup.enter="handleOrderSearch" />
        </el-form-item>

        <el-form-item label="Order Number">
          <el-input v-model.trim="orderFilters.orderNo" clearable placeholder="Enter Order Number" />
        </el-form-item>

        <el-form-item label="Company Name">
          <el-input v-model.trim="orderFilters.companyName" clearable placeholder="Enter Customer" />
        </el-form-item>

        <el-form-item label="Product Name">
          <el-input v-model.trim="orderFilters.productName" clearable placeholder="Enter product or material name" @keyup.enter="handleOrderSearch" />
        </el-form-item>

        <el-form-item label="Product Code">
          <el-input v-model.trim="orderFilters.productCode" clearable placeholder="Enter product or material code" @keyup.enter="handleOrderSearch" />
        </el-form-item>

        <el-form-item label="Model / Specification">
          <el-input v-model.trim="orderFilters.modelSpec" clearable placeholder="Enter model or specification" @keyup.enter="handleOrderSearch" />
        </el-form-item>

        <el-form-item label="Created By">
          <el-input v-model.trim="orderFilters.creator" clearable placeholder="Enter creator name or username" @keyup.enter="handleOrderSearch" />
        </el-form-item>

        <el-form-item label="Manufacturer / Supplier">
          <el-input v-model.trim="orderFilters.supplier" clearable placeholder="Enter manufacturer, brand, or supplier" />
        </el-form-item>

        <el-form-item label="Bid Status">
          <el-select v-model="orderFilters.bidResult" class="full-width" clearable placeholder="All">
            <el-option label="Undetermined" value="PENDING" />
            <el-option label="Won" value="WON" />
            <el-option label="Lost" value="LOST" />
          </el-select>
        </el-form-item>

        <el-form-item label="Delivery Month">
          <el-date-picker
            v-model="orderFilters.deliveryMonth"
            class="full-width"
            type="month"
            value-format="YYYY-MM"
            placeholder="Select confirmed order delivery month"
          />
        </el-form-item>

        <el-form-item label="Delivery Date">
          <el-input v-model.trim="orderFilters.deliveryTime" clearable placeholder="Enter delivery date, e.g. 2026-06 or 2026-06-30" />
        </el-form-item>

        <el-form-item label="Order Stage">
          <el-select v-model="orderFilters.status" class="full-width" clearable placeholder="Select confirmed order stage">
            <el-option
              v-for="option in ORDER_STATUS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Year">
          <el-input-number v-model="orderFilters.year" class="full-width" :min="1900" :max="3000" :step="1" />
        </el-form-item>

        <el-form-item label="Minimum Amount">
          <el-input-number v-model="orderFilters.amountMin" class="full-width" :min="0" :precision="2" />
        </el-form-item>

        <el-form-item label="Maximum Amount">
          <el-input-number v-model="orderFilters.amountMax" class="full-width" :min="0" :precision="2" />
        </el-form-item>

        <div class="search-actions">
          <el-button type="primary" @click="handleOrderSearch">Search Confirmed Orders</el-button>
          <el-button @click="handleOrderReset">Clear</el-button>
        </div>
      </el-form>

      <el-table
        v-loading="ordersLoading"
        :data="orders"
        class="data-table"
        border
        @sort-change="handleSortChange"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <el-table :data="row.historyItems || []" class="nested-table" border>
              <el-table-column label="Material Name" min-width="220">
                <template #default="{ row: item }">{{ item.materialName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Material Code" min-width="130">
                <template #default="{ row: item }">{{ item.materialCode || '-' }}</template>
              </el-table-column>
              <el-table-column label="Manufacturer / Brand" min-width="140">
                <template #default="{ row: item }">{{ item.manufacturer || '-' }}</template>
              </el-table-column>
              <el-table-column label="Unit Price (Tax Included)" width="120">
                <template #default="{ row: item }">{{ item.quotedPrice || '-' }}</template>
              </el-table-column>
              <el-table-column label="Total (Tax Included)" width="120">
                <template #default="{ row: item }">{{ item.totalAmount || '-' }}</template>
              </el-table-column>
              <el-table-column label="Total (Tax Included)" width="120">
                <template #default="{ row: item }">{{ item.winningPrice || '-' }}</template>
              </el-table-column>
              <el-table-column label="Delivery Date" width="140">
                <template #default="{ row: item }">{{ item.deliveryTime || '-' }}</template>
              </el-table-column>
              <el-table-column label="Bid Status" width="110">
                <template #default="{ row: item }">
                  <el-tag :type="getBidResultTagType(item.result)">{{ getBidResultText(item.result) }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-table-column>
        <el-table-column label="Order Number" prop="orderNo" min-width="170" sortable="custom">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.id)">{{ row.orderNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="Customer" prop="inquiryCompany" min-width="180" sortable="custom" />
        <el-table-column label="Material Name" min-width="220">
          <template #default="{ row }">{{ getOrderMaterialNames(row) }}</template>
        </el-table-column>
        <el-table-column label="Manufacturer / Brand" min-width="150">
          <template #default="{ row }">{{ getOrderManufacturers(row) }}</template>
        </el-table-column>
        <el-table-column label="Unit Price (Tax Included)" width="120">
          <template #default="{ row }">{{ getOrderQuotedPrices(row) }}</template>
        </el-table-column>
        <el-table-column label="Total (Tax Included)" width="120">
          <template #default="{ row }">{{ getOrderWinningPrices(row) }}</template>
        </el-table-column>
        <el-table-column label="Delivery Date" width="140">
          <template #default="{ row }">{{ getOrderDeliveryTimes(row) }}</template>
        </el-table-column>
        <el-table-column label="Bid Status" width="110">
          <template #default="{ row }"><el-tag :type="getBidResultTagType(row.bidResult)">{{ getBidResultText(row.bidResult) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="Order Stage" prop="currentStatus" width="160" sortable="custom">
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
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="orderQuery.page"
          v-model:page-size="orderQuery.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="ordersTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleOrderPageSizeChange"
          @current-change="loadOrders"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Sort } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { exportHistoryOrdersApi, getOrdersApi } from '@/api/orders'
import { ORDER_STATUS_OPTIONS, ORDER_STATUS_TEXT } from '@/config/order'
import type { OrderListItem, OrderListQuery, OrderSortBy } from '@/types/order'

const BID_RESULT_TEXT: Record<'PENDING' | 'WON' | 'LOST', string> = {
  PENDING: 'Undetermined',
  WON: 'Won',
  LOST: 'Lost'
}

type HistoryOrderListItem = OrderListItem & {
  bidResult: 'PENDING' | 'WON' | 'LOST'
}

const router = useRouter()
const ordersLoading = ref(false)
const exportingHistoryOrders = ref(false)
const orders = ref<HistoryOrderListItem[]>([])
const ordersTotal = ref(0)

const orderFilters = reactive({
  search: '',
  orderNo: '',
  companyName: '',
  productName: '',
  productCode: '',
  modelSpec: '',
  creator: '',
  supplier: '',
  status: '',
  bidResult: '' as 'PENDING' | 'WON' | 'LOST' | '',
  deliveryMonth: '',
  deliveryTime: '',
  year: undefined as number | undefined,
  amountMin: undefined as number | undefined,
  amountMax: undefined as number | undefined
})

const orderQuery = reactive<OrderListQuery>({
  page: 1,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc'
})

function normalizeOrderFilters() {
  return {
    search: orderFilters.search || undefined,
    orderNo: orderFilters.orderNo || undefined,
    companyName: orderFilters.companyName || undefined,
    productName: orderFilters.productName || undefined,
    productCode: orderFilters.productCode || undefined,
    modelSpec: orderFilters.modelSpec || undefined,
    creator: orderFilters.creator || undefined,
    supplier: orderFilters.supplier || undefined,
    status: orderFilters.status || undefined,
    bidResult: orderFilters.bidResult || undefined,
    deliveryMonth: orderFilters.deliveryMonth || undefined,
    deliveryTime: orderFilters.deliveryTime || undefined,
    year: orderFilters.year,
    amountMin: orderFilters.amountMin,
    amountMax: orderFilters.amountMax
  }
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

function getBidResultTagType(result: 'PENDING' | 'WON' | 'LOST') {
  if (result === 'WON') {
    return 'success'
  }

  if (result === 'LOST') {
    return 'danger'
  }

  return 'info'
}

function getBidResultText(result: 'PENDING' | 'WON' | 'LOST') {
  return BID_RESULT_TEXT[result] || result
}

function joinPreview(values: Array<string | null | undefined>) {
  const filled = Array.from(new Set(values.map((value) => value || '').filter(Boolean)))

  if (!filled.length) {
    return '-'
  }

  if (filled.length <= 2) {
    return filled.join(', ')
  }

  return `${filled.slice(0, 2).join(', ')} and more (${filled.length} items total)`
}

function getOrderMaterialNames(row: HistoryOrderListItem) {
  return joinPreview(row.historyItems?.map((item) => item.materialName || item.materialCode) || [row.productNameCn])
}

function getOrderManufacturers(row: HistoryOrderListItem) {
  return joinPreview(row.historyItems?.map((item) => item.manufacturer) || [])
}

function getOrderQuotedPrices(row: HistoryOrderListItem) {
  return joinPreview(row.historyItems?.map((item) => item.quotedPrice) || [])
}

function getOrderWinningPrices(row: HistoryOrderListItem) {
  return joinPreview(row.historyItems?.map((item) => item.winningPrice) || [])
}

function getOrderDeliveryTimes(row: HistoryOrderListItem) {
  return joinPreview(row.historyItems?.map((item) => item.deliveryTime) || [])
}

async function loadOrders() {
  ordersLoading.value = true

  try {
    const { data } = await getOrdersApi({
      ...orderQuery,
      ...normalizeOrderFilters()
    })
    orders.value = data.items as HistoryOrderListItem[]
    ordersTotal.value = data.pagination.total
  } catch {
    ElMessage.error('Confirmed Orders search failed')
  } finally {
    ordersLoading.value = false
  }
}

async function handleExportHistoryOrders() {
  exportingHistoryOrders.value = true

  try {
    const { data } = await exportHistoryOrdersApi({
      ...normalizeOrderFilters(),
      sortBy: orderQuery.sortBy,
      sortOrder: orderQuery.sortOrder
    })
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Order History Search-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('Could not export order history')
  } finally {
    exportingHistoryOrders.value = false
  }
}

function handleOrderSearch() {
  orderQuery.page = 1
  loadOrders()
}

function handleOrderReset() {
  orderFilters.search = ''
  orderFilters.orderNo = ''
  orderFilters.companyName = ''
  orderFilters.productName = ''
  orderFilters.productCode = ''
  orderFilters.modelSpec = ''
  orderFilters.creator = ''
  orderFilters.supplier = ''
  orderFilters.status = ''
  orderFilters.bidResult = ''
  orderFilters.deliveryMonth = ''
  orderFilters.deliveryTime = ''
  orderFilters.year = undefined
  orderFilters.amountMin = undefined
  orderFilters.amountMax = undefined
  orderQuery.page = 1
  orderQuery.pageSize = 10
  orderQuery.sortBy = 'createdAt'
  orderQuery.sortOrder = 'desc'
  loadOrders()
}

function handleOrderPageSizeChange() {
  orderQuery.page = 1
  loadOrders()
}

function handleSortChange(sort: Sort) {
  orderQuery.page = 1

  if (!sort.order) {
    orderQuery.sortBy = 'createdAt'
    orderQuery.sortOrder = 'desc'
    loadOrders()
    return
  }

  orderQuery.sortBy = sort.prop as OrderSortBy
  orderQuery.sortOrder = sort.order === 'ascending' ? 'asc' : 'desc'
  loadOrders()
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

onMounted(loadOrders)
</script>
