<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Annual Business Summary</h1>
        <p>Summarize purchase contracts and inquiries from January 1 through December 25 of the selected year.</p>
      </div>
    </div>

    <section class="year-filter-section">
      <el-form class="year-filter-form" label-position="top" @submit.prevent>
        <el-form-item label="Year">
          <el-date-picker
            v-model="selectedYear"
            class="full-width"
            type="year"
            value-format="YYYY"
            placeholder="Select Year"
            :disabled-date="disableUnsupportedYear"
          />
        </el-form-item>
      </el-form>
      <span class="year-range">{{ selectedYear }} : January 1 to December 25</span>
    </section>

    <section class="form-section annual-business-section">
      <div class="table-toolbar">
        <div>
          <h2>Export Purchase Contract</h2>
          <p>Select a customer to export its purchase contract details for the year.</p>
        </div>
      </div>

      <el-form class="annual-contract-form" label-position="top" @submit.prevent>
        <el-form-item label="Customer">
          <el-select
            v-model="selectedCompany"
            class="full-width"
            filterable
            :loading="companiesLoading"
            :disabled="companiesLoading || !selectedYear"
            placeholder="Select Customer"
          >
            <el-option
              v-for="company in companies"
              :key="company"
              :label="company.trim()"
              :value="company"
            />
          </el-select>
        </el-form-item>

        <el-form-item class="annual-contract-action">
          <el-button
            type="primary"
            :icon="Download"
            :loading="exportingContracts"
            :disabled="!selectedYear || companiesLoading"
            @click="handleExport"
          >
            Export Purchase Contract Excel
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="companiesLoaded && !companies.length"
        class="annual-contract-alert"
        type="info"
        :closable="false"
        show-icon
        title="No matching customers for this year"
      />
    </section>

    <section class="form-section annual-business-section">
      <div class="table-toolbar inquiry-summary-toolbar">
        <div>
          <h2>Export Inquiry Summary</h2>
          <p>Summarize inquiry counts, wins, and win rates by customer.</p>
        </div>
        <el-button
          type="primary"
          :icon="Download"
          :loading="exportingInquirySummary"
          :disabled="!selectedYear"
          @click="handleInquirySummaryExport"
        >
          Export Inquiry Summary Excel
        </el-button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { Download } from '@element-plus/icons-vue'
import axios from 'axios'
import type { AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import { onMounted, ref, watch } from 'vue'

import {
  exportAnnualInquirySummaryApi,
  exportAnnualPurchaseContractsApi,
  getAnnualPurchaseContractCompaniesApi
} from '@/api/reports'
import {
  getAnnualPurchaseContractFilename,
  getShanghaiCalendarYear
} from '@/utils/annualPurchaseContractDownload'

const currentYear = getShanghaiCalendarYear()
const selectedYear = ref(String(currentYear))
const selectedCompany = ref('')
const companies = ref<string[]>([])
const companiesLoading = ref(false)
const companiesLoaded = ref(false)
const exportingContracts = ref(false)
const exportingInquirySummary = ref(false)
let companyRequestId = 0

function disableUnsupportedYear(date: Date) {
  const year = date.getFullYear()
  return year < 2000 || year > currentYear
}

async function loadCompanies() {
  selectedCompany.value = ''
  companies.value = []
  companiesLoaded.value = false

  const year = Number(selectedYear.value)
  if (!Number.isInteger(year)) {
    return
  }

  const requestId = ++companyRequestId
  companiesLoading.value = true

  try {
    const { data } = await getAnnualPurchaseContractCompaniesApi({ year })
    if (requestId !== companyRequestId) {
      return
    }

    companies.value = data.items
    companiesLoaded.value = true
  } catch {
    if (requestId === companyRequestId) {
      ElMessage.error('Could not load customers')
    }
  } finally {
    if (requestId === companyRequestId) {
      companiesLoading.value = false
    }
  }
}

async function getErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) {
    return fallback
  }

  const responseData = error.response?.data
  if (responseData instanceof Blob) {
    try {
      const payload = JSON.parse(await responseData.text()) as { message?: string }
      return payload.message || fallback
    } catch {
      return fallback
    }
  }

  return responseData?.message || fallback
}

function downloadWorkbook(response: AxiosResponse<Blob>, fallback: string) {
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')

  link.href = url
  link.download = getAnnualPurchaseContractFilename(
    response.headers['content-disposition'],
    fallback
  )
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function handleExport() {
  const year = Number(selectedYear.value)
  if (!Number.isInteger(year) || !selectedCompany.value) {
    ElMessage.warning('Select a year and customer')
    return
  }

  exportingContracts.value = true

  try {
    const response = await exportAnnualPurchaseContractsApi({
      year,
      inquiryCompany: selectedCompany.value
    })
    const fallbackCompany = selectedCompany.value.trim().replace(/[\\/:*?"<>|]/g, '_')
    const fallback = `${year}-${fallbackCompany}-Annual Purchase Contract Summary.xlsx`

    downloadWorkbook(response, fallback)
  } catch (error) {
    ElMessage.error(await getErrorMessage(error, 'Annual Export Purchase Contract Failed'))
  } finally {
    exportingContracts.value = false
  }
}

async function handleInquirySummaryExport() {
  const year = Number(selectedYear.value)
  if (!Number.isInteger(year)) {
    ElMessage.warning('Select Year')
    return
  }

  exportingInquirySummary.value = true

  try {
    const response = await exportAnnualInquirySummaryApi({ year })
    downloadWorkbook(response, `${year}-Annual Inquiry Summary.xlsx`)
  } catch (error) {
    ElMessage.error(await getErrorMessage(error, 'Annual Inquiry Summary could not be exported'))
  } finally {
    exportingInquirySummary.value = false
  }
}

watch(selectedYear, loadCompanies)
onMounted(loadCompanies)
</script>

<style scoped>
.annual-business-section,
.year-filter-section {
  max-width: 1080px;
}

.year-filter-section {
  display: flex;
  align-items: end;
  gap: 20px;
  padding: 20px 0 28px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.year-filter-form {
  width: 240px;
}

.year-filter-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.year-range {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  color: var(--el-text-color-secondary);
}

.annual-contract-form {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto;
  gap: 24px;
  align-items: end;
}

.annual-contract-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.annual-contract-action :deep(.el-form-item__content) {
  min-height: 40px;
  align-items: center;
}

.annual-contract-alert {
  margin-top: 24px;
}

.inquiry-summary-toolbar {
  align-items: center;
}

@media (max-width: 1180px) {
  .annual-contract-form {
    grid-template-columns: 1fr;
  }

  .annual-contract-action :deep(.el-button) {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .year-filter-section,
  .inquiry-summary-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .year-filter-form,
  .inquiry-summary-toolbar :deep(.el-button) {
    width: 100%;
  }
}
</style>
