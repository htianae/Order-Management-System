<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Historical Inquiries</h1>
        <p>Search historical inquiries imported from Excel.</p>
      </div>
    </div>

    <section class="form-section">
      <div class="table-toolbar">
        <div>
          <h2>Historical Inquiries</h2>
          <p>Search by customer, date, product, manufacturer, and bid status.</p>
        </div>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="handleHistoryExcelChange">
          <el-button :loading="bulkImporting" type="success" plain>Import Historical Inquiries Excel</el-button>
        </el-upload>
      </div>

      <el-form class="advanced-search-form" :model="inquiryFilters" label-position="top" @submit.prevent>
        <el-form-item label="Keyword">
          <el-input v-model.trim="inquiryFilters.search" clearable placeholder="Product code, name, model, brand, or inquiry manufacturer" @keyup.enter="handleInquirySearch" />
        </el-form-item>
        <el-form-item label="Customer">
          <el-input v-model.trim="inquiryFilters.companyName" clearable placeholder="Enter Customer Name" />
        </el-form-item>
        <el-form-item label="Inquiry Date">
          <el-date-picker v-model="inquiryFilters.inquiryDate" class="full-width" type="date" value-format="YYYY-MM-DD" placeholder="Select Inquiry Date" />
        </el-form-item>
        <el-form-item label="Brand / Manufacturer">
          <el-input v-model.trim="inquiryFilters.manufacturer" clearable placeholder="Enter brand or manufacturer" />
        </el-form-item>
        <el-form-item label="Inquiry Manufacturer">
          <el-input v-model.trim="inquiryFilters.supplier" clearable placeholder="Enter Inquiry Manufacturer" />
        </el-form-item>
        <el-form-item label="Bid Result">
          <el-select v-model="inquiryFilters.result" class="full-width" clearable placeholder="All">
            <el-option label="Undetermined" value="PENDING" />
            <el-option label="Won" value="WON" />
            <el-option label="Lost" value="LOST" />
          </el-select>
        </el-form-item>
        <div class="search-actions">
          <el-button type="primary" @click="handleInquirySearch">Search Historical Inquiries</el-button>
          <el-button @click="handleInquiryReset">Clear</el-button>
        </div>
      </el-form>

      <el-table
        v-loading="inquiriesLoading"
        :data="inquiryItems"
        class="data-table"
        border
        :default-sort="{ prop: inquiryQuery.sortBy, order: inquiryQuery.sortOrder === 'asc' ? 'ascending' : 'descending' }"
        @sort-change="handleInquirySortChange"
      >
        <el-table-column label="Customer" prop="companyName" min-width="170" sortable="custom">
          <template #default="{ row }">{{ row.inquiry.inquiryCompany }}</template>
        </el-table-column>
        <el-table-column label="Inquiry Date" prop="inquiryDate" width="120" sortable="custom">
          <template #default="{ row }">{{ formatDate(row.inquiry.inquiryDate) }}</template>
        </el-table-column>
        <el-table-column label="Product Code" prop="materialCode" min-width="140" sortable="custom">
          <template #default="{ row }">{{ row.materialCode || '-' }}</template>
        </el-table-column>
        <el-table-column label="Product Name" prop="materialName" min-width="220" sortable="custom" />
        <el-table-column label="Model and Specifications" prop="modelSpec" min-width="220" sortable="custom">
          <template #default="{ row }">{{ row.modelSpec || '-' }}</template>
        </el-table-column>
        <el-table-column label="Brand / Manufacturer" prop="manufacturer" min-width="150" sortable="custom">
          <template #default="{ row }">{{ row.manufacturer || '-' }}</template>
        </el-table-column>
        <el-table-column label="Quoted Unit Price" prop="quotedPrice" width="120" sortable="custom">
          <template #default="{ row }">{{ row.quotedPrice || '-' }}</template>
        </el-table-column>
        <el-table-column label="Inquiry Manufacturer" prop="supplierName" min-width="160" sortable="custom">
          <template #default="{ row }">{{ row.supplierName || '-' }}</template>
        </el-table-column>
        <el-table-column label="Bid Result" prop="result" width="110" sortable="custom">
          <template #default="{ row }"><el-tag :type="getBidResultTagType(row.result)">{{ getBidResultText(row.result) }}</el-tag></template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="inquiryQuery.page"
          v-model:page-size="inquiryQuery.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="inquiriesTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleInquiryPageSizeChange"
          @current-change="loadInquiries"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Sort, UploadFile } from 'element-plus'
import * as XLSX from 'xlsx'
import { onMounted, reactive, ref } from 'vue'

import { bulkCreateInquiriesApi, getInquiriesApi } from '@/api/inquiries'
import type { InquiryHistoryItem, InquiryListQuery, InquiryResult } from '@/types/inquiry'
import { buildHistoryInquiryPayloads, chunkInquiryPayloads, type ExcelRow } from '@/utils/inquiryExcel'

const BID_RESULT_TEXT: Record<'PENDING' | 'WON' | 'LOST', string> = {
  PENDING: 'Undetermined',
  WON: 'Won',
  LOST: 'Lost'
}

const inquiriesLoading = ref(false)
const bulkImporting = ref(false)
const inquiryItems = ref<InquiryHistoryItem[]>([])
const inquiriesTotal = ref(0)

const inquiryFilters = reactive({
  search: '',
  companyName: '',
  inquiryDate: '',
  manufacturer: '',
  supplier: '',
  result: '' as InquiryResult | ''
})

const inquiryQuery = reactive<InquiryListQuery>({
  page: 1,
  pageSize: 10,
  sortBy: 'inquiryDate',
  sortOrder: 'desc'
})

function normalizeInquiryFilters() {
  return {
    search: inquiryFilters.search || undefined,
    companyName: inquiryFilters.companyName || undefined,
    inquiryDate: inquiryFilters.inquiryDate || undefined,
    manufacturer: inquiryFilters.manufacturer || undefined,
    supplier: inquiryFilters.supplier || undefined,
    result: inquiryFilters.result || undefined
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US')
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

async function loadInquiries() {
  inquiriesLoading.value = true

  try {
    const { data } = await getInquiriesApi({
      ...inquiryQuery,
      ...normalizeInquiryFilters()
    })
    inquiryItems.value = data.items
    inquiriesTotal.value = data.pagination.total
  } catch {
    ElMessage.error('Inquiry Records search failed')
  } finally {
    inquiriesLoading.value = false
  }
}

function handleInquirySearch() {
  inquiryQuery.page = 1
  loadInquiries()
}

function handleInquiryReset() {
  inquiryFilters.search = ''
  inquiryFilters.companyName = ''
  inquiryFilters.inquiryDate = ''
  inquiryFilters.manufacturer = ''
  inquiryFilters.supplier = ''
  inquiryFilters.result = ''
  inquiryQuery.page = 1
  inquiryQuery.pageSize = 10
  inquiryQuery.sortBy = 'inquiryDate'
  inquiryQuery.sortOrder = 'desc'
  loadInquiries()
}

async function handleHistoryExcelChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) {
    return
  }

  bulkImporting.value = true

  try {
    const buffer = await uploadFile.raw.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      header: 1,
      defval: '',
      raw: true
    })
    const payloads = buildHistoryInquiryPayloads(rows, uploadFile.name)
    const chunks = chunkInquiryPayloads(payloads)
    let itemCount = 0

    for (const chunk of chunks) {
      await bulkCreateInquiriesApi({ inquiries: chunk })
      itemCount += chunk.reduce((total, payload) => total + payload.items.length, 0)
    }

    ElMessage.success(`Imported ${payloads.length}  groups, ${itemCount}  historical inquiries`)
    inquiryQuery.page = 1
    await loadInquiries()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historical Inquiry Workbook could not be imported'
    ElMessage.error(message)
  } finally {
    bulkImporting.value = false
  }
}

function handleInquiryPageSizeChange() {
  inquiryQuery.page = 1
  loadInquiries()
}

function handleInquirySortChange(sort: Sort) {
  const sortableFields = new Set([
    'companyName',
    'inquiryDate',
    'materialCode',
    'materialName',
    'modelSpec',
    'manufacturer',
    'quotedPrice',
    'supplierName',
    'result'
  ])

  inquiryQuery.page = 1

  if (!sort.prop || !sortableFields.has(String(sort.prop)) || !sort.order) {
    inquiryQuery.sortBy = 'inquiryDate'
    inquiryQuery.sortOrder = 'desc'
  } else {
    inquiryQuery.sortBy = sort.prop as NonNullable<InquiryListQuery['sortBy']>
    inquiryQuery.sortOrder = sort.order === 'ascending' ? 'asc' : 'desc'
  }

  loadInquiries()
}

onMounted(loadInquiries)
</script>
