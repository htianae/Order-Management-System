<template>
  <section class="content-panel">
    <div v-if="isPageDraggingExcel" class="page-drop-overlay">
      <div class="page-drop-card">
        <strong>Drop to import inquiry Excel</strong>
        <span>Supports .xls / .xlsx File</span>
      </div>
    </div>

    <div class="section-heading">
      <div>
        <h1>Inquiry Records</h1>
        <p>Track all inquiries and search quotes, manufacturers, and bid results by material name.</p>
      </div>
      <div class="header-actions">
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="handleExcelChange">
          <el-button :loading="importing">Import Inquiry Excel</el-button>
        </el-upload>
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls" :on-change="handleHistoryExcelChange">
          <el-button :loading="bulkImporting" type="success" plain>Batch Import Historical Inquiries</el-button>
        </el-upload>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">Save Inquiry Records</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="order-form">
      <section class="form-section">
        <h2>Inquiry Details</h2>
        <div class="form-grid order-basic-grid">
          <el-form-item label="Inquiry Number" prop="inquiryNo">
            <el-input v-model.trim="form.inquiryNo" placeholder="Optional" />
          </el-form-item>
          <el-form-item label="Customer" prop="inquiryCompany">
            <el-input v-model.trim="form.inquiryCompany" placeholder="Enter Customer" />
          </el-form-item>
          <el-form-item label="Inquiry Contact" prop="inquiryPerson">
            <el-input v-model.trim="form.inquiryPerson" placeholder="Enter Inquiry Contact" />
          </el-form-item>
          <el-form-item label="Inquiry Date" prop="inquiryDate">
            <el-date-picker v-model="form.inquiryDate" class="full-width" type="date" value-format="YYYY-MM-DD" placeholder="Select Inquiry Date" />
          </el-form-item>
          <el-form-item label="Notes" class="business-form-wide">
            <el-input v-model.trim="form.remark" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </section>

      <section class="form-section">
        <div class="table-toolbar">
          <div>
            <h2>Inquiry Details</h2>
            <p>Edit imported details as needed. Missing fields may be left blank.</p>
          </div>
          <el-button type="primary" plain @click="addRow">Add Row</el-button>
        </div>

        <el-table :data="items" class="excel-table" border>
          <el-table-column label="No." width="70" fixed align="center">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="Material Code" min-width="140">
            <template #default="{ row }"><el-input v-model.trim="row.materialCode" /></template>
          </el-table-column>
          <el-table-column label="Material Name" min-width="220">
            <template #default="{ row }"><el-input v-model.trim="row.materialName" /></template>
          </el-table-column>
          <el-table-column label="Notes" min-width="220">
            <template #default="{ row }"><el-input v-model.trim="row.remark" /></template>
          </el-table-column>
          <el-table-column label="Manufacturer / Brand" min-width="150">
            <template #default="{ row }"><el-input v-model.trim="row.manufacturer" /></template>
          </el-table-column>
          <el-table-column label="Quoting Company / Supplier" min-width="170">
            <template #default="{ row }"><el-input v-model.trim="row.supplierName" /></template>
          </el-table-column>
          <el-table-column label="Quantity" width="130">
            <template #default="{ row }"><el-input-number v-model="row.quantity" class="table-number" :min="0" :precision="3" /></template>
          </el-table-column>
          <el-table-column label="Unit" width="100">
            <template #default="{ row }"><el-input v-model.trim="row.unit" /></template>
          </el-table-column>
          <el-table-column label="Quote" width="140">
            <template #default="{ row }"><el-input-number v-model="row.quotedPrice" class="table-number" :min="0" :precision="2" /></template>
          </el-table-column>
          <el-table-column label="Total Price" width="140">
            <template #default="{ row }"><el-input-number v-model="row.totalAmount" class="table-number" :min="0" :precision="2" /></template>
          </el-table-column>
          <el-table-column label="Lead Time" min-width="130">
            <template #default="{ row }"><el-input v-model.trim="row.deliveryTime" /></template>
          </el-table-column>
          <el-table-column label="Result" width="130">
            <template #default="{ row }">
              <el-select v-model="row.result" class="full-width">
                <el-option label="Undetermined" value="PENDING" />
                <el-option label="Won" value="WON" />
                <el-option label="Lost" value="LOST" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="Award Price" width="140">
            <template #default="{ row }"><el-input-number v-model="row.winningPrice" class="table-number" :min="0" :precision="2" /></template>
          </el-table-column>
          <el-table-column label="Actions" width="90" fixed="right" align="center">
            <template #default="{ $index }"><el-button type="danger" link @click="removeRow($index)">Delete</el-button></template>
          </el-table-column>
        </el-table>
      </section>
    </el-form>

  </section>
</template>

<script setup lang="ts">
import type { AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules, UploadFile } from 'element-plus'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as XLSX from 'xlsx'

import { bulkCreateInquiriesApi, createInquiryApi } from '@/api/inquiries'
import type { CreateInquiryPayload, InquiryItemPayload, InquiryResult } from '@/types/inquiry'
import { buildHistoryInquiryPayloads, chunkInquiryPayloads } from '@/utils/inquiryExcel'
import { findInquiryCompanyBelowHeader } from '@/utils/inquiryExcelFields'

type EditableInquiryItem = InquiryItemPayload & { rowKey: number; result: InquiryResult }
type InquiryForm = Omit<CreateInquiryPayload, 'items'>
type ExcelCell = string | number | boolean | Date | null | undefined
type ExcelRow = ExcelCell[]

const formRef = ref<FormInstance>()
const submitting = ref(false)
const importing = ref(false)
const bulkImporting = ref(false)
const isPageDraggingExcel = ref(false)
let rowKeySeed = 1
let pageDragDepth = 0

const form = reactive<InquiryForm>({
  inquiryNo: '',
  inquiryCompany: '',
  inquiryPerson: '',
  inquiryDate: '',
  remark: ''
})

const items = ref<EditableInquiryItem[]>([createEmptyRow()])

const rules: FormRules = {
  inquiryCompany: [{ required: true, message: 'Enter Customer', trigger: 'blur' }],
  inquiryDate: [{ required: true, message: 'Select Inquiry Date', trigger: 'change' }]
}

function createEmptyRow(): EditableInquiryItem {
  return {
    rowKey: rowKeySeed++,
    materialCode: '',
    materialName: '',
    modelSpec: '',
    manufacturer: '',
    supplierName: '',
    unit: '',
    quantity: undefined,
    quotedPrice: undefined,
    totalAmount: undefined,
    deliveryTime: '',
    result: 'PENDING',
    winningPrice: undefined,
    remark: ''
  }
}

function addRow() {
  items.value.push(createEmptyRow())
}

function removeRow(index: number) {
  if (items.value.length === 1) {
    items.value = [createEmptyRow()]
    return
  }

  items.value.splice(index, 1)
}

function cleanCell(value: ExcelCell) {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return formatDate(value.toISOString())
  }

  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value: ExcelCell) {
  return cleanCell(value).replace(/\s+/g, '').replace(/[/:：()（）]/g, '').toLowerCase()
}

function parseNumberCell(value: ExcelCell) {
  const text = cleanCell(value).replace(/,/g, '').replace(/CNY|RMB|[￥¥元]/gi, '')

  if (!text) {
    return undefined
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(value: ExcelCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value.toISOString())
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }

  const text = cleanCell(value)
  const matched = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)

  if (matched) {
    return `${matched[1]}-${matched[2].padStart(2, '0')}-${matched[3].padStart(2, '0')}`
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : formatDate(parsed.toISOString())
}

function findValueAfterLabel(rows: ExcelRow[], labels: string[]) {
  const normalizedLabels = labels.map(normalizeLabel)

  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (!normalizedLabels.includes(normalizeLabel(row[index]))) {
        continue
      }

      const value = row.slice(index + 1).find((cell) => cleanCell(cell))
      if (value !== undefined) {
        return value
      }
    }
  }

  return ''
}

function findPurchaseOrderTitleCompany(rows: ExcelRow[]) {
  const title = cleanCell(rows[0]?.[0])

  if (!/Purchase Order|采购订单/i.test(title)) {
    return ''
  }

  return title.replace(/\s*(?:Purchase Order|采购订单).*/i, '').trim()
}

function buildHeaderMap(headerRow: ExcelRow) {
  const map = new Map<string, number>()

  headerRow.forEach((cell, index) => {
    const label = normalizeLabel(cell)
    if (label) {
      map.set(label, index)
    }
  })

  return map
}

function getByHeader(row: ExcelRow, headerMap: Map<string, number>, labels: string[]) {
  for (const label of labels) {
    const index = headerMap.get(normalizeLabel(label))
    if (index !== undefined) {
      return row[index]
    }
  }

  return ''
}

function parseResult(value: ExcelCell): InquiryResult {
  const text = cleanCell(value)

  if (/^(no|reject|否|否决|不)$/i.test(text) || /未中|失败|lost|failed|not selected/i.test(text)) {
    return 'LOST'
  }

  if (/^(yes|是|中)$/i.test(text) || /中标|成交|采用|won|selected/i.test(text)) {
    return 'WON'
  }

  return 'PENDING'
}

function looksLikeDeliveryTime(value: ExcelCell) {
  const text = cleanCell(value)

  if (!text) {
    return false
  }

  if (/days?|weeks?|months?|in stock|天|周|月|现货|工作日/i.test(text)) {
    return true
  }

  const numeric = Number(text)
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 365
}

function parseExcelRows(rows: ExcelRow[]) {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeLabel)
    return normalized.some((cell) => ['物料名称', 'Material Name', '物料描述', 'Material Description', '产品名称', 'Product Name', '产品描述', 'Product Description'].map(normalizeLabel).includes(cell))
  })

  if (headerIndex === -1) {
    throw new Error('Inquiry headers were not found')
  }

  const headerMap = buildHeaderMap(rows[headerIndex])
  const metaRows = rows.slice(0, headerIndex)
  const parsedItems: EditableInquiryItem[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    const materialName = cleanCell(getByHeader(row, headerMap, ['物料名称', 'Material Name', '物料描述', 'Material Description', '产品名称', 'Product Name', '产品描述', 'Product Description', '品名中文', 'Product Name']))

    if (!materialName) {
      continue
    }

    const buyerRemark = cleanCell(getByHeader(row, headerMap, ['备注说明(对采购方及供方)', 'Notes(For Buyer and Supplier)', '备注说明对采购方及供方', 'Notes for Buyer and Supplier', '备注说明', 'Notes', '行项目说明', 'Line Item Notes', '供应商对物料补充说明', 'Supplier Material Notes', '备注', 'Notes']))
    const quoteRemark = cleanCell(getByHeader(row, headerMap, ['报价时需备注的内容', 'Notes Required for Quoting', '报价备注', 'Quote Notes', '报价说明', 'Quote Description']))
    const remark = [buyerRemark, quoteRemark].filter(Boolean).join('; ')

    parsedItems.push({
      rowKey: rowKeySeed++,
      materialCode: cleanCell(getByHeader(row, headerMap, ['物料编码', 'Material Code', '产品代码', 'Product Code', '编码', 'Code'])),
      materialName,
      modelSpec: '',
      manufacturer: cleanCell(getByHeader(row, headerMap, ['厂家/品牌', 'Manufacturer / Brand', '厂家', 'Manufacturer', '品牌', 'Brand', '制造商', 'Manufacturer'])),
      supplierName: cleanCell(getByHeader(row, headerMap, ['询价', 'Inquiry', '供应商', 'Supplier', '报价公司', 'Quoting Company', '询价公司', 'Customer', '公司名称', 'Company Name'])),
      unit: cleanCell(getByHeader(row, headerMap, ['单位', 'Unit'])),
      quantity: parseNumberCell(getByHeader(row, headerMap, ['数量', 'Quantity', '需求数量', 'Requested Quantity'])),
      quotedPrice: parseNumberCell(getByHeader(row, headerMap, ['报价', 'Quote', '含税单价', 'Unit Price (Tax Included)', '单价', 'Unit Price', '询价价格', 'Inquiry Price'])),
      totalAmount: parseNumberCell(getByHeader(row, headerMap, ['总价', 'Total Price', '含税总价', 'Total (Tax Included)', '金额', 'Amount'])),
      deliveryTime: cleanCell(getByHeader(row, headerMap, ['货期', 'Lead Time', '交货期', 'Lead Time', '订单交货日期', 'Order Delivery Date'])),
      result: parseResult(getByHeader(row, headerMap, ['结果', 'Result', '中标状态', 'Bid Status', '是否中标', 'Bid Result', '状态', 'Status'])),
      winningPrice: parseNumberCell(getByHeader(row, headerMap, ['中标价', 'Award Price', '中标价格', 'Award Price', '中标金额', 'Award Amount'])),
      remark
    })
  }

  if (!parsedItems.length) {
    throw new Error('No inquiry items were found to import')
  }

  return {
    inquiryNo: cleanCell(findValueAfterLabel(rows, ['询价编号', 'Inquiry Number', '询价单号', 'Inquiry Number', '订单编号', 'Order Number', '编号', 'Number'])),
    inquiryCompany:
      cleanCell(findInquiryCompanyBelowHeader(rows, headerIndex))
      || cleanCell(findValueAfterLabel(metaRows, ['需求单位', 'Customer', '需求公司', 'Customer', '客户', 'Customer', '客户名称', 'Customer Name', '需求方', 'Customer', '使用单位', 'End User', '公司名称', 'Company Name', '询价公司', 'Customer']))
      || findPurchaseOrderTitleCompany(rows)
      || 'Not Specified',
    inquiryPerson: cleanCell(findValueAfterLabel(rows, ['询价人', 'Inquiry Contact', '采购人', 'Buyer', '联系人', 'Contact', '申请人', 'Applicant'])),
    inquiryDate: normalizeDate(findValueAfterLabel(rows, ['询价日期', 'Inquiry Date', '签订日期', 'Contract Date', '日期', 'Date', '报价日期', 'Quote Date'])),
    items: parsedItems
  }
}

function getRowCell(row: ExcelRow, index: number) {
  return row[index] ?? ''
}

function buildHistoryPayloads(rows: ExcelRow[], sourceName: string): CreateInquiryPayload[] {
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeLabel)
    return ['Inquiry Contact', '询价人'].some((label) => normalized.includes(normalizeLabel(label))) &&
      ['Inquiry Date', '询价日期'].some((label) => normalized.includes(normalizeLabel(label))) &&
      ['Product Code', '产品代码'].some((label) => normalized.includes(normalizeLabel(label))) &&
      normalized.some((cell) => ['Product Name / Model', 'Product Name, Model', '品名型号', '品名，型号'].map(normalizeLabel).includes(cell))
  })

  if (headerIndex === -1) {
    throw new Error('Historical inquiry headers were not found')
  }

  const sourceTitle = sourceName.replace(/\.(xlsx|xls)$/i, '')
  const groups = new Map<string, CreateInquiryPayload>()
  const headerMap = buildHeaderMap(rows[headerIndex])
  let currentPerson = ''
  let currentDate = ''

  rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    const person = cleanCell(getRowCell(row, 0))
    const date = normalizeDate(getRowCell(row, 1))
    const productCode = cleanCell(getRowCell(row, 2))
    const materialName = cleanCell(getRowCell(row, 3))

    if (person) {
      currentPerson = person
    }

    if (date) {
      currentDate = date
    }

    if (!productCode && !materialName) {
      return
    }

    const priceCell = getRowCell(row, 7)
    const quotedPrice = parseNumberCell(priceCell)
    const colI = getRowCell(row, 8)
    const colJ = getRowCell(row, 9)
    const colK = getRowCell(row, 10)
    const colL = getRowCell(row, 11)
    const colM = getRowCell(row, 12)
    const shiftedByTotal = parseNumberCell(colI) !== undefined && looksLikeDeliveryTime(colJ)
    const totalAmount = shiftedByTotal ? parseNumberCell(colI) : undefined
    const deliveryTime = shiftedByTotal ? cleanCell(colJ) : cleanCell(colI)
    const manufacturer = shiftedByTotal ? cleanCell(colK) : cleanCell(colJ)
    const supplierName = shiftedByTotal ? cleanCell(colL) : cleanCell(colK)
    const remarkParts = [
      cleanCell(getRowCell(row, 4)),
      quotedPrice === undefined ? cleanCell(priceCell) : '',
      shiftedByTotal ? cleanCell(colM) : cleanCell(colL),
      shiftedByTotal ? cleanCell(getRowCell(row, 13)) : cleanCell(colM)
    ].filter(Boolean)
    const remark = remarkParts.join('; ')
    const resultCell = getByHeader(row, headerMap, ['中标/未中标', 'Won / Lost', '中标未中标', 'Won / Lost', '是否中标', 'Bid Result', '中标状态', 'Bid Status', '结果', 'Result'])
    const result = parseResult(resultCell || [remark, supplierName].join(' '))
    const inquiryDate = currentDate || formatDate(new Date().toISOString())
    const inquiryPerson = currentPerson || 'Not Specified'
    const groupKey = `${inquiryDate}|${inquiryPerson}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        inquiryNo: `${sourceTitle}-${inquiryDate}-${inquiryPerson}`,
        inquiryCompany: sourceTitle,
        inquiryPerson,
        inquiryDate,
        remark: `Batch import: ${sourceName}`,
        items: []
      })
    }

    groups.get(groupKey)?.items.push({
      materialCode: productCode,
      materialName: materialName || productCode || `No. ${rowIndex + 1}  material rows`,
      manufacturer,
      supplierName,
      unit: cleanCell(getRowCell(row, 6)),
      quantity: parseNumberCell(getRowCell(row, 5)),
      quotedPrice,
      totalAmount,
      deliveryTime,
      result,
      winningPrice: result === 'WON' ? quotedPrice : undefined,
      remark
    })
  })

  const payloads = Array.from(groups.values()).filter((payload) => payload.items.length)

  if (!payloads.length) {
    throw new Error('No historical inquiry items were found to import')
  }

  return payloads
}

function splitHistoryPayloads(payloads: CreateInquiryPayload[]) {
  const maxItemsPerRequest = 20
  const splitPayloads: CreateInquiryPayload[] = []

  payloads.forEach((payload) => {
    if (payload.items.length <= maxItemsPerRequest) {
      splitPayloads.push(payload)
      return
    }

    for (let index = 0; index < payload.items.length; index += maxItemsPerRequest) {
      const chunkIndex = Math.floor(index / maxItemsPerRequest) + 1
      splitPayloads.push({
        ...payload,
        inquiryNo: `${payload.inquiryNo || 'Historical Inquiries'}-${chunkIndex}`,
        remark: `${payload.remark || ''}; Segment ${chunkIndex}`.replace(/^; /, ''),
        items: payload.items.slice(index, index + maxItemsPerRequest)
      })
    }
  })

  return splitPayloads
}

async function importExcelFile(file: File) {
  importing.value = true

  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { header: 1, defval: '', raw: true })
    const parsed = parseExcelRows(rows)

    form.inquiryNo = parsed.inquiryNo
    form.inquiryCompany = parsed.inquiryCompany
    form.inquiryPerson = parsed.inquiryPerson
    form.inquiryDate = parsed.inquiryDate
    items.value = parsed.items
    ElMessage.success(`Imported ${parsed.items.length}  inquiry items`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Excel  could not be imported'
    ElMessage.error(message)
  } finally {
    importing.value = false
  }
}

async function handleExcelChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) {
    return
  }

  await importExcelFile(uploadFile.raw)
}

async function handleHistoryExcelChange(uploadFile: UploadFile) {
  if (!uploadFile.raw) {
    return
  }

  bulkImporting.value = true

  try {
    const buffer = await uploadFile.raw.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { header: 1, defval: '', raw: true })
    const payloads = buildHistoryInquiryPayloads(rows, uploadFile.name)
    const chunks = chunkInquiryPayloads(payloads)
    let itemCount = 0

    for (const chunk of chunks) {
      await bulkCreateInquiriesApi({ inquiries: chunk })
      itemCount += chunk.reduce((total, payload) => total + payload.items.length, 0)
    }

    ElMessage.success(`Batch imported ${payloads.length}  groups, ${itemCount}  historical inquiries`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historical Inquiry Workbook could not be imported'
    ElMessage.error(message)
  } finally {
    bulkImporting.value = false
  }
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function isExcelFile(file: File) {
  return /\.(xlsx|xls)$/i.test(file.name)
}

function resetPageDragState() {
  pageDragDepth = 0
  isPageDraggingExcel.value = false
}

function handlePageDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  pageDragDepth += 1
  isPageDraggingExcel.value = true
}

function handlePageDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  event.dataTransfer!.dropEffect = 'copy'
  isPageDraggingExcel.value = true
}

function handlePageDragLeave(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  pageDragDepth = Math.max(0, pageDragDepth - 1)

  if (pageDragDepth === 0) {
    isPageDraggingExcel.value = false
  }
}

async function handlePageDrop(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.preventDefault()
  const file = Array.from(event.dataTransfer?.files || []).find(isExcelFile)
  resetPageDragState()

  if (!file) {
    ElMessage.error('Drop .xls  or .xlsx  Excel files')
    return
  }

  await importExcelFile(file)
}

onMounted(() => {
  window.addEventListener('dragenter', handlePageDragEnter)
  window.addEventListener('dragover', handlePageDragOver)
  window.addEventListener('dragleave', handlePageDragLeave)
  window.addEventListener('drop', handlePageDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', handlePageDragEnter)
  window.removeEventListener('dragover', handlePageDragOver)
  window.removeEventListener('dragleave', handlePageDragLeave)
  window.removeEventListener('drop', handlePageDrop)
})

function isFilledRow(row: EditableInquiryItem) {
  return Boolean(row.materialName || row.materialCode || row.manufacturer || row.supplierName || row.quotedPrice)
}

function normalizeRow(row: EditableInquiryItem): InquiryItemPayload {
  return {
    materialCode: row.materialCode,
    materialName: row.materialName || row.materialCode || 'Unnamed Material',
    modelSpec: row.modelSpec,
    manufacturer: row.manufacturer,
    supplierName: row.supplierName,
    unit: row.unit,
    quantity: row.quantity,
    quotedPrice: row.quotedPrice,
    totalAmount: row.totalAmount,
    deliveryTime: row.deliveryTime,
    result: row.result,
    winningPrice: row.winningPrice,
    remark: row.remark
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate()

  if (!valid) {
    return
  }

  const filledItems = items.value.filter(isFilledRow).map(normalizeRow)

  if (!filledItems.length) {
    ElMessage.error('Enter at least one inquiry item')
    return
  }

  submitting.value = true

  try {
    const { data } = await createInquiryApi({ ...form, items: filledItems })
    ElMessage.success(data.message)
    items.value = [createEmptyRow()]
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Inquiry Records could not be saved')
  } finally {
    submitting.value = false
  }
}
</script>
