<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Business Analysis</h1>
        <p>View company revenue, profit margins, and purchasing company rankings.</p>
      </div>
      <el-button :loading="loading" @click="loadAnalysis">Refresh</el-button>
    </div>

    <el-skeleton v-if="loading && !loaded" :rows="8" animated />

    <section v-else class="dashboard-grid">
      <div class="dashboard-panel dashboard-panel-wide">
        <h2>Company Revenue Ranking</h2>
        <el-table :data="analysis.rankings.companies" class="data-table" border>
          <el-table-column label="Company" prop="companyName" min-width="180" />
          <el-table-column label="Order Count" prop="orderCount" width="100" />
          <el-table-column label="Award Amount" width="160">
            <template #default="{ row }">{{ formatMoney(row.winningAmount) }}</template>
          </el-table-column>
          <el-table-column label="Profit" width="160">
            <template #default="{ row }">{{ formatMoney(row.profit) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="dashboard-panel dashboard-panel-wide">
        <h2>Profit Margin Ranking</h2>
        <el-table :data="analysis.rankings.profitRates" class="data-table" border>
          <el-table-column label="Order Number" min-width="170">
            <template #default="{ row }">
              <el-button type="primary" link @click="goDetail(row.id)">{{ row.orderNo }}</el-button>
            </template>
          </el-table-column>
          <el-table-column label="Company" prop="inquiryCompany" min-width="180" />
          <el-table-column label="Product" prop="productNameCn" min-width="180">
            <template #default="{ row }">{{ row.productNameCn || '-' }}</template>
          </el-table-column>
          <el-table-column label="Award Amount" width="160">
            <template #default="{ row }">{{ formatMoney(row.winningAmount) }}</template>
          </el-table-column>
          <el-table-column label="Profit" width="160">
            <template #default="{ row }">{{ formatMoney(row.profit) }}</template>
          </el-table-column>
          <el-table-column label="Profit Margin" width="120">
            <template #default="{ row }">{{ formatRate(row.profitRate) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="dashboard-panel dashboard-panel-wide">
        <h2>Purchasing Company Ranking</h2>
        <el-table :data="purchaseCompanyRankingRows" class="data-table" border>
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
            @change="loadAnalysis"
          />
        </div>
        <el-table
          :data="analysis.rankings.inquiryCompanyAnalysis"
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
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Sort } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getBusinessAnalysisApi } from '@/api/reports'
import type { BusinessAnalysisQuery, BusinessAnalysisResponse } from '@/types/report'

const router = useRouter()
const loading = ref(false)
const loaded = ref(false)
const inquiryAnalysisMonth = ref(formatMonthValue(new Date()))
const inquiryAnalysisSortBy = ref<NonNullable<BusinessAnalysisQuery['inquiryAnalysisSortBy']>>('orderCount')
const inquiryAnalysisSortOrder = ref<NonNullable<BusinessAnalysisQuery['inquiryAnalysisSortOrder']>>('desc')
const analysis = reactive<BusinessAnalysisResponse>({
  rankings: {
    companies: [],
    profitRates: [],
    purchaseCompanies: [],
    inquiryCompanyAnalysis: []
  }
})

const purchaseCompanyRankingRows = computed(() => {
  const total = analysis.rankings.purchaseCompanies.reduce((result, item) => {
    result.orderCount += item.orderCount
    result.purchaseAmount += Number(item.purchaseAmount || 0)
    return result
  }, {
    orderCount: 0,
    purchaseAmount: 0
  })

  return [
    ...analysis.rankings.purchaseCompanies,
    {
      companyName: 'Total',
      orderCount: total.orderCount,
      purchaseAmount: total.purchaseAmount.toString()
    }
  ]
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

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

async function loadAnalysis() {
  loading.value = true

  try {
    const { data } = await getBusinessAnalysisApi({
      inquiryAnalysisMonth: inquiryAnalysisMonth.value,
      inquiryAnalysisSortBy: inquiryAnalysisSortBy.value,
      inquiryAnalysisSortOrder: inquiryAnalysisSortOrder.value
    })
    analysis.rankings = data.rankings
    loaded.value = true
  } catch {
    ElMessage.error('Business Analysis Data could not be loaded')
  } finally {
    loading.value = false
  }
}

function handleInquiryAnalysisSortChange(sort: Sort) {
  const sortableFields = new Set(['orderCount', 'wonCount', 'winRate'])

  if (!sort.prop || !sortableFields.has(String(sort.prop)) || !sort.order) {
    inquiryAnalysisSortBy.value = 'orderCount'
    inquiryAnalysisSortOrder.value = 'desc'
  } else {
    inquiryAnalysisSortBy.value = sort.prop as NonNullable<BusinessAnalysisQuery['inquiryAnalysisSortBy']>
    inquiryAnalysisSortOrder.value = sort.order === 'ascending' ? 'asc' : 'desc'
  }

  loadAnalysis()
}

onMounted(loadAnalysis)
</script>
