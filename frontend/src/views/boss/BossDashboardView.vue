<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Management Dashboard</h1>
        <p>Order metrics, performance rankings, and risk alerts.</p>
      </div>
      <el-button :loading="loading" @click="loadDashboard">Refresh</el-button>
    </div>

    <el-skeleton v-if="loading && !loaded" :rows="8" animated />

    <template v-else>
      <section class="summary-grid boss-summary-grid">
        <div class="summary-card">
          <span>Total Orders</span>
          <strong>{{ dashboard.summary.totalOrderCount }}</strong>
        </div>
        <div class="summary-card">
          <span>Total Award Amount</span>
          <strong>{{ formatMoney(dashboard.summary.totalWinningAmount) }}</strong>
        </div>
        <div class="summary-card">
          <span>Total Profit</span>
          <strong>{{ formatMoney(dashboard.summary.totalProfit) }}</strong>
        </div>
        <div class="summary-card">
          <span>Average Profit Margin</span>
          <strong>{{ formatRate(dashboard.summary.averageProfitRate) }}</strong>
        </div>
        <div class="summary-card">
          <span>Collection Rate</span>
          <strong>{{ formatRate(dashboard.summary.recoveryRate) }}</strong>
          <small>Received: {{ formatMoney(dashboard.summary.receivedAmount) }}</small>
        </div>
      </section>

      <section class="trend-dashboard-grid">
        <TrendLineChart
          title="Monthly Order Trends"
          :subtitle="`${currentYear} : January–December order volume, revenue, and profit`"
          :points="dashboard.trend.monthly"
        />
        <TrendLineChart
          title="Annual Order Trends"
          subtitle="View annual order volume, revenue, and profit"
          :points="dashboard.trend.yearly"
        />
      </section>

      <section class="dashboard-grid">
        <div class="dashboard-panel">
          <h2>Employee Performance Ranking</h2>
          <el-table :data="dashboard.rankings.employees" class="data-table" border>
            <el-table-column label="Employee" min-width="120">
              <template #default="{ row }">{{ row.realName || row.username }}</template>
            </el-table-column>
            <el-table-column label="Order Count" prop="orderCount" width="90" />
            <el-table-column label="Award Amount" width="140">
              <template #default="{ row }">{{ formatMoney(row.winningAmount) }}</template>
            </el-table-column>
            <el-table-column label="Profit" width="140">
              <template #default="{ row }">{{ formatMoney(row.profit) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="dashboard-panel">
          <h2>Company Revenue Ranking</h2>
          <el-table :data="dashboard.rankings.companies" class="data-table" border>
            <el-table-column label="Company" prop="companyName" min-width="160" />
            <el-table-column label="Order Count" prop="orderCount" width="90" />
            <el-table-column label="Award Amount" width="140">
              <template #default="{ row }">{{ formatMoney(row.winningAmount) }}</template>
            </el-table-column>
            <el-table-column label="Profit" width="140">
              <template #default="{ row }">{{ formatMoney(row.profit) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="dashboard-panel dashboard-panel-wide">
          <h2>Profit Margin Ranking</h2>
          <el-table
            :data="dashboard.rankings.profitRates"
            class="data-table"
            border
            :default-sort="{ prop: profitRankingSortBy, order: profitRankingSortOrder === 'asc' ? 'ascending' : 'descending' }"
            @sort-change="handleProfitRankingSortChange"
          >
            <el-table-column label="Order Number" min-width="170">
              <template #default="{ row }">
                <el-button type="primary" link @click="goDetail(row.id)">{{ row.orderNo }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="Company" prop="inquiryCompany" min-width="160" />
            <el-table-column label="Product" prop="productNameCn" min-width="160" />
            <el-table-column label="Award Amount" prop="winningAmount" width="140" sortable="custom">
              <template #default="{ row }">{{ formatMoney(row.winningAmount) }}</template>
            </el-table-column>
            <el-table-column label="Profit" prop="profit" width="140" sortable="custom">
              <template #default="{ row }">{{ formatMoney(row.profit) }}</template>
            </el-table-column>
            <el-table-column label="Profit Margin" prop="profitRate" width="110" sortable="custom">
              <template #default="{ row }">{{ formatRate(row.profitRate) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="dashboard-panel dashboard-panel-wide">
          <h2>Purchasing Company Ranking</h2>
          <el-table :data="dashboard.rankings.purchaseCompanies" class="data-table" border>
            <el-table-column label="Purchasing Company" prop="companyName" min-width="180" />
            <el-table-column label="Order Count" prop="orderCount" width="100" />
            <el-table-column label="Purchase Amount" width="160">
              <template #default="{ row }">{{ formatMoney(row.purchaseAmount) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="dashboard-panel dashboard-panel-wide">
          <div class="table-toolbar">
            <div>
              <h2>Customer Analysis</h2>
              <p>{{ inquiryAnalysisMonth }} Customer Win Rate</p>
            </div>
            <el-date-picker
              v-model="inquiryAnalysisMonth"
              type="month"
              value-format="YYYY-MM"
              placeholder="Select Month"
              :clearable="false"
              @change="loadDashboard"
            />
          </div>
          <el-table
            :data="dashboard.rankings.inquiryCompanyAnalysis"
            class="data-table"
            border
            :default-sort="{ prop: inquiryAnalysisSortBy, order: inquiryAnalysisSortOrder === 'asc' ? 'ascending' : 'descending' }"
            @sort-change="handleInquiryAnalysisSortChange"
          >
            <el-table-column label="Customer" prop="companyName" min-width="180" />
            <el-table-column label="Inquiry Count" prop="orderCount" width="110" sortable="custom" />
            <el-table-column label="Won Count" prop="wonCount" width="110" sortable="custom" />
            <el-table-column label="Win Rate" prop="winRate" width="120" sortable="custom">
              <template #default="{ row }">{{ formatRate(row.winRate) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </section>

    </template>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Sort } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getBossDashboardApi } from '@/api/reports'
import TrendLineChart from '@/components/TrendLineChart.vue'
import type { BossDashboardQuery, BossDashboardResponse } from '@/types/report'

const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const inquiryAnalysisMonth = ref(formatMonthValue(new Date()))
const inquiryAnalysisSortBy = ref<NonNullable<BossDashboardQuery['inquiryAnalysisSortBy']>>('orderCount')
const inquiryAnalysisSortOrder = ref<NonNullable<BossDashboardQuery['inquiryAnalysisSortOrder']>>('desc')
const profitRankingSortBy = ref<NonNullable<BossDashboardQuery['profitRankingSortBy']>>('profitRate')
const profitRankingSortOrder = ref<NonNullable<BossDashboardQuery['profitRankingSortOrder']>>('desc')
const currentYear = new Date().getFullYear()
const dashboard = reactive<BossDashboardResponse>({
  summary: {
    totalOrderCount: 0,
    totalWinningAmount: '0',
    totalProfit: '0',
    averageProfitRate: '0',
    receivedAmount: '0',
    recoveryRate: '0'
  },
  trend: {
    monthly: [],
    yearly: []
  },
  rankings: {
    employees: [],
    companies: [],
    profitRates: [],
    purchaseCompanies: [],
    inquiryCompanyAnalysis: []
  },
  reminders: {
    unfinishedOrders: [],
    unpaidOrders: [],
    invoicePendingOrders: []
  }
})

function formatMoney(value: string) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
}

function formatRate(value: string) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function formatMonthValue(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  return `${value.getFullYear()}-${month}`
}

async function loadDashboard() {
  loading.value = true

  try {
    const { data } = await getBossDashboardApi({
      inquiryAnalysisMonth: inquiryAnalysisMonth.value,
      inquiryAnalysisSortBy: inquiryAnalysisSortBy.value,
      inquiryAnalysisSortOrder: inquiryAnalysisSortOrder.value,
      profitRankingSortBy: profitRankingSortBy.value,
      profitRankingSortOrder: profitRankingSortOrder.value
    })
    dashboard.summary = data.summary
    dashboard.trend = data.trend
    dashboard.rankings = data.rankings
    dashboard.reminders = data.reminders
    loaded.value = true
  } catch {
    ElMessage.error('Could not load management dashboard data')
  } finally {
    loading.value = false
  }
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

function handleProfitRankingSortChange(sort: Sort) {
  const sortableFields = new Set(['winningAmount', 'profit', 'profitRate'])

  if (!sort.prop || !sortableFields.has(String(sort.prop)) || !sort.order) {
    profitRankingSortBy.value = 'profitRate'
    profitRankingSortOrder.value = 'desc'
  } else {
    profitRankingSortBy.value = sort.prop as NonNullable<BossDashboardQuery['profitRankingSortBy']>
    profitRankingSortOrder.value = sort.order === 'ascending' ? 'asc' : 'desc'
  }

  loadDashboard()
}

function handleInquiryAnalysisSortChange(sort: Sort) {
  const sortableFields = new Set(['orderCount', 'wonCount', 'winRate'])

  if (!sort.prop || !sortableFields.has(String(sort.prop)) || !sort.order) {
    inquiryAnalysisSortBy.value = 'orderCount'
    inquiryAnalysisSortOrder.value = 'desc'
  } else {
    inquiryAnalysisSortBy.value = sort.prop as NonNullable<BossDashboardQuery['inquiryAnalysisSortBy']>
    inquiryAnalysisSortOrder.value = sort.order === 'ascending' ? 'asc' : 'desc'
  }

  loadDashboard()
}

onMounted(loadDashboard)
</script>
