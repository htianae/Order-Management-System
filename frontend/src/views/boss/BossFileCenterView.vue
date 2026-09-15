<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>File Management</h1>
        <p>Managers and administrators can view and download all order attachments.</p>
      </div>
      <el-button :loading="loading" @click="loadFiles">Refresh</el-button>
    </div>

    <div class="list-toolbar file-center-toolbar">
      <el-input
        v-model.trim="searchText"
        class="search-input"
        clearable
        placeholder="Search filename, order number, company, product, or uploader"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />
      <el-select v-model="query.category" clearable placeholder="File Type" class="file-filter-select" @change="handleSearch">
        <el-option
          v-for="option in FILE_CATEGORY_OPTIONS"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-button type="primary" @click="handleSearch">Search</el-button>
      <el-button @click="handleReset">Reset</el-button>
    </div>

    <el-table v-loading="loading" :data="files" class="data-table" border>
      <el-table-column label="Filename" min-width="240">
        <template #default="{ row }">
          <div class="file-name-cell">
            <el-button type="primary" link @click="handleDownload(row)">{{ row.originalName }}</el-button>
            <span>{{ row.mimeType }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="File Type" width="140">
        <template #default="{ row }">{{ FILE_CATEGORY_TEXT[row.category] || row.category }}</template>
      </el-table-column>

      <el-table-column label="Associated Order" min-width="180">
        <template #default="{ row }">
          <el-button v-if="row.order" type="primary" link @click="goDetail(row.order.id)">
            {{ row.order.orderNo }}
          </el-button>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <el-table-column label="Customer" min-width="180">
        <template #default="{ row }">{{ row.order?.inquiryCompany || '-' }}</template>
      </el-table-column>

      <el-table-column label="Product" min-width="160">
        <template #default="{ row }">{{ row.order?.productNameCn || '-' }}</template>
      </el-table-column>

      <el-table-column label="Size" width="110">
        <template #default="{ row }">{{ formatFileSize(row.size) }}</template>
      </el-table-column>

      <el-table-column label="Uploaded By" width="130">
        <template #default="{ row }">{{ row.uploader.realName || row.uploader.username }}</template>
      </el-table-column>

      <el-table-column label="Uploaded At" width="180">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>

      <el-table-column label="Actions" width="150" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link :loading="downloadingId === row.id" @click="handleDownload(row)">Download</el-button>
          <el-button link @click="previewFile(row)">Preview</el-button>
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
        @current-change="loadFiles"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { downloadOrderFileApi, getBossOrderFilesApi } from '@/api/orders'
import { FILE_CATEGORY_OPTIONS, FILE_CATEGORY_TEXT } from '@/config/order'
import type { BossFileListQuery, BossOrderFile } from '@/types/order'

const router = useRouter()
const loading = ref(false)
const downloadingId = ref('')
const files = ref<BossOrderFile[]>([])
const total = ref(0)
const searchText = ref('')

const query = reactive<BossFileListQuery>({
  page: 1,
  pageSize: 10,
  search: '',
  category: ''
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

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function loadFiles() {
  loading.value = true

  try {
    const { data } = await getBossOrderFilesApi(query)
    files.value = data.items
    total.value = data.pagination.total
  } catch {
    ElMessage.error('File List could not be loaded')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  query.search = searchText.value
  loadFiles()
}

function handleReset() {
  searchText.value = ''
  query.page = 1
  query.pageSize = 10
  query.search = ''
  query.category = ''
  loadFiles()
}

function handlePageSizeChange() {
  query.page = 1
  loadFiles()
}

async function handleDownload(file: BossOrderFile) {
  downloadingId.value = file.id

  try {
    const { data } = await downloadOrderFileApi(file.id)
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = file.originalName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('File could not be downloaded')
  } finally {
    downloadingId.value = ''
  }
}

function previewFile(file: BossOrderFile) {
  window.open(file.url, '_blank', 'noopener,noreferrer')
}

function goDetail(id: string) {
  router.push({ name: 'order-detail', params: { id } })
}

onMounted(loadFiles)
</script>
