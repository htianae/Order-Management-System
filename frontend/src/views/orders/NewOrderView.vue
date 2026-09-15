<template>
  <section class="content-panel order-create-page">
    <div v-if="isPageDraggingExcel" class="page-drop-overlay">
      <div class="page-drop-card">
        <strong>Drop to import Excel</strong>
        <span>Supports .xls / .xlsx File</span>
      </div>
    </div>

    <div class="section-heading">
      <div>
        <h1>New Order</h1>
        <p>Enter details manually or import an inquiry workbook and edit them afterward.</p>
      </div>
      <div class="header-actions">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="handleExcelChange"
        >
          <el-button :loading="importing">Import Inquiry Excel</el-button>
        </el-upload>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">Save and Submit</el-button>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="order-form">
      <section class="form-section">
        <h2>Order Details</h2>
        <div class="form-grid order-basic-grid">
          <el-form-item label="Order Number" prop="orderNo">
            <el-input v-model.trim="form.orderNo" placeholder="Enter Order Number" />
          </el-form-item>

          <el-form-item label="Customer" prop="inquiryCompany">
            <el-input v-model.trim="form.inquiryCompany" placeholder="Enter Customer" />
          </el-form-item>

          <el-form-item label="Declaring Company" prop="declarationCompany">
            <el-input v-model.trim="form.declarationCompany" placeholder="Enter Declaring Company" />
          </el-form-item>

          <el-form-item label="Inquiry Contact" prop="inquiryPerson">
            <el-input v-model.trim="form.inquiryPerson" placeholder="Enter Inquiry Contact" />
          </el-form-item>

          <el-form-item label="Inquiry Date" prop="inquiryDate">
            <el-date-picker
              v-model="form.inquiryDate"
              class="full-width"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="Select Inquiry Date"
            />
          </el-form-item>
        </div>
      </section>

      <section class="form-section">
        <div class="table-toolbar">
          <div>
            <h2>Material Details</h2>
            <p>Details are populated from the workbook and remain editable.</p>
          </div>
          <el-button type="primary" plain @click="addRow">Add Row</el-button>
        </div>

        <el-table :data="items" class="excel-table" border>
          <el-table-column label="No." width="70" align="center" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>

          <el-table-column label="Material Code" min-width="150">
            <template #default="{ row }">
              <el-input v-model.trim="row.materialCode" />
            </template>
          </el-table-column>

          <el-table-column label="Product Description" min-width="220">
            <template #default="{ row }">
              <el-input v-model.trim="row.materialDescription" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
            </template>
          </el-table-column>

          <el-table-column label="Line Item Notes" min-width="180">
            <template #default="{ row }">
              <el-input v-model.trim="row.remark" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" />
            </template>
          </el-table-column>

          <el-table-column label="Supplier Material Notes" min-width="260">
            <template #default="{ row }">
              <el-input v-model.trim="row.supplierRemark" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
            </template>
          </el-table-column>

          <el-table-column label="Order Delivery Date" min-width="140">
            <template #default="{ row }">
              <el-input v-model.trim="row.deliveryTime" />
            </template>
          </el-table-column>

          <el-table-column label="Unit" width="110">
            <template #default="{ row }">
              <el-input v-model.trim="row.unit" />
            </template>
          </el-table-column>

          <el-table-column label="Requested Quantity" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.quantity" class="table-number" :min="0" :precision="3" />
            </template>
          </el-table-column>

          <el-table-column label="Manufacturer / Brand" min-width="140">
            <template #default="{ row }">
              <el-input v-model.trim="row.manufacturer" />
            </template>
          </el-table-column>

          <el-table-column label="Unit Price (Tax Included)" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.quotedPrice" class="table-number" :min="0" :precision="2" />
            </template>
          </el-table-column>

          <el-table-column label="Total (Tax Included)" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.taxIncludedTotal" class="table-number" :min="0" :precision="2" />
            </template>
          </el-table-column>

          <el-table-column label="Requesting Department / Applicant" min-width="190">
            <template #default="{ row }">
              <el-input v-model.trim="row.applicantDepartment" />
            </template>
          </el-table-column>

          <el-table-column label="Actions" width="90" fixed="right" align="center">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeRow($index)">Delete</el-button>
            </template>
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
import { useRouter } from 'vue-router'
import * as XLSX from 'xlsx'

import { createOrderApi } from '@/api/orders'
import type { CreateOrderItemPayload, CreateOrderPayload } from '@/types/order'
import {
  findOrderInquiryCompanyBelowHeader,
  findOrderNumberFromRows,
  ORDER_INQUIRY_COMPANY_LABELS
} from '@/utils/orderExcelFields'

type OrderForm = Omit<CreateOrderPayload, 'items'>
type EditableOrderItem = CreateOrderItemPayload & { rowKey: number }
type ExcelCell = string | number | boolean | Date | null | undefined
type ExcelRow = ExcelCell[]

const EMPTY_TEXT = 'None'

const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const importing = ref(false)
const isPageDraggingExcel = ref(false)
let rowKeySeed = 1
let pageDragDepth = 0

const form = reactive<OrderForm>({
  orderNo: '',
  inquiryCompany: '',
  declarationCompany: EMPTY_TEXT,
  inquiryPerson: '',
  inquiryDate: '',
  inquiryNo: '',
  productCode: '',
  productNameCn: '',
  modelSpec: '',
  quantity: undefined
})

const items = ref<EditableOrderItem[]>([createEmptyRow()])

const rules: FormRules = {
  orderNo: [{ required: true, message: 'Enter Order Number', trigger: 'blur' }],
  inquiryCompany: [{ required: true, message: 'Enter Customer', trigger: 'blur' }],
  inquiryDate: [{ required: true, message: 'Select Inquiry Date', trigger: 'change' }]
}

function createEmptyRow(): EditableOrderItem {
  return {
    rowKey: rowKeySeed++,
    materialCode: '',
    materialDescription: '',
    remark: '',
    supplierRemark: '',
    manufacturer: '',
    quantity: undefined,
    unit: '',
    quotedPrice: undefined,
    taxIncludedTotal: undefined,
    deliveryTime: '',
    inquiryRemark: '',
    applicantDepartment: ''
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
    return formatDate(value)
  }

  return String(value).replace(/\s+/g, ' ').trim()
}

function textOrNone(value: ExcelCell) {
  return cleanCell(value) || EMPTY_TEXT
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

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(value: ExcelCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value)
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
  return Number.isNaN(parsed.getTime()) ? '' : formatDate(parsed)
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

function appendMineAreaName(company: ExcelCell, mineArea: ExcelCell) {
  const companyText = textOrNone(company)
  const mineAreaText = cleanCell(mineArea)

  if (!mineAreaText || companyText.includes(mineAreaText)) {
    return companyText
  }

  return `${companyText} (${mineAreaText})`
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

function parseExcelRows(rows: ExcelRow[]) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => ['Material Code', '物料编码'].map(normalizeLabel).includes(normalizeLabel(cell))))

  if (headerIndex === -1) {
    throw new Error('Material headers were not found')
  }

  const orderNo = findValueAfterLabel(rows, ['订单编号', 'Order Number', '订单号', 'Order Number'])
    || findOrderNumberFromRows(rows, headerIndex)
  const inquiryDate = findValueAfterLabel(rows, ['签订日期', 'Contract Date', '询价日期', 'Inquiry Date'])
  const inquiryCompany = findOrderInquiryCompanyBelowHeader(rows, headerIndex)
    || findValueAfterLabel(rows.filter((_row, index) => index !== headerIndex), ORDER_INQUIRY_COMPANY_LABELS)
  const declarationCompany = findValueAfterLabel(rows, ['申报公司', 'Declaring Company', '报关公司', 'Customs Declaration Company', '申报单位', 'Declaring Company', '报关单位', 'Customs Declaration Company'])
  const mineAreaName = findValueAfterLabel(rows, ['中标公司', 'Awarded Company', '矿区名称', 'Mining Area Name', '矿区', 'Mining Area', '项目公司', 'Project Company', '项目单位', 'Project Company'])
  const inquiryPerson = findValueAfterLabel(rows, ['采购主办', 'Purchase Coordinator', '询价人', 'Inquiry Contact', '申请人', 'Applicant'])

  const headerMap = buildHeaderMap(rows[headerIndex])
  const parsedItems: EditableOrderItem[] = []

  for (const row of rows.slice(headerIndex + 1)) {
    const firstCell = cleanCell(row[0])
    const materialCode = cleanCell(getByHeader(row, headerMap, ['物料编码', 'Material Code']))
    const materialDescription = cleanCell(getByHeader(row, headerMap, ['产品描述', 'Product Description', '物料描述', 'Material Description']))

    if (['质量要求', 'Quality Requirements', '验收要求', 'Acceptance Requirements', '交货方式', 'Delivery Method', '交货地点', 'Delivery Location', '付款方式', 'Payment Method', '备注', 'Notes'].includes(firstCell)) {
      break
    }

    if (!materialCode && !materialDescription) {
      continue
    }

    parsedItems.push({
      rowKey: rowKeySeed++,
      materialCode: materialCode || EMPTY_TEXT,
      materialDescription: materialDescription || EMPTY_TEXT,
      remark: textOrNone(getByHeader(row, headerMap, ['行项目说明', 'Line Item Notes', '备注说明', 'Notes'])),
      supplierRemark: textOrNone(getByHeader(row, headerMap, ['供应商对物料补充说明', 'Supplier Material Notes'])),
      deliveryTime: textOrNone(getByHeader(row, headerMap, ['订单交货日期', 'Order Delivery Date', '货期', 'Lead Time'])),
      unit: textOrNone(getByHeader(row, headerMap, ['单位', 'Unit'])),
      quantity: parseNumberCell(getByHeader(row, headerMap, ['需求数量', 'Requested Quantity', '数量', 'Quantity'])),
      manufacturer: textOrNone(getByHeader(row, headerMap, ['厂家/品牌', 'Manufacturer / Brand', '厂家', 'Manufacturer', '品牌', 'Brand'])),
      quotedPrice: parseNumberCell(getByHeader(row, headerMap, ['含税单价', 'Unit Price (Tax Included)', '报价', 'Quote'])),
      taxIncludedTotal: parseNumberCell(getByHeader(row, headerMap, ['含税总价', 'Total (Tax Included)'])),
      applicantDepartment: textOrNone(getByHeader(row, headerMap, ['申请部门/申请人', 'Requesting Department / Applicant'])),
      inquiryRemark: ''
    })
  }

  if (!parsedItems.length) {
    throw new Error('No material items were found to import')
  }

  return {
    orderNo: textOrNone(orderNo),
    inquiryCompany: appendMineAreaName(inquiryCompany, mineAreaName),
    declarationCompany: textOrNone(declarationCompany),
    inquiryPerson: textOrNone(inquiryPerson),
    inquiryDate: normalizeDate(inquiryDate),
    items: parsedItems
  }
}

async function importExcelFile(file: File) {
  importing.value = true

  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      header: 1,
      defval: '',
      raw: true
    })
    const parsed = parseExcelRows(rows)

    form.orderNo = parsed.orderNo
    form.inquiryCompany = parsed.inquiryCompany
    form.declarationCompany = parsed.declarationCompany
    form.inquiryPerson = parsed.inquiryPerson
    form.inquiryDate = parsed.inquiryDate
    form.inquiryNo = ''
    form.productCode = ''
    form.productNameCn = ''
    form.modelSpec = ''
    form.quantity = undefined
    items.value = parsed.items
    ElMessage.success(`Imported ${parsed.items.length}  material items`)
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

function isFilledRow(row: EditableOrderItem) {
  return Object.entries(row).some(([key, value]) => {
    if (key === 'rowKey') {
      return false
    }

    return value !== undefined && value !== ''
  })
}

function normalizeRow(row: EditableOrderItem): CreateOrderItemPayload {
  return {
    materialCode: row.materialCode,
    materialDescription: row.materialDescription,
    remark: row.remark,
    supplierRemark: row.supplierRemark,
    manufacturer: row.manufacturer,
    quantity: row.quantity,
    unit: row.unit,
    quotedPrice: row.quotedPrice,
    taxIncludedTotal: row.taxIncludedTotal,
    deliveryTime: row.deliveryTime,
    inquiryRemark: row.inquiryRemark,
    applicantDepartment: row.applicantDepartment
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate()

  if (!valid) {
    return
  }

  const filledItems = items.value.filter(isFilledRow).map(normalizeRow)

  if (!filledItems.length) {
    ElMessage.error('Enter at least one material')
    return
  }

  submitting.value = true

  try {
    const { data } = await createOrderApi({
      ...form,
      items: filledItems
    })

	    ElMessage.success(data.message)
	    router.push({ name: 'orders' })
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Order could not be created')
  } finally {
    submitting.value = false
  }
}
</script>
