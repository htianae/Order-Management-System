<template>
  <section class="content-panel">
    <div class="section-heading">
      <div>
        <h1>Order Details</h1>
        <p>{{ order?.orderNo || 'Loading order details' }}</p>
      </div>
      <div class="header-actions">
        <el-button v-if="order" :loading="exportingShipping" @click="handleExportShippingApplication">
          Export Shipping Request
        </el-button>
        <el-button v-if="order" :loading="exportingPurchaseContract" @click="handleExportPurchaseContract">
          Export Purchase Contract
        </el-button>
        <el-button v-if="canDeleteOrders" type="danger" plain :loading="deletingOrder" @click="handleDeleteOrder">
          Delete Order
        </el-button>
        <el-button @click="router.push({ name: 'orders' })">Back to List</el-button>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else-if="order">
      <el-tabs v-model="activeDetailTab" class="detail-tabs" type="border-card">
        <el-tab-pane label="Basic Details" name="basic">
          <section class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Order Details</h2>
              </div>
              <div class="inline-actions">
                <template v-if="isEditingBasicInfo">
                  <el-button @click="cancelBasicInfoEdit">Cancel</el-button>
                  <el-button type="primary" :loading="basicInfoSaving" @click="handleSaveBasicInfo">Save Basic Details</el-button>
                </template>
                <el-button v-else type="primary" plain @click="startBasicInfoEdit">Edit Basic Details</el-button>
              </div>
            </div>

            <el-form v-if="isEditingBasicInfo" class="business-form" label-position="top" @submit.prevent>
              <el-form-item label="Order Number">
                <el-input v-model.trim="basicInfoForm.orderNo" />
              </el-form-item>
              <el-form-item label="Customer">
                <el-input v-model.trim="basicInfoForm.inquiryCompany" />
              </el-form-item>
              <el-form-item label="Declaring Company">
                <el-input v-model.trim="basicInfoForm.declarationCompany" />
              </el-form-item>
              <el-form-item label="Inquiry Contact">
                <el-input v-model.trim="basicInfoForm.inquiryPerson" />
              </el-form-item>
              <el-form-item label="Inquiry Date">
                <el-date-picker v-model="basicInfoForm.inquiryDate" class="full-width" type="date" value-format="YYYY-MM-DD" />
              </el-form-item>
              <el-form-item label="Inquiry Number">
                <el-input v-model.trim="basicInfoForm.inquiryNo" />
              </el-form-item>
              <el-form-item label="Arrival Date">
                <el-date-picker
                  v-model="basicInfoForm.arrivedAtCompanyAt"
                  class="full-width"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                />
              </el-form-item>
              <el-form-item label="Order Total">
                <el-input :model-value="formatMoney(order.winningAmount)" disabled />
              </el-form-item>
            </el-form>

            <el-descriptions v-else class="detail-block" :column="3" border>
              <el-descriptions-item label="Order Number">{{ order.orderNo }}</el-descriptions-item>
              <el-descriptions-item label="Customer">{{ order.inquiryCompany }}</el-descriptions-item>
              <el-descriptions-item label="Declaring Company">{{ order.declarationCompany || 'None' }}</el-descriptions-item>
              <el-descriptions-item label="Inquiry Contact">{{ order.inquiryPerson || '-' }}</el-descriptions-item>
              <el-descriptions-item label="Inquiry Date">{{ formatDate(order.inquiryDate) }}</el-descriptions-item>
              <el-descriptions-item label="Arrival Date">
                {{ order.shippingInfo?.arrivedAtCompanyAt ? formatDateTime(order.shippingInfo.arrivedAtCompanyAt) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="Order Total">{{ formatMoney(order.winningAmount) }}</el-descriptions-item>
              <el-descriptions-item label="Status">
                <el-tag>{{ orderStatusSummaryText }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="Created By">
                {{ order.creator.realName || order.creator.username }}
              </el-descriptions-item>
              <el-descriptions-item label="Created At">{{ formatDateTime(order.createdAt) }}</el-descriptions-item>
            </el-descriptions>
          </section>

          <section class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Customer Contract</h2>
                <p>Upload the customer order or a contract signed by both parties.</p>
              </div>
            </div>
            <el-form class="file-upload-form customer-contract-upload-form" @submit.prevent>
              <el-form-item>
                <el-upload
                  :auto-upload="false"
                  multiple
                  :file-list="customerContractFiles"
                  :on-change="handleCustomerContractFileChange"
                  :on-remove="handleCustomerContractFileChange"
                  :accept="acceptedFileTypes"
                >
                  <el-button>Select File</el-button>
                </el-upload>
              </el-form-item>
              <el-button type="primary" :loading="customerContractUploading" @click="handleCustomerContractUpload">
                Upload Customer Contract
              </el-button>
            </el-form>

            <el-table :data="customerContractOrderFiles" class="data-table nested-table" border>
              <el-table-column label="Filename" min-width="260">
                <template #default="{ row }">{{ row.originalName }}</template>
              </el-table-column>
              <el-table-column label="Uploaded By" width="140">
                <template #default="{ row }">{{ row.uploader.realName || row.uploader.username }}</template>
              </el-table-column>
              <el-table-column label="Uploaded At" width="180">
                <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column label="Actions" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link :loading="downloadingFileId === row.id" @click="handleDownloadOrderFile(row)">
                    Download
                  </el-button>
                  <el-button type="danger" link :loading="deletingFileId === row.id" @click="handleDeleteOrderFile(row, 'Customer Contract')">
                    Delete
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <section v-if="false" class="next-action-panel">
            <h2>Next Order Step</h2>
            <div v-if="batchCurrentStatus && batchNextStatusOptions.length" class="order-status-action">
              <el-tag :type="getStatusTagType(batchCurrentStatus)">
                Current: {{ ORDER_STATUS_TEXT[batchCurrentStatus] || batchCurrentStatus }}
              </el-tag>
              <el-select v-model="batchNextStatus" class="item-status-select" placeholder="Next Status">
                <el-option
                  v-for="option in batchNextStatusOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-input v-model.trim="batchStatusNote" class="item-status-note" placeholder="Notes" />
              <el-button type="primary" :loading="batchStatusSubmitting" @click="handleBatchStatusSubmit">
                Update All Material Statuses
              </el-button>
            </div>
            <el-alert
              v-else-if="batchCurrentStatus === 'ARRIVED_COMPANY' && !canManageOrders"
              type="warning"
              show-icon
              :closable="false"
              title="Shipping Request Pending Management Approval"
            />
            <el-alert
              v-else-if="hasMixedItemStatuses"
              type="info"
              show-icon
              :closable="false"
              title="Materials have different statuses. Update each one under Order Processing."
            />
            <el-tag v-else type="info">No Next Step</el-tag>
          </section>

          <h2 class="detail-title">Order Items</h2>
          <el-table :data="order?.items || []" class="data-table" border>
            <el-table-column label="No." prop="lineNo" width="70" align="center" />
            <el-table-column label="Material Code" min-width="150">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.materialCode" />
                <span v-else>{{ row.materialCode || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Product Description" min-width="260">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.materialDescription" />
                <span v-else>{{ row.materialDescription || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Line Item Notes" min-width="200">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.remark" />
                <span v-else>{{ row.remark || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Supplier Notes" min-width="240">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.supplierRemark" />
                <span v-else>{{ row.supplierRemark || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Order Delivery Date" min-width="150">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.deliveryTime" />
                <span v-else>{{ row.deliveryTime || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Unit" width="110">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.unit" />
                <span v-else>{{ row.unit || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Requested Quantity" width="140">
              <template #default="{ row }">
                <el-input-number v-if="editingOrderItemId === row.id" v-model="orderItemEditForm.quantity" class="full-width" :min="0" :precision="3" />
                <span v-else>{{ row.quantity || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Manufacturer / Brand" min-width="150">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.manufacturer" />
                <span v-else>{{ row.manufacturer || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Unit Price (Tax Included)" width="140">
              <template #default="{ row }">
                <el-input-number v-if="editingOrderItemId === row.id" v-model="orderItemEditForm.quotedPrice" class="full-width" :min="0" :precision="2" />
                <span v-else>{{ row.quotedPrice || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Total (Tax Included)" width="140">
              <template #default="{ row }">
                <el-input-number v-if="editingOrderItemId === row.id" v-model="orderItemEditForm.taxIncludedTotal" class="full-width" :min="0" :precision="2" />
                <span v-else>{{ row.taxIncludedTotal || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Requesting Department / Applicant" min-width="180">
              <template #default="{ row }">
                <el-input v-if="editingOrderItemId === row.id" v-model.trim="orderItemEditForm.applicantDepartment" />
                <span v-else>{{ row.applicantDepartment || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Material Status" width="150">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.currentStatus)">
                  {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Award Details" min-width="170">
              <template #default="{ row }">
                <span v-if="row.bidResult === 'WON'">Won {{ row.winningAmount || '-' }}</span>
                <span v-else-if="row.bidResult === 'LOST'">Lost: {{ row.lostReason || '-' }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="Actions" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="editingOrderItemId === row.id">
                  <el-button type="primary" link :loading="orderItemEditSaving" @click="handleSaveOrderItemBasicInfo(row)">Save</el-button>
                  <el-button link @click="cancelOrderItemEdit">Cancel</el-button>
                </template>
                <el-button v-else type="primary" link @click="startOrderItemEdit(row)">Edit</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane v-if="false" label="Supplier Quote" name="quotes">
          <el-table :data="order?.items || []" class="data-table" border>
            <el-table-column type="expand">
              <template #default="{ row }">
                <section class="item-detail-panel">
                  <el-form class="business-form" label-position="top" @submit.prevent>
                    <el-form-item label="Supplier Name">
                      <el-input v-model.trim="itemBusinessForms[row.id].quote.supplierName" />
                    </el-form-item>
                    <el-form-item label="Contact">
                      <el-input v-model.trim="itemBusinessForms[row.id].quote.contactName" />
                    </el-form-item>
                    <el-form-item label="Phone">
                      <el-input v-model.trim="itemBusinessForms[row.id].quote.phone" />
                    </el-form-item>
                    <el-form-item label="Quote">
                      <el-input-number v-model="itemBusinessForms[row.id].quote.quotedPrice" class="full-width" :min="0" :precision="2" />
                    </el-form-item>
                    <el-form-item label="Lead Time">
                      <el-input v-model.trim="itemBusinessForms[row.id].quote.deliveryTime" />
                    </el-form-item>
                    <el-form-item label="Quote File">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="itemBusinessForms[row.id].quoteFiles"
                        :on-change="getItemFileListChangeHandler(row.id, 'quoteFiles')"
                        :on-remove="getItemFileListChangeHandler(row.id, 'quoteFiles')"
                        :accept="acceptedFileTypes"
                      >
                        <el-button>Select File</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-form-item label="Selected">
                      <el-select v-model="itemBusinessForms[row.id].quote.isSelected" class="full-width">
                        <el-option label="Selected" :value="true" />
                        <el-option label="Not Selected" :value="false" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="Notes" class="business-form-wide">
                      <el-input v-model.trim="itemBusinessForms[row.id].quote.remark" type="textarea" :rows="2" />
                    </el-form-item>
                    <div class="business-form-actions">
                      <el-button type="primary" :loading="businessSubmittingId === row.id" @click="handleSaveItemQuote(row)">
                        Save Quote
                      </el-button>
                    </div>
                  </el-form>

                  <el-table :data="row.supplierQuotes" class="data-table nested-table" border>
                    <el-table-column label="Supplier" min-width="160">
                      <template #default="{ row: quote }">{{ quote.supplier.name }}</template>
                    </el-table-column>
                    <el-table-column label="Contact" prop="contactName" width="120" />
                    <el-table-column label="Phone" prop="phone" width="140" />
                    <el-table-column label="Quote" prop="quotedPrice" width="120" />
                    <el-table-column label="Lead Time" prop="deliveryTime" width="120" />
                    <el-table-column label="Selected" width="90">
                      <template #default="{ row: quote }">
                        <el-select
                          :model-value="quote.isSelected"
                          class="quote-selection-select"
                          :loading="quoteSelectingId === quote.id"
                          @change="(value: boolean) => handleQuoteSelectionChange(row, quote, value)"
                        >
                          <el-option label="Selected" :value="true" />
                          <el-option label="Not Selected" :value="false" />
                        </el-select>
                      </template>
                    </el-table-column>
                    <el-table-column label="Quote File" min-width="160">
                      <template #default="{ row: quote }">{{ quote.quoteFile?.originalName || '-' }}</template>
                    </el-table-column>
                    <el-table-column label="Notes" prop="remark" min-width="180" />
                  </el-table>
                </section>
              </template>
            </el-table-column>
            <el-table-column label="No." prop="lineNo" width="70" align="center" />
            <el-table-column label="Material Code" min-width="150">
              <template #default="{ row }">
                <el-input v-if="editingPurchaseItemId === row.id" v-model.trim="purchaseItemEditForm.materialCode" />
                <span v-else>{{ row.materialCode || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Material Description" min-width="240">
              <template #default="{ row }">
                <el-input v-if="editingPurchaseItemId === row.id" v-model.trim="purchaseItemEditForm.materialDescription" />
                <span v-else>{{ row.materialDescription || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Current Status" width="140">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.currentStatus)">
                  {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Quote Count" width="100">
              <template #default="{ row }">{{ row.supplierQuotes.length }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane v-if="false" label="Order Processing" name="processing">
          <section class="next-action-panel">
            <h2>Order Processing</h2>
            <el-table :data="order?.items || []" class="data-table" border>
              <el-table-column type="expand">
                <template #default="{ row }">
                  <section class="item-flow-panel">
                    <h3>{{ getFlowFormTitle(row) }}</h3>

                    <el-form v-if="row.currentStatus === 'INQUIRY'" class="business-form" label-position="top" @submit.prevent>
                      <el-form-item label="Supplier Name">
                        <el-input v-model.trim="itemBusinessForms[row.id].quote.supplierName" />
                      </el-form-item>
                      <el-form-item label="Contact">
                        <el-input v-model.trim="itemBusinessForms[row.id].quote.contactName" />
                      </el-form-item>
                      <el-form-item label="Phone">
                        <el-input v-model.trim="itemBusinessForms[row.id].quote.phone" />
                      </el-form-item>
                      <el-form-item label="Quote">
                        <el-input-number v-model="itemBusinessForms[row.id].quote.quotedPrice" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <el-form-item label="Lead Time">
                        <el-input v-model.trim="itemBusinessForms[row.id].quote.deliveryTime" />
                      </el-form-item>
                      <el-form-item label="Quote File">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].quoteFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'quoteFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'quoteFiles')"
                          :accept="acceptedFileTypes"
                        >
                          <el-button>Select File</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Selected">
                        <el-select v-model="itemBusinessForms[row.id].quote.isSelected" class="full-width">
                          <el-option label="Selected" :value="true" />
                          <el-option label="Not Selected" :value="false" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="Notes" class="business-form-wide">
                        <el-input v-model.trim="itemBusinessForms[row.id].quote.remark" type="textarea" :rows="2" />
                      </el-form-item>
                    </el-form>

                    <el-form v-else-if="row.currentStatus === 'QUOTED'" class="business-form" label-position="top" @submit.prevent>
                      <el-form-item label="Bid Price">
                        <el-input-number v-model="itemBusinessForms[row.id].quote.quotedPrice" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <template v-if="itemStatusForms[row.id]?.status === 'BID_WON'">
                        <el-form-item label="Award Amount">
                          <el-input-number v-model="itemStatusForms[row.id].winningPrice" class="full-width" :min="0" :precision="2" />
                        </el-form-item>
                        <el-form-item label="Awarded Contract PDF">
                          <el-upload
                            :auto-upload="false"
                            :limit="1"
                            :file-list="itemBusinessForms[row.id].winningContractFiles"
                            :on-change="getItemFileListChangeHandler(row.id, 'winningContractFiles')"
                            :on-remove="getItemFileListChangeHandler(row.id, 'winningContractFiles')"
                            accept=".pdf"
                          >
                            <el-button>Select PDF</el-button>
                          </el-upload>
                        </el-form-item>
                      </template>
                      <el-form-item v-if="itemStatusForms[row.id]?.status === 'BID_LOST'" label="Reason Lost" class="business-form-wide">
                        <el-input v-model.trim="itemStatusForms[row.id].lostReason" type="textarea" :rows="2" />
                      </el-form-item>
                    </el-form>

                    <el-form
                      v-else-if="row.currentStatus === 'BID_WON' || row.currentStatus === 'BID_LOST'"
                      class="business-form"
                      label-position="top"
                      @submit.prevent
                    >
                      <el-form-item label="Award Amount">
                        <el-input-number v-model="itemStatusForms[row.id].winningPrice" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <el-form-item label="Awarded Contract PDF">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].winningContractFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'winningContractFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'winningContractFiles')"
                          accept=".pdf"
                        >
                          <el-button>Select PDF</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Reason Lost" class="business-form-wide">
                        <el-input v-model.trim="itemStatusForms[row.id].lostReason" type="textarea" :rows="2" />
                      </el-form-item>
                    </el-form>

                    <el-form
                      v-else-if="row.currentStatus === 'PURCHASING' || row.currentStatus === 'PURCHASE_PAYMENT'"
                      class="business-form"
                      label-position="top"
                      @submit.prevent
                    >
                      <el-form-item label="Purchase Cost">
                        <el-input-number v-model="itemBusinessForms[row.id].purchase.purchaseCost" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <el-form-item label="Purchase Manufacturer">
                        <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierName" />
                      </el-form-item>
                      <el-form-item label="Purchase Contract File">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].purchaseContractFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'purchaseContractFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'purchaseContractFiles')"
                          :accept="acceptedFileTypes"
                        >
                          <el-button>Select File</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Payment Request File">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].paymentApplicationFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'paymentApplicationFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'paymentApplicationFiles')"
                          :accept="acceptedFileTypes"
                        >
                          <el-button>Select File</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Advance Payment Amount">
                        <el-input-number v-model="itemBusinessForms[row.id].purchase.advancePaymentAmount" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <el-form-item label="Advance Payment Status">
                        <el-select v-model="itemBusinessForms[row.id].purchase.advancePaymentStatus" class="full-width">
                          <el-option label="Unpaid" value="UNPAID" />
                          <el-option label="Paid" value="PAID" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="Arrival Payment Amount">
                        <el-input-number v-model="itemBusinessForms[row.id].purchase.arrivalPaymentAmount" class="full-width" :min="0" :precision="2" />
                      </el-form-item>
                      <el-form-item label="Arrival Payment Status">
                        <el-select v-model="itemBusinessForms[row.id].purchase.arrivalPaymentStatus" class="full-width">
                          <el-option label="Unpaid" value="UNPAID" />
                          <el-option label="Paid" value="PAID" />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="Supplier Carrier">
                        <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierLogisticsCompany" />
                      </el-form-item>
                      <el-form-item label="Supplier Tracking Number">
                        <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierLogisticsNo" />
                      </el-form-item>
                      <el-form-item label="Invoice Status">
                        <el-select v-model="itemBusinessForms[row.id].purchase.invoiceStatus" class="full-width">
                          <el-option label="Not Issued" value="NOT_RECEIVED" />
                          <el-option label="Issued" value="ISSUED" />
                        </el-select>
                      </el-form-item>
                    </el-form>

                    <el-form
                      v-else-if="['SUPPLIER_SHIPPED', 'ARRIVED_COMPANY', 'SHIPPED_TO_CUSTOMER'].includes(row.currentStatus)"
                      class="business-form"
                      label-position="top"
                      @submit.prevent
                    >
                      <el-form-item label="Product Images">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].productPhotoFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'productPhotoFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'productPhotoFiles')"
                          accept=".jpg,.jpeg,.png,.gif,.webp"
                        >
                          <el-button>Select Image</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Shipping Images">
                        <el-upload
                          :auto-upload="false"
                          :limit="1"
                          :file-list="itemBusinessForms[row.id].deliveryPhotoFiles"
                          :on-change="getItemFileListChangeHandler(row.id, 'deliveryPhotoFiles')"
                          :on-remove="getItemFileListChangeHandler(row.id, 'deliveryPhotoFiles')"
                          accept=".jpg,.jpeg,.png,.gif,.webp"
                        >
                          <el-button>Select Image</el-button>
                        </el-upload>
                      </el-form-item>
                      <el-form-item label="Customer Carrier">
                        <el-input v-model.trim="itemBusinessForms[row.id].delivery.buyerLogisticsCompany" />
                      </el-form-item>
                      <el-form-item label="Customer Tracking Number">
                        <el-input v-model.trim="itemBusinessForms[row.id].delivery.buyerLogisticsNo" />
                      </el-form-item>
                    </el-form>

                    <el-empty v-else description="No details are required at this stage" />
                  </section>
                </template>
              </el-table-column>
              <el-table-column label="No." prop="lineNo" width="70" align="center" />
              <el-table-column label="Material Code" prop="materialCode" width="130" />
              <el-table-column label="Material Description" prop="materialDescription" min-width="180" />
              <el-table-column label="Current Status" width="150">
                <template #default="{ row }">
                  <el-tag :type="getStatusTagType(row.currentStatus)">
                    {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Next Step" min-width="440">
                <template #default="{ row }">
                  <div v-if="itemStatusForms[row.id] && getItemNextStatusOptions(row).length" class="item-status-action">
                    <el-select v-model="itemStatusForms[row.id].status" class="item-status-select" placeholder="Next Status">
                      <el-option
                        v-for="option in getItemNextStatusOptions(row)"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-select>
                    <el-input
                      v-model.trim="itemStatusForms[row.id].note"
                      class="item-status-note"
                      placeholder="Notes"
                    />
                    <el-button
                      type="primary"
                      :loading="itemStatusSubmittingId === row.id"
                      @click="handleItemStatusSubmit(row)"
                    >
                      Update Status
                    </el-button>
                  </div>
                  <el-tag v-else-if="row.currentStatus === 'ARRIVED_COMPANY'" type="warning">Awaiting Management Approval</el-tag>
                  <el-tag v-else type="info">No Next Step</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <h2 class="detail-title">Status History</h2>
          <el-table :data="order?.itemStatusRecords || []" class="data-table" border>
            <el-table-column label="Material" min-width="220">
              <template #default="{ row }">
                {{ row.orderItem.lineNo }}. {{ row.orderItem.materialCode || row.orderItem.materialDescription || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="Previous Status" width="150">
              <template #default="{ row }">
                {{ row.fromStatus ? ORDER_STATUS_TEXT[row.fromStatus] || row.fromStatus : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="New Status" width="150">
              <template #default="{ row }">{{ ORDER_STATUS_TEXT[row.toStatus] || row.toStatus }}</template>
            </el-table-column>
            <el-table-column label="Operator" width="140">
              <template #default="{ row }">{{ row.operator.realName || row.operator.username }}</template>
            </el-table-column>
            <el-table-column label="Time" width="180">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="Notes" prop="note" min-width="220" />
          </el-table>

        </el-tab-pane>

        <el-tab-pane v-if="!isLostOrder" label="Purchase Details" name="purchase">
          <section v-if="batchPurchaseEligibleItems.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Grouped Purchase Request</h2>
                <p>Select materials being purchased below to group them into a purchase package. Payment requests are submitted for the whole order.</p>
              </div>
              <el-tag type="info">Selected {{ batchPurchaseSelection.length }}  items</el-tag>
            </div>

            <el-form class="business-form" label-position="top" @submit.prevent>
              <el-form-item label="Purchase Cost">
                <el-input-number v-model="batchPurchaseForm.purchaseCost" class="full-width" :min="0" :precision="2" />
              </el-form-item>
              <el-form-item label="Purchase Manufacturer">
                <el-input v-model.trim="batchPurchaseForm.supplierName" />
              </el-form-item>
              <el-form-item label="Delivery Date">
                <el-input v-model.trim="batchPurchaseForm.deliveryTime" />
              </el-form-item>
              <el-form-item label="Purchase Contract File" class="batch-purchase-upload-item">
                <el-upload
                  :auto-upload="false"
                  :limit="1"
                  :file-list="batchPurchaseForm.purchaseContractFiles"
                  :on-change="handleBatchPurchaseFileListChange"
                  :on-remove="handleBatchPurchaseFileListChange"
                  :accept="acceptedFileTypes"
                >
                  <el-button>Select File</el-button>
                </el-upload>
              </el-form-item>
              <div class="business-form-actions batch-purchase-actions">
                <el-button
                  :loading="batchPurchasePricingSaving"
                  @click="handleSavePurchasePricing"
                >
                  Save
                </el-button>
                <el-button
                  type="primary"
                  :loading="batchPurchaseSubmitting"
                  @click="handleBatchPurchaseSubmit"
                >
                  Submit Grouped Purchase Request
                </el-button>
              </div>
            </el-form>
          </section>

          <section v-if="purchaseBatches.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Purchase Package</h2>
                <p>Materials in a package are reviewed and shipped together.</p>
              </div>
            </div>
            <el-table :data="purchaseBatches" class="data-table" border>
              <el-table-column label="Purchase Manufacturer" min-width="160">
                <template #default="{ row }">
                  <el-input v-if="editingPurchaseBatchId === row.id" v-model.trim="purchaseBatchEditForm.supplierName" />
                  <span v-else>{{ row.supplierName || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Purchase Cost" width="130">
                <template #default="{ row }">
                  <el-input-number
                    v-if="editingPurchaseBatchId === row.id"
                    v-model="purchaseBatchEditForm.purchaseCost"
                    class="full-width"
                    :min="0"
                    :precision="2"
                  />
                  <span v-else>{{ row.purchaseCost || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Delivery Date" width="140">
                <template #default="{ row }">
                  <el-input v-if="editingPurchaseBatchId === row.id" v-model.trim="purchaseBatchEditForm.deliveryTime" />
                  <span v-else>{{ row.deliveryTime || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Material Description" min-width="280">
                <template #default="{ row }">
                  <el-select
                    v-if="editingPurchaseBatchId === row.id"
                    v-model="purchaseBatchEditForm.itemIds"
                    class="full-width"
                    multiple
                    filterable
                    collapse-tags
                    collapse-tags-tooltip
                    placeholder="Select materials for the purchase package"
                  >
                    <el-option
                      v-for="item in getPurchaseBatchItemOptions(row)"
                      :key="item.id"
                      :label="formatPurchaseBatchItemOption(item)"
                      :value="item.id"
                    />
                  </el-select>
                  <span v-else>{{ formatPurchaseBatchItems(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Contract" min-width="160">
                <template #default="{ row }">
                  <div class="contract-file-cell">
                    <div v-if="getBatchPurchaseContractFiles(row).length" class="contract-file-list">
                      <div v-for="file in getBatchPurchaseContractFiles(row)" :key="file.id" class="contract-file-row">
                        <span>{{ file.originalName }}</span>
                        <div class="inline-actions">
                          <el-button type="primary" link :loading="downloadingFileId === file.id" @click="handleDownloadOrderFile(file)">
                            Download
                          </el-button>
                          <el-button type="danger" link :loading="deletingFileId === file.id" @click="handleDeleteOrderFile(file, 'Purchase Contract')">
                            Delete
                          </el-button>
                        </div>
                      </div>
                    </div>
                    <span v-else>No contracts</span>
                    <el-upload
                      :auto-upload="false"
                      multiple
                      :file-list="batchContractForms[row.id]?.selectedFiles || []"
                      :on-change="getBatchContractListChangeHandler(row.id)"
                      :on-remove="getBatchContractListChangeHandler(row.id)"
                      :accept="acceptedFileTypes"
                    >
                      <el-button size="small">Select Contract</el-button>
                    </el-upload>
                    <el-button
                      type="primary"
                      link
                      :loading="contractUploadingBatchId === row.id"
                      :disabled="!(batchContractForms[row.id]?.selectedFiles || []).length"
                      @click="handleUploadBatchContracts(row)"
                    >
                      Upload Contract
                    </el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="Actions" width="150" fixed="right">
                <template #default="{ row }">
                  <template v-if="editingPurchaseBatchId === row.id">
                    <el-button type="primary" link :loading="purchaseBatchEditSaving" @click="handleSavePurchaseBatchBasicInfo(row)">
                      Save
                    </el-button>
                    <el-button link @click="cancelPurchaseBatchEdit">Cancel</el-button>
                  </template>
                  <el-button v-else type="primary" link @click="startPurchaseBatchEdit(row)">Edit</el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <el-table
            ref="purchaseTableRef"
            :data="order.items"
            class="data-table"
            border
            @selection-change="handleBatchPurchaseSelectionChange"
          >
            <el-table-column type="selection" width="48" :selectable="isBatchPurchaseSelectable" />
            <el-table-column type="expand">
              <template #default="{ row }">
                <section class="item-detail-panel">
                  <el-descriptions v-if="row.purchaseInfo" class="detail-block" :column="2" border>
                    <el-descriptions-item label="Purchase Cost">{{ row.purchaseInfo.purchaseCost }}</el-descriptions-item>
                    <el-descriptions-item label="Purchase Manufacturer">{{ row.purchaseInfo.supplierName || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Delivery Date">{{ row.purchaseInfo.deliveryTime || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Advance Payment Amount">{{ row.purchaseInfo.advancePaymentAmount }}</el-descriptions-item>
                    <el-descriptions-item label="Advance Payment Status">{{ PAYMENT_STATUS_TEXT[row.purchaseInfo.advancePaymentStatus] }}</el-descriptions-item>
                    <el-descriptions-item label="Arrival Payment Amount">{{ row.purchaseInfo.arrivalPaymentAmount }}</el-descriptions-item>
                    <el-descriptions-item label="Arrival Payment Status">{{ PAYMENT_STATUS_TEXT[row.purchaseInfo.arrivalPaymentStatus] }}</el-descriptions-item>
                    <el-descriptions-item label="Supplier Carrier">{{ row.purchaseInfo.supplierLogisticsCompany || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Supplier Tracking Number">{{ row.purchaseInfo.supplierTrackingNo || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Invoice Status">{{ INVOICE_STATUS_TEXT[row.purchaseInfo.invoiceStatus] }}</el-descriptions-item>
                    <el-descriptions-item label="Purchase Contract">{{ row.purchaseInfo.purchaseContractFile?.originalName || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Payment Request">{{ row.purchaseInfo.paymentApplicationFile?.originalName || '-' }}</el-descriptions-item>
                  </el-descriptions>
                  <el-empty v-else description="No purchase details for this material" />

                  <el-form class="business-form" label-position="top" @submit.prevent>
                    <el-form-item label="Purchase Cost">
                      <el-input-number v-model="itemBusinessForms[row.id].purchase.purchaseCost" class="full-width" :min="0" :precision="2" />
                    </el-form-item>
                    <el-form-item label="Purchase Manufacturer">
                      <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierName" />
                    </el-form-item>
                    <el-form-item label="Delivery Date">
                      <el-input v-model.trim="itemBusinessForms[row.id].purchase.deliveryTime" />
                    </el-form-item>
                    <el-form-item label="Purchase Contract File">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="itemBusinessForms[row.id].purchaseContractFiles"
                        :on-change="getItemFileListChangeHandler(row.id, 'purchaseContractFiles')"
                        :on-remove="getItemFileListChangeHandler(row.id, 'purchaseContractFiles')"
                        :accept="acceptedFileTypes"
                      >
                        <el-button>Select File</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-form-item label="Payment Request File">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="itemBusinessForms[row.id].paymentApplicationFiles"
                        :on-change="getItemFileListChangeHandler(row.id, 'paymentApplicationFiles')"
                        :on-remove="getItemFileListChangeHandler(row.id, 'paymentApplicationFiles')"
                        :accept="acceptedFileTypes"
                      >
                        <el-button>Select File</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-form-item label="Advance Payment Amount">
                      <el-input-number v-model="itemBusinessForms[row.id].purchase.advancePaymentAmount" class="full-width" :min="0" :precision="2" />
                    </el-form-item>
                    <el-form-item label="Advance Payment Status">
                      <el-select v-model="itemBusinessForms[row.id].purchase.advancePaymentStatus" class="full-width">
                        <el-option label="Unpaid" value="UNPAID" />
                        <el-option label="Paid" value="PAID" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="Arrival Payment Amount">
                      <el-input-number v-model="itemBusinessForms[row.id].purchase.arrivalPaymentAmount" class="full-width" :min="0" :precision="2" />
                    </el-form-item>
                    <el-form-item label="Arrival Payment Status">
                      <el-select v-model="itemBusinessForms[row.id].purchase.arrivalPaymentStatus" class="full-width">
                        <el-option label="Unpaid" value="UNPAID" />
                        <el-option label="Paid" value="PAID" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="Supplier Carrier">
                      <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierLogisticsCompany" />
                    </el-form-item>
                    <el-form-item label="Supplier Tracking Number">
                      <el-input v-model.trim="itemBusinessForms[row.id].purchase.supplierLogisticsNo" />
                    </el-form-item>
                    <el-form-item label="Invoice Status">
                      <el-select v-model="itemBusinessForms[row.id].purchase.invoiceStatus" class="full-width">
                        <el-option label="Not Issued" value="NOT_RECEIVED" />
                        <el-option label="Issued" value="ISSUED" />
                      </el-select>
                    </el-form-item>
                    <div class="business-form-actions">
                      <el-button
                        v-if="row.currentStatus === 'PURCHASING'"
                        type="primary"
                        :loading="businessSubmittingId === row.id"
                        @click="handleSaveItemPurchase(row, 'PURCHASE_PAYMENT')"
                      >
                        Save and Request Payment
                      </el-button>
                      <el-button
                        v-else-if="row.currentStatus === 'PURCHASE_PAYMENT' && canManageOrders"
                        type="success"
                        :loading="itemStatusSubmittingId === row.id"
                        @click="handleApproveItemStatus(row, 'SHIPPED_TO_CUSTOMER', 'Payment request approved')"
                      >
                        Approve Payment Request
                      </el-button>
                      <el-tag v-else-if="row.currentStatus === 'PURCHASE_PAYMENT'" type="warning">
                        Awaiting Payment Approval
                      </el-tag>
                      <el-tag v-else type="info">
                        {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                      </el-tag>
                    </div>
                  </el-form>
                </section>
              </template>
            </el-table-column>
            <el-table-column label="No." prop="lineNo" width="70" align="center" />
            <el-table-column label="Material Code" min-width="140">
              <template #default="{ row }">
                <el-input v-if="editingPurchaseItemId === row.id" v-model.trim="purchaseItemEditForm.materialCode" />
                <span v-else>{{ row.materialCode || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Material Description" min-width="220">
              <template #default="{ row }">
                <el-input v-if="editingPurchaseItemId === row.id" v-model.trim="purchaseItemEditForm.materialDescription" />
                <span v-else>{{ row.materialDescription || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Current Stage" width="170">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.currentStatus)">
                  {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Purchase Quantity" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-if="editingPurchaseItemId === row.id"
                  :model-value="purchaseItemEditForm.purchaseQuantity"
                  class="full-width"
                  :min="0"
                  :precision="3"
                  @update:model-value="updatePackedPurchaseQuantity"
                />
                <el-input-number
                  v-else-if="isDirectPurchasePricingEditable(row)"
                  :model-value="purchasePricingDrafts[row.id]?.purchaseQuantity"
                  class="full-width"
                  :min="0"
                  :precision="3"
                  @update:model-value="updatePurchaseQuantity(row.id, $event)"
                />
                <span v-else>{{ row.purchaseQuantity || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Purchase Unit Price" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-if="editingPurchaseItemId === row.id"
                  :model-value="purchaseItemEditForm.purchaseUnitPrice"
                  class="full-width"
                  :min="0"
                  :precision="2"
                  @update:model-value="updatePackedPurchaseUnitPrice"
                />
                <el-input-number
                  v-else-if="isDirectPurchasePricingEditable(row)"
                  :model-value="purchasePricingDrafts[row.id]?.purchaseUnitPrice"
                  class="full-width"
                  :min="0"
                  :precision="2"
                  @update:model-value="updatePurchaseUnitPrice(row.id, $event)"
                />
                <span v-else>{{ row.purchaseUnitPrice || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Purchase Total" width="160">
              <template #default="{ row }">
                <el-input-number
                  v-if="editingPurchaseItemId === row.id"
                  v-model="purchaseItemEditForm.purchaseTotal"
                  class="full-width"
                  :min="0"
                  :precision="2"
                />
                <el-input-number
                  v-else-if="isDirectPurchasePricingEditable(row)"
                  v-model="purchasePricingDrafts[row.id].purchaseTotal"
                  class="full-width"
                  :min="0"
                  :precision="2"
                  @change="recalculateSelectedPurchaseCost"
                />
                <span v-else>{{ row.purchaseTotal || row.purchaseInfo?.purchaseCost || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Purchase Manufacturer" min-width="140">
              <template #default="{ row }">
                {{ row.purchaseBatch?.supplierName || row.purchaseInfo?.supplierName || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="Delivery Date" min-width="120">
              <template #default="{ row }">
                {{ row.purchaseBatch?.deliveryTime || row.purchaseInfo?.deliveryTime || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="Advance Payment" width="120">
              <template #default="{ row }">{{ row.purchaseInfo ? PAYMENT_STATUS_TEXT[row.purchaseInfo.advancePaymentStatus] : '-' }}</template>
            </el-table-column>
            <el-table-column label="Arrival Payment" width="120">
              <template #default="{ row }">{{ row.purchaseInfo ? PAYMENT_STATUS_TEXT[row.purchaseInfo.arrivalPaymentStatus] : '-' }}</template>
            </el-table-column>
            <el-table-column label="Invoice" width="120">
              <template #default="{ row }">{{ row.purchaseInfo ? INVOICE_STATUS_TEXT[row.purchaseInfo.invoiceStatus] : '-' }}</template>
            </el-table-column>
            <el-table-column label="Actions" width="150" fixed="right">
              <template #default="{ row }">
                <template v-if="editingPurchaseItemId === row.id">
                  <el-button type="primary" link :loading="purchaseItemEditSaving" @click="handleSavePurchaseItemInfo(row)">Save</el-button>
                  <el-button link @click="cancelPurchaseItemEdit">Cancel</el-button>
                </template>
                <el-button v-else-if="!isDirectPurchasePricingEditable(row)" type="primary" link @click="startPurchaseItemEdit(row)">Edit</el-button>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane v-if="!isLostOrder" label="Payment Request" name="payment">
          <section v-if="paymentApplicationBatches.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Payment Request</h2>
                <p>Select purchase packages to combine their requested amounts into one payment request.</p>
              </div>
            </div>

            <el-table
              ref="paymentApplicationTableRef"
              :data="paymentApplicationBatches"
              class="data-table"
              border
              @selection-change="handlePaymentApplicationSelectionChange"
            >
              <el-table-column type="selection" width="48" :selectable="canSelectPaymentApplicationBatch" />
              <el-table-column type="expand" width="48">
                <template #default="{ row }">
                  <el-table :data="row.batchItems || []" class="data-table nested-table" border>
                    <el-table-column label="No." prop="lineNo" width="80" align="center" />
                    <el-table-column label="Material Code" prop="materialCode" min-width="140" />
                    <el-table-column label="Material Description" prop="materialDescription" min-width="260" />
                    <el-table-column label="Current Stage" width="150">
                      <template #default="{ row: item }">{{ ORDER_STATUS_TEXT[item.currentStatus] || item.currentStatus }}</template>
                    </el-table-column>
                  </el-table>
                </template>
              </el-table-column>
              <el-table-column label="Purchase Manufacturer" min-width="140">
                <template #default="{ row }">{{ row.supplierName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Material" width="90">
                <template #default="{ row }">{{ row.batchItems?.length || 0 }}  items</template>
              </el-table-column>
              <el-table-column label="Purchase Cost" width="130">
                <template #default="{ row }">{{ formatMoney(row.purchaseCost) }}</template>
              </el-table-column>
              <el-table-column label="Payment Percentage" width="110">
                <template #default="{ row }">{{ row.paymentPercent ? `${row.paymentPercent}%` : '-' }}</template>
              </el-table-column>
              <el-table-column label="Review Status" width="170">
                <template #default="{ row }">
                  <el-tag :type="getPaymentReviewStatus(row).type" effect="plain">
                    {{ getPaymentReviewStatus(row).text }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Approved Percentage" width="120">
                <template #default="{ row }">{{ formatPercent(getApprovedPaymentPercent(row)) }}</template>
              </el-table-column>
              <el-table-column label="Remaining Requestable Amount" width="120">
                <template #default="{ row }">{{ formatPercent(getRemainingPaymentPercent(row)) }}</template>
              </el-table-column>
              <el-table-column label="Approved Advance" width="140">
                <template #default="{ row }">{{ formatMoney(getApprovedAdvancePaymentAmount(row)) }}</template>
              </el-table-column>
              <el-table-column label="Advance Requested" width="130">
                <template #default="{ row }">{{ formatMoney(row.advancePaymentAmount) }}</template>
              </el-table-column>
              <el-table-column label="Balance Requested" width="130">
                <template #default="{ row }">{{ formatMoney(row.arrivalPaymentAmount) }}</template>
              </el-table-column>
              <el-table-column label="Bank" min-width="140">
                <template #default="{ row }">{{ row.bankName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Account Number" min-width="140">
                <template #default="{ row }">{{ row.bankAccount || '-' }}</template>
              </el-table-column>
              <el-table-column label="Notes" min-width="130">
                <template #default="{ row }">{{ formatPaymentRemark(row) }}</template>
              </el-table-column>
              <el-table-column label="Actions" width="160" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-if="canApprovePurchaseBatch(row)"
                    type="success"
                    link
                    :loading="approvingPurchaseBatchId === row.id"
                    @click="handleApprovePurchaseBatch(row.id)"
                  >
                    Approved
                  </el-button>
                  <el-button
                    v-if="canApprovePurchaseBatch(row)"
                    type="danger"
                    link
                    :loading="rejectingPurchaseBatchId === row.id"
                    @click="handleRejectPurchaseBatch(row.id)"
                  >
                    Reject
                  </el-button>
                  <span v-if="!canApprovePurchaseBatch(row)">-</span>
                </template>
              </el-table-column>
            </el-table>

            <el-form class="business-form" label-position="top" @submit.prevent>
              <el-form-item label="Purchase Amount Requested">
                <el-input :model-value="formatMoney(selectedPaymentTotalCost)" disabled />
              </el-form-item>
              <el-form-item label="Payment Percentage">
                <el-input-number v-model="paymentApplicationForm.paymentPercent" class="full-width" :min="0" :max="100" :precision="2" />
              </el-form-item>
              <el-form-item label="Approved Advance Amount">
                <el-input :model-value="formatMoney(selectedApprovedAdvancePaymentAmount)" disabled />
              </el-form-item>
              <el-form-item label="Advance Amount Requested">
                <el-input-number v-model="paymentApplicationForm.advancePaymentAmount" class="full-width" :min="0" :precision="2" />
              </el-form-item>
              <el-form-item label="Balance Amount Requested">
                <el-input-number v-model="paymentApplicationForm.arrivalPaymentAmount" class="full-width" :min="0" :precision="2" />
              </el-form-item>
              <el-form-item label="Bank">
                <el-input v-model.trim="paymentApplicationForm.bankName" />
              </el-form-item>
              <el-form-item label="Account Number">
                <el-input v-model.trim="paymentApplicationForm.bankAccount" />
              </el-form-item>
              <el-form-item label="Notes">
                <el-input v-model.trim="paymentApplicationForm.remark" />
              </el-form-item>
              <div class="business-form-actions">
                <el-button type="primary" :loading="paymentApplicationSubmitting" @click="handleSavePaymentApplication">
                  Submit Selected Payment Request
                </el-button>
                <el-button :loading="exportingPaymentApplication" :disabled="!canExportPaymentApplication" @click="handleExportPaymentApplication">
                  Export Pending Payment Requests to Excel
                </el-button>
              </div>
            </el-form>
          </section>
          <section v-else-if="allPaymentApplicationsCompleted" class="next-action-panel payment-complete-panel">
            <div class="payment-complete-summary">
              <el-icon class="payment-complete-summary-icon">
                <CircleCheckFilled />
              </el-icon>
              <div>
                <h2>This order is fully paid</h2>
                <p>Payments completed: {{ completedPaymentSummaries.length }}  items; total: {{ formatMoney(completedPaymentTotalAmount) }}</p>
              </div>
            </div>

            <el-table
              v-if="completedPaymentSummaries.length"
              :data="completedPaymentSummaries"
              class="data-table"
              border
            >
              <el-table-column label="No." type="index" width="70" align="center" />
              <el-table-column label="Purchase Manufacturer" min-width="170">
                <template #default="{ row }">{{ row.supplierName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Advance Payment Amount" width="140">
                <template #default="{ row }">{{ formatOptionalMoney(row.advancePaymentAmount) }}</template>
              </el-table-column>
              <el-table-column label="Advance Payment Date" width="180">
                <template #default="{ row }">{{ row.advancePaymentTime ? formatDateTime(row.advancePaymentTime) : '--' }}</template>
              </el-table-column>
              <el-table-column label="Balance Amount" width="140">
                <template #default="{ row }">{{ formatOptionalMoney(row.arrivalPaymentAmount) }}</template>
              </el-table-column>
              <el-table-column label="Balance Payment Date" width="180">
                <template #default="{ row }">{{ row.arrivalPaymentTime ? formatDateTime(row.arrivalPaymentTime) : '--' }}</template>
              </el-table-column>
              <el-table-column label="Total Paid" width="140">
                <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
              </el-table-column>
              <el-table-column label="Notes" min-width="170">
                <template #default="{ row }">{{ row.remarks.length ? row.remarks.join('; ') : '-' }}</template>
              </el-table-column>
            </el-table>
          </section>
          <el-empty v-else :description="paymentApplicationEmptyText" />
        </el-tab-pane>

        <el-tab-pane v-if="!isLostOrder" label="Shipping Details" name="shipping">
          <section v-if="shippingBatches.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Package Shipping Request</h2>
                <p>After approval, enter shipping details for the same purchase package.</p>
              </div>
            </div>

            <el-form class="business-form" label-position="top" @submit.prevent>
              <el-form-item label="Select Purchase Package" class="business-form-wide">
                <el-table
                  ref="shippingBatchTableRef"
                  :data="shippingBatches"
                  class="data-table"
                  border
                  @selection-change="handleShippingBatchSelectionChange"
                >
                  <el-table-column type="selection" width="48" />
                  <el-table-column label="Purchase Manufacturer" min-width="180">
                    <template #default="{ row }">{{ row.supplierName || '-' }}</template>
                  </el-table-column>
                  <el-table-column label="Package Materials" min-width="420">
                    <template #default="{ row }">{{ formatPurchaseBatchItems(row) }}</template>
                  </el-table-column>
                </el-table>
              </el-form-item>
              <el-form-item label="Shipping Approval Excel">
                <el-upload
                  :auto-upload="false"
                  :limit="1"
                  :file-list="batchShippingForm.shippingApplicationFiles"
                  :on-change="handleBatchShippingApplicationChange"
                  :on-remove="handleBatchShippingApplicationChange"
                  accept=".xls,.xlsx"
                >
                  <el-button>Select Excel</el-button>
                </el-upload>
              </el-form-item>
              <el-form-item label="Carrier">
                <el-input v-model.trim="batchShippingForm.logisticsCompany" placeholder="Read automatically from the uploaded Excel file; editable afterward" />
              </el-form-item>
              <el-form-item label="Tracking Number">
                <el-input v-model.trim="batchShippingForm.trackingNo" placeholder="Read automatically from the uploaded Excel file; editable afterward" />
              </el-form-item>
              <el-form-item label="Notes" class="business-form-wide">
                <el-input v-model.trim="batchShippingForm.remark" type="textarea" :rows="2" />
              </el-form-item>
              <div class="business-form-actions">
                <el-button type="primary" :loading="batchShippingSubmitting" @click="handleBatchShippingSubmit">
                  Submit Selected Shipping Request
                </el-button>
              </div>
            </el-form>
          </section>

          <section v-if="pendingGroupedShippingApplications.length || shippingApprovalBatches.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Shipping Approval</h2>
                <p>Purchase packages submitted together are approved or rejected as a group.</p>
              </div>
            </div>
            <el-table v-if="pendingGroupedShippingApplications.length" :data="pendingGroupedShippingApplications" class="data-table" border>
              <el-table-column label="Purchase Package" min-width="420">
                <template #default="{ row }">{{ formatGroupedShippingApplicationBatches(row) }}</template>
              </el-table-column>
              <el-table-column label="Carrier" width="150" prop="logisticsCompany" />
              <el-table-column label="Tracking Number" min-width="170" prop="trackingNo" />
              <el-table-column label="Shipping Approval Excel" min-width="180">
                <template #default="{ row }">
                  <el-button type="primary" link @click="handleDownloadOrderFile(row.file)">{{ row.file.originalName }}</el-button>
                </template>
              </el-table-column>
              <el-table-column label="Actions" width="180">
                <template #default="{ row }">
                  <template v-if="canManageOrders">
                    <el-button type="success" link :loading="approvingShippingApplicationId === row.id" @click="handleApproveGroupedShippingApplication(row.id)">All Approved</el-button>
                    <el-button type="danger" link :loading="rejectingShippingApplicationId === row.id" @click="handleRejectGroupedShippingApplication(row.id)">Reject</el-button>
                  </template>
                  <el-tag v-else type="warning">Awaiting Management Approval</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-table v-if="shippingApprovalBatches.length" :data="shippingApprovalBatches" class="data-table legacy-approval-table" border>
              <el-table-column label="Purchase Manufacturer" min-width="160">
                <template #default="{ row }">{{ row.supplierName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Material Description" min-width="280">
                <template #default="{ row }">{{ formatPurchaseBatchItems(row) }}</template>
              </el-table-column>
              <el-table-column label="Shipping Approval Excel" min-width="180">
                <template #default="{ row }">
                  <el-button
                    v-if="getBatchShippingApplicationFile(row)"
                    type="primary"
                    link
                    :loading="downloadingFileId === getBatchShippingApplicationFile(row)?.id"
                    @click="handleDownloadOrderFile(getBatchShippingApplicationFile(row)!)"
                  >
                    {{ getBatchShippingApplicationFile(row)?.originalName }}
                  </el-button>
                  <span v-else>-</span>
                </template>
              </el-table-column>
              <el-table-column label="Actions" width="150">
                <template #default="{ row }">
                  <el-button
                    v-if="canManageOrders"
                    type="success"
                    link
                    :loading="approvingShippingBatchId === row.id"
                    @click="handleApproveShippingBatch(row.id)"
                  >
                    Approve Selected Shipments
                  </el-button>
                  <el-tag v-else type="warning">Awaiting Management Approval</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <section v-if="rejectedGroupedShippingApplications.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Rejected Shipping Requests</h2>
                <p>Download the original workbook to verify it, or delete this request and resubmit with the correct purchase packages.</p>
              </div>
            </div>
            <el-table :data="rejectedGroupedShippingApplications" class="data-table" border>
              <el-table-column label="Purchase Package" min-width="420">
                <template #default="{ row }">{{ formatGroupedShippingApplicationBatches(row) }}</template>
              </el-table-column>
              <el-table-column label="Carrier" width="150" prop="logisticsCompany" />
              <el-table-column label="Tracking Number" min-width="170" prop="trackingNo" />
              <el-table-column label="Shipping Approval Excel" min-width="220">
                <template #default="{ row }">
                  <el-button type="primary" link @click="handleDownloadOrderFile(row.file)">Download</el-button>
                  <el-button
                    type="danger"
                    link
                    :loading="deletingFileId === row.file.id"
                    @click="handleDeleteOrderFile(row.file, 'Rejected Shipping Approval Excel')"
                  >
                    Delete
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <section v-if="approvedShippingRows.length" class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Approved Shipping Requests</h2>
                <p>Approved shipping requests remain available, including the originally uploaded approval workbook.</p>
              </div>
            </div>
            <el-table :data="approvedShippingRows" class="data-table" border>
              <el-table-column label="Purchase Manufacturer" min-width="170">
                <template #default="{ row }">{{ row.supplierName || '-' }}</template>
              </el-table-column>
              <el-table-column label="Buying Company" min-width="170">
                <template #default="{ row }">{{ row.buyerCompany || '-' }}</template>
              </el-table-column>
              <el-table-column label="Purchase Package" min-width="320">
                <template #default="{ row }">{{ row.purchasePackageText }}</template>
              </el-table-column>
              <el-table-column label="Carrier" min-width="150">
                <template #default="{ row }">{{ row.logisticsCompany || '-' }}</template>
              </el-table-column>
              <el-table-column label="Tracking Number" min-width="170">
                <template #default="{ row }">{{ row.trackingNo || '-' }}</template>
              </el-table-column>
              <el-table-column label="Reviewed At" width="180">
                <template #default="{ row }">{{ row.approvedAt ? formatDateTime(row.approvedAt) : '-' }}</template>
              </el-table-column>
              <el-table-column label="Shipping Approval Excel" min-width="190">
                <template #default="{ row }">
                  <el-button
                    v-if="row.file"
                    type="primary"
                    link
                    :loading="downloadingFileId === row.file.id"
                    @click="handleDownloadOrderFile(row.file)"
                  >
                    {{ row.file.originalName }}
                  </el-button>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <el-table :data="order.items" class="data-table" border>
            <el-table-column v-if="false" type="expand">
              <template #default="{ row }">
                <section class="item-detail-panel">
                  <el-descriptions v-if="row.shippingInfo" class="detail-block" :column="2" border>
                    <el-descriptions-item label="Arrived at Company On">{{ row.shippingInfo.arrivedAtCompanyAt ? formatDateTime(row.shippingInfo.arrivedAtCompanyAt) : '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Sent to Customer On">{{ row.shippingInfo.shippedToCustomerAt ? formatDateTime(row.shippingInfo.shippedToCustomerAt) : '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Customer Carrier">{{ row.shippingInfo.customerLogisticsCompany || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="Customer Tracking Number">{{ row.shippingInfo.customerTrackingNo || '-' }}</el-descriptions-item>
                  </el-descriptions>
                  <el-empty v-else description="No shipping details for this material" />

                  <el-form class="business-form" label-position="top" @submit.prevent>
                    <el-form-item label="Shipping Date">
                      <el-date-picker
                        v-model="itemBusinessForms[row.id].delivery.shippingDate"
                        class="full-width"
                        type="date"
                        value-format="YYYY-MM-DD"
                        placeholder="Select Shipping Date"
                      />
                    </el-form-item>
                    <el-form-item label="Buying Company">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.buyerCompany" />
                    </el-form-item>
                    <el-form-item label="Shipment Value (Contract Amount)">
                      <el-input-number v-model="itemBusinessForms[row.id].delivery.shippingAmount" class="full-width" :min="0" :precision="2" />
                    </el-form-item>
                    <el-form-item label="Weight">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.weight" placeholder="e.g. 228 kg" />
                    </el-form-item>
                    <el-form-item label="Package Count">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.packageCount" />
                    </el-form-item>
                    <el-form-item label="Dimensions (cm)">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.packageSize" />
                    </el-form-item>
                    <el-form-item label="Contract Number">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.contractNo" />
                    </el-form-item>
                    <el-form-item label="Sales Representative">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.salesperson" />
                    </el-form-item>
                    <el-form-item label="Goods Name">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.goodsName" />
                    </el-form-item>
                    <el-form-item label="Supplier (Brand / Manufacturer)">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.supplierBrand" />
                    </el-form-item>
                    <el-form-item label="Quantity">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.shippingQuantity" />
                    </el-form-item>
                    <el-form-item label="Delivery Date">
                      <el-date-picker
                        v-model="itemBusinessForms[row.id].delivery.expectedDeliveryDate"
                        class="full-width"
                        type="date"
                        value-format="YYYY-MM-DD"
                        placeholder="Select Delivery Date"
                      />
                    </el-form-item>
                    <el-form-item label="Wooden Crate Required">
                      <el-switch v-model="itemBusinessForms[row.id].delivery.needsWoodenBox" active-text="Yes" inactive-text="No" />
                    </el-form-item>
                    <el-form-item label="Wooden Crate Cost">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.woodenBoxPrice" />
                    </el-form-item>
                    <el-form-item label="Estimated Crate Freight">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.woodenBoxFreight" />
                    </el-form-item>
                    <el-form-item label="Shipping Origin / Destination">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.route" placeholder="e.g. Beijing to Duobaoshan" />
                    </el-form-item>
                    <el-form-item label="Transfer Required">
                      <el-switch v-model="itemBusinessForms[row.id].delivery.needsTransfer" active-text="Yes" inactive-text="No" />
                    </el-form-item>
                    <el-form-item label="Transfer Carrier">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.transferLogistics" />
                    </el-form-item>
                    <el-form-item label="Estimated Transfer Cost">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.estimatedTransferPrice" />
                    </el-form-item>
                    <el-form-item label="Billable Weight (kg)">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.billingWeight" />
                    </el-form-item>
                    <el-form-item label="Estimated Freight by Carrier" class="business-form-wide">
                      <el-input
                        v-model.trim="itemBusinessForms[row.id].delivery.freightEstimate"
                        type="textarea"
                        :rows="3"
                        placeholder="Enter one option or quote per line"
                      />
                    </el-form-item>
                    <el-form-item label="Product Images">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="itemBusinessForms[row.id].productPhotoFiles"
                        :on-change="getItemFileListChangeHandler(row.id, 'productPhotoFiles')"
                        :on-remove="getItemFileListChangeHandler(row.id, 'productPhotoFiles')"
                        accept=".jpg,.jpeg,.png,.gif,.webp"
                      >
                        <el-button>Select Image</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-form-item label="Shipping Images">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="itemBusinessForms[row.id].deliveryPhotoFiles"
                        :on-change="getItemFileListChangeHandler(row.id, 'deliveryPhotoFiles')"
                        :on-remove="getItemFileListChangeHandler(row.id, 'deliveryPhotoFiles')"
                        accept=".jpg,.jpeg,.png,.gif,.webp"
                      >
                        <el-button>Select Image</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-form-item label="Customer Carrier">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.buyerLogisticsCompany" />
                    </el-form-item>
                    <el-form-item label="Customer Tracking Number">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.buyerLogisticsNo" />
                    </el-form-item>
                    <el-form-item label="Applicant">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.applicant" />
                    </el-form-item>
                    <el-form-item label="Approver">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.approver" />
                    </el-form-item>
                    <el-form-item label="Notes" class="business-form-wide">
                      <el-input v-model.trim="itemBusinessForms[row.id].delivery.remark" type="textarea" :rows="2" />
                    </el-form-item>
                    <div class="business-form-actions">
                      <el-button
                        v-if="row.currentStatus === 'SHIPPED_TO_CUSTOMER'"
                        type="primary"
                        :loading="businessSubmittingId === row.id"
                        @click="handleSaveItemDelivery(row, 'ARRIVED_COMPANY')"
                      >
                        Save and Submit Shipping Request
                      </el-button>
                      <el-button
                        v-else-if="row.currentStatus === 'ARRIVED_COMPANY' && canManageOrders"
                        type="success"
                        :loading="itemStatusSubmittingId === row.id"
                        @click="handleApproveItemStatus(row, 'CUSTOMER_PAID', 'Shipping request approved')"
                      >
                        Approve Shipping Request
                      </el-button>
                      <el-tag v-else-if="row.currentStatus === 'ARRIVED_COMPANY'" type="warning">
                        Awaiting Shipping Approval
                      </el-tag>
                      <el-tag v-else type="info">
                        {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                      </el-tag>
                    </div>
                  </el-form>
                </section>
              </template>
            </el-table-column>
            <el-table-column label="No." prop="lineNo" width="70" align="center" />
            <el-table-column label="Material Code" prop="materialCode" min-width="140" />
            <el-table-column label="Material Description" prop="materialDescription" min-width="220" />
            <el-table-column label="Current Stage" width="170">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.currentStatus)">
                  {{ ORDER_STATUS_TEXT[row.currentStatus] || row.currentStatus }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Carrier" min-width="160">
              <template #default="{ row }">{{ row.shippingInfo?.customerLogisticsCompany || '-' }}</template>
            </el-table-column>
            <el-table-column label="Tracking Number" min-width="160">
              <template #default="{ row }">{{ row.shippingInfo?.customerTrackingNo || '-' }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane v-if="!isLostOrder" label="Customer Payments" name="customer-payment">
          <section class="next-action-panel">
            <div class="table-toolbar">
              <div>
                <h2>Order Customer Payments</h2>
                <p>Record cumulative actual payments for the whole order.</p>
              </div>
              <el-tag :type="customerPaymentStateTagType">{{ customerPaymentDisplayState }}</el-tag>
            </div>

            <el-alert
              v-if="order.customerPaymentSummary.source === 'LEGACY_ITEMS'"
              class="detail-block"
              type="info"
              show-icon
              :closable="false"
              title="The current payment total comes from historical material records. Saving will convert it to an order-level record."
            />

            <el-table :data="order.items" class="data-table" border>
              <el-table-column label="No." prop="lineNo" width="70" align="center" />
              <el-table-column label="Material Code" prop="materialCode" min-width="140" />
              <el-table-column label="Material Name" min-width="260">
                <template #default="{ row }">{{ row.materialDescription || '-' }}</template>
              </el-table-column>
              <el-table-column label="Requested Quantity" width="120">
                <template #default="{ row }">{{ row.quantity || '-' }} {{ row.unit || '' }}</template>
              </el-table-column>
              <el-table-column label="Total (Tax Included)" width="150">
                <template #default="{ row }">{{ formatOptionalMoney(row.taxIncludedTotal) }}</template>
              </el-table-column>
            </el-table>

            <el-form class="business-form customer-payment-form" label-position="top" @submit.prevent>
              <el-form-item label="Order Total">
                <el-input :model-value="formatMoney(customerPaymentOrderTotal)" disabled />
              </el-form-item>
              <el-form-item label="Cumulative Actual Payment">
                <el-input-number
                  v-model="customerPaymentForm.paidAmount"
                  class="full-width"
                  :min="0"
                  :max="customerPaymentOrderTotal"
                  :precision="2"
                />
              </el-form-item>
              <el-form-item label="Outstanding Amount">
                <el-input :model-value="formatMoney(customerPaymentRemainingAmount)" disabled />
              </el-form-item>
              <el-form-item label="Payment Status">
                <el-input :model-value="customerPaymentDisplayState" disabled />
              </el-form-item>
              <el-form-item label="Payment Date">
                <el-date-picker
                  v-model="customerPaymentForm.paidAt"
                  class="full-width"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ss.sssZ"
                  placeholder="Select Payment Date"
                />
              </el-form-item>
              <el-form-item label="Notes" class="business-form-wide">
                <el-input v-model.trim="customerPaymentForm.remark" type="textarea" :rows="2" />
              </el-form-item>
              <div class="business-form-actions">
                <el-button type="primary" :loading="customerPaymentSaving" @click="handleSaveCustomerPayment">
                  Save Customer Payments
                </el-button>
                <span v-if="order.customerPayment" class="form-secondary-text">
                  Last recorded by: {{ order.customerPayment.createdBy.realName || order.customerPayment.createdBy.username }}
                </span>
              </div>
            </el-form>
          </section>
        </el-tab-pane>

        <el-tab-pane label="Attachment Management" name="files">
          <el-table :data="attachmentGroups" class="data-table" border>
            <el-table-column type="expand">
              <template #default="{ row }">
                <section class="item-detail-panel">
                  <section class="file-group-section">
                    <h3>Material Description</h3>
                    <el-table :data="row.items" class="data-table nested-table" border>
                      <el-table-column label="No." prop="lineNo" width="80" align="center" />
                      <el-table-column label="Material Code" prop="materialCode" min-width="140" />
                      <el-table-column label="Material Description" prop="materialDescription" min-width="260" />
                    </el-table>
                  </section>

                  <el-form v-if="row.items.length" class="file-upload-form file-group-upload-form" label-position="top" @submit.prevent>
                    <el-form-item label="Associated Material">
                      <el-select v-model="fileGroupForms[row.id].targetItemId" class="full-width">
                        <el-option
                          v-for="item in row.items"
                          :key="item.id"
                          :label="`${item.lineNo}. ${item.materialDescription || item.materialCode || '-'}`"
                          :value="item.id"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="File Type">
                      <el-select v-model="fileGroupForms[row.id].fileCategory" class="file-category-select">
                        <el-option
                          v-for="option in FILE_CATEGORY_OPTIONS"
                          :key="option.value"
                          :label="option.label"
                          :value="option.value"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="Upload File">
                      <el-upload
                        :auto-upload="false"
                        :limit="1"
                        :file-list="fileGroupForms[row.id].selectedFiles"
                        :on-change="getFileGroupListChangeHandler(row.id)"
                        :on-remove="getFileGroupListChangeHandler(row.id)"
                        :accept="acceptedFileTypes"
                      >
                        <el-button>Select File</el-button>
                      </el-upload>
                    </el-form-item>
                    <el-button type="primary" :loading="fileUploadingId === fileGroupForms[row.id].targetItemId" @click="handleFileGroupUpload(row)">
                      Upload to This Group
                    </el-button>
                  </el-form>

                  <el-table :data="row.files" class="data-table nested-table" border>
                    <el-table-column label="Associated Material" min-width="220">
                      <template #default="{ row: file }">{{ file.itemLabel }}</template>
                    </el-table-column>
                    <el-table-column label="Filename" min-width="220">
                      <template #default="{ row: file }">
                        <span>{{ file.originalName }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="Type" width="150">
                      <template #default="{ row: file }">{{ FILE_CATEGORY_TEXT[file.category] || file.category }}</template>
                    </el-table-column>
                    <el-table-column label="Size" width="120">
                      <template #default="{ row: file }">{{ formatFileSize(file.size) }}</template>
                    </el-table-column>
                    <el-table-column label="Uploaded By" width="140">
                      <template #default="{ row: file }">{{ file.uploader.realName || file.uploader.username }}</template>
                    </el-table-column>
                    <el-table-column label="Uploaded At" width="180">
                      <template #default="{ row: file }">{{ formatDateTime(file.createdAt) }}</template>
                    </el-table-column>
                    <el-table-column label="Actions" width="90" fixed="right">
                      <template #default="{ row: file }">
                        <el-button type="primary" link :loading="downloadingFileId === file.id" @click="handleDownloadOrderFile(file)">Download</el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                </section>
              </template>
            </el-table-column>
            <el-table-column label="Group" min-width="220">
              <template #default="{ row }">{{ row.title }}</template>
            </el-table-column>
            <el-table-column label="Purchase Manufacturer" min-width="160">
              <template #default="{ row }">{{ row.supplierName || '-' }}</template>
            </el-table-column>
            <el-table-column label="Material Count" width="100">
              <template #default="{ row }">{{ row.items.length }}</template>
            </el-table-column>
            <el-table-column label="Attachment Count" width="100">
              <template #default="{ row }">{{ row.files.length }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { AxiosError } from 'axios'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile, UploadFiles } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as XLSX from 'xlsx'

import {
  approvePurchaseBatch,
  approveShippingApplication,
  createShippingApplication,
  deleteOrderApi,
  deleteOrderFileApi,
  downloadOrderFileApi,
  exportOrderPaymentApplicationApi,
  exportPurchaseContractApi,
  exportShippingApplicationApi,
  getOrderDetailApi,
  updateOrderBasicInfoApi,
  updateItemBidInfo,
  updateItemDeliveryInfo,
  updateItemPurchaseInfo,
  updateItemQuoteInfo,
  updateItemQuoteSelection,
  updateItemWinningInfo,
  updateOrderItemBasicInfoApi,
  updateOrderItemStatusApi,
  updateCustomerPayment,
  updatePurchaseBatch,
  updatePurchaseItemPricing,
  rejectPurchaseBatch,
  rejectShippingApplication,
  uploadOrderFileApi,
  uploadOrderItemFile,
  uploadOrderItemFileApi
} from '@/api/orders'
import {
  FILE_CATEGORY_OPTIONS,
  FILE_CATEGORY_TEXT,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_TEXT
} from '@/config/order'
import { useAuthStore } from '@/stores/auth'
import type { OrderDetail, OrderDetailItem, OrderShippingApplication } from '@/types/order'
import type { OrderSupplierQuote } from '@/types/order'
import {
  clampPaymentDraft,
  getOrderPaymentDraftState,
  getOrderPaymentDraftTagType,
  getOrderPaymentDisplayState,
  getPaymentDraftError,
  getRemainingPaymentAmount
} from '@/utils/orderCustomerPayment'
import {
  calculatePaymentApplicationAmounts,
  collectCompletedPaymentSummaries,
  isPaymentPercentWithinRemaining,
  isSupplierPaymentCompletionAccurate,
  sumApprovedAdvancePaymentAmount
} from '@/utils/paymentApplicationAmounts'
import { calculatePurchaseTotal, sumPurchaseTotals } from '@/utils/purchasePricing'
import { extractShippingExcelFields } from '@/utils/shippingExcelFields'
import { buildApprovedShippingSummaries } from '@/utils/shippingApprovalSummaries'

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid'
}

const INVOICE_STATUS_TEXT: Record<string, string> = {
  NOT_RECEIVED: 'Not Received',
  RECEIVED: 'Received',
  ISSUED: 'Invoiced'
}

interface ItemBusinessForm {
  quote: {
    supplierName: string
    contactName: string
    phone: string
    quotedPrice: number | undefined
    deliveryTime: string
    remark: string
    isSelected: boolean
  }
  purchase: {
    purchaseCost: number | undefined
    supplierName: string
    deliveryTime: string
    advancePaymentAmount: number | undefined
    advancePaymentStatus: 'PAID' | 'UNPAID'
    arrivalPaymentAmount: number | undefined
    arrivalPaymentStatus: 'PAID' | 'UNPAID'
    supplierLogisticsCompany: string
    supplierLogisticsNo: string
    invoiceStatus: 'ISSUED' | 'NOT_RECEIVED'
  }
  delivery: {
    shippingDate: string
    buyerCompany: string
    shippingAmount: number | undefined
    weight: string
    packageCount: string
    packageSize: string
    contractNo: string
    salesperson: string
    goodsName: string
    supplierBrand: string
    shippingQuantity: string
    expectedDeliveryDate: string
    needsWoodenBox: boolean
    woodenBoxPrice: string
    woodenBoxFreight: string
    route: string
    needsTransfer: boolean
    transferLogistics: string
    estimatedTransferPrice: string
    billingWeight: string
    freightEstimate: string
    applicant: string
    approver: string
    buyerLogisticsCompany: string
    buyerLogisticsNo: string
    remark: string
  }
  fileCategory: string
  selectedFiles: UploadFile[]
  quoteFiles: UploadFile[]
  winningContractFiles: UploadFile[]
  purchaseContractFiles: UploadFile[]
  paymentApplicationFiles: UploadFile[]
  productPhotoFiles: UploadFile[]
  deliveryPhotoFiles: UploadFile[]
}

interface FileGroupForm {
  targetItemId: string
  fileCategory: string
  selectedFiles: UploadFile[]
}

interface BatchContractForm {
  selectedFiles: UploadFile[]
}

type AttachmentItem = Pick<OrderDetailItem, 'id' | 'lineNo' | 'materialCode' | 'materialDescription'>
type AttachmentFile = OrderDetail['files'][number] & {
  itemLabel: string
}
type DownloadableOrderFile = Pick<OrderDetail['files'][number], 'id' | 'originalName' | 'storagePath'>
interface AttachmentGroup {
  id: string
  title: string
  supplierName: string | null
  items: AttachmentItem[]
  files: AttachmentFile[]
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const order = ref<OrderDetail>()
const activeDetailTab = ref('basic')
const itemStatusSubmittingId = ref('')
const businessSubmittingId = ref('')
const fileUploadingId = ref('')
const quoteSelectingId = ref('')
const exportingShipping = ref(false)
const exportingPurchaseContract = ref(false)
const deletingOrder = ref(false)
const batchStatusSubmitting = ref(false)
const batchPurchaseSubmitting = ref(false)
const batchPurchasePricingSaving = ref(false)
const batchShippingSubmitting = ref(false)
const paymentApplicationSubmitting = ref(false)
const customerPaymentSaving = ref(false)
const exportingPaymentApplication = ref(false)
const customerContractUploading = ref(false)
const approvingPurchaseBatchId = ref('')
const rejectingPurchaseBatchId = ref('')
const approvingShippingBatchId = ref('')
const approvingShippingApplicationId = ref('')
const rejectingShippingApplicationId = ref('')
const contractUploadingBatchId = ref('')
const downloadingFileId = ref('')
const deletingFileId = ref('')
const batchNextStatus = ref('')
const batchStatusNote = ref('')
const batchPurchaseSelection = ref<OrderDetailItem[]>([])
const purchaseTableRef = ref()
const paymentApplicationTableRef = ref()
const shippingBatchTableRef = ref()
const paymentApplicationSelection = ref<PurchaseBatch[]>([])
const shippingBatchSelection = ref<PurchaseBatch[]>([])
const customerContractFiles = ref<UploadFile[]>([])
const acceptedFileTypes = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp'
const isEditingBasicInfo = ref(false)
const basicInfoSaving = ref(false)
const editingOrderItemId = ref('')
const orderItemEditSaving = ref(false)
const editingPurchaseItemId = ref('')
const purchaseItemEditSaving = ref(false)
const editingPurchaseBatchId = ref('')
const purchaseBatchEditSaving = ref(false)
const basicInfoForm = reactive({
  orderNo: '',
  inquiryCompany: '',
  declarationCompany: '',
  inquiryPerson: '',
  inquiryDate: '',
  inquiryNo: '',
  arrivedAtCompanyAt: ''
})
const purchaseBatchEditForm = reactive({
  purchaseCost: undefined as number | undefined,
  supplierName: '',
  deliveryTime: '',
  itemIds: [] as string[]
})
const orderItemEditForm = reactive({
  materialCode: '',
  materialDescription: '',
  remark: '',
  supplierRemark: '',
  deliveryTime: '',
  unit: '',
  quantity: undefined as number | undefined,
  manufacturer: '',
  quotedPrice: undefined as number | undefined,
  taxIncludedTotal: undefined as number | undefined,
  applicantDepartment: ''
})
const purchaseItemEditForm = reactive({
  materialCode: '',
  materialDescription: '',
  purchaseQuantity: undefined as number | undefined,
  purchaseUnitPrice: undefined as number | undefined,
  purchaseTotal: undefined as number | undefined
})
const purchasePricingDrafts = reactive<Record<string, {
  purchaseQuantity: number | undefined
  purchaseUnitPrice: number | undefined
  purchaseTotal: number | undefined
}>>({})
const itemStatusForms = reactive<Record<string, {
  status: string
  note: string
  winningPrice: number | undefined
  lostReason: string
}>>({})
const itemBusinessForms = reactive<Record<string, ItemBusinessForm>>({})
const fileGroupForms = reactive<Record<string, FileGroupForm>>({})
const batchContractForms = reactive<Record<string, BatchContractForm>>({})
const batchPurchaseForm = reactive({
  purchaseContractFiles: [] as UploadFile[],
  purchaseCost: undefined as number | undefined,
  supplierName: '',
  deliveryTime: ''
})
const batchShippingForm = reactive({
  logisticsCompany: '',
  trackingNo: '',
  remark: '',
  shippingApplicationFiles: [] as UploadFile[]
})
const paymentApplicationForm = reactive({
  paymentPercent: undefined as number | undefined,
  advancePaymentAmount: undefined as number | undefined,
  arrivalPaymentAmount: undefined as number | undefined,
  bankName: '',
  bankAccount: '',
  remark: ''
})
const customerPaymentForm = reactive({
  paidAmount: 0,
  paidAt: '',
  remark: ''
})

const isLostOrder = computed(() => ['BID_LOST', 'LOST_ARCHIVED'].includes(order.value?.currentStatus || ''))
const canManageOrders = computed(() => authStore.role === 'BOSS' || authStore.role === 'ADMIN')
const canDeleteOrders = computed(() => authStore.isAuthenticated)
const customerPaymentOrderTotal = computed(() => Number(order.value?.customerPaymentSummary.orderTotal || order.value?.winningAmount || 0))
const customerPaymentRemainingAmount = computed(() => getRemainingPaymentAmount(
  customerPaymentOrderTotal.value,
  customerPaymentForm.paidAmount
))
const customerPaymentDraftState = computed(() => getOrderPaymentDraftState(
  Number(customerPaymentForm.paidAmount),
  customerPaymentOrderTotal.value
))
const customerPaymentDisplayState = computed(() => getOrderPaymentDisplayState({
  state: customerPaymentDraftState.value
}))
const customerPaymentStateTagType = computed(() => getOrderPaymentDraftTagType(customerPaymentDraftState.value))
const batchPurchaseEligibleItems = computed(() => order.value?.items.filter((item) => item.currentStatus === 'PURCHASING' && !item.purchaseBatchId) || [])
const purchaseBatches = computed(() => {
  const batches = order.value?.purchaseInfos?.filter((info) => (info.batchItems?.length || 0) > 0) || []
  const unique = new Map<string, typeof batches[number]>()

  batches.forEach((batch) => unique.set(batch.id, batch))
  order.value?.items.forEach((item) => {
    if (item.purchaseBatch) {
      unique.set(item.purchaseBatch.id, item.purchaseBatch)
    }
  })

  return Array.from(unique.values())
})
const attachmentGroups = computed(() => order.value ? buildAttachmentGroups(order.value) : [])
const customerContractOrderFiles = computed(() => order.value?.files.filter((file) =>
  file.category === 'BID_CONTRACT' && file.targetType === 'ORDER'
) || [])
const shippingBatches = computed(() => purchaseBatches.value.filter((batch) => {
  const items = batch.batchItems || []
  return items.length > 0 && items.every((item) => item.currentStatus === 'SHIPPED_TO_CUSTOMER')
}))
const pendingGroupedShippingApplications = computed(() => order.value?.shippingApplications?.filter((application) => application.status === 'PENDING') || [])
const rejectedGroupedShippingApplications = computed(() => order.value?.shippingApplications?.filter((application) => application.status === 'REJECTED') || [])
const pendingGroupedShippingBatchIds = computed(() => new Set(
  pendingGroupedShippingApplications.value.flatMap((application) => application.batches.map((batch) => batch.purchaseInfo.id))
))
const paymentApplicationBatches = computed(() => purchaseBatches.value.filter((batch) => {
  const items = batch.batchItems || []
  return items.length > 0 && items.every((item) => item.currentStatus === 'PURCHASING' || item.currentStatus === 'PURCHASE_PAYMENT')
}))
const pendingPaymentBatches = computed(() => paymentApplicationBatches.value.filter((batch) => {
  const items = batch.batchItems || []
  return items.length > 0 && items.every((item) => item.currentStatus === 'PURCHASE_PAYMENT')
}))
const selectedPaymentTotalCost = computed(() => paymentApplicationSelection.value.reduce((total, batch) => total + Number(batch.purchaseCost || 0), 0))
const selectedApprovedAdvancePaymentAmount = computed(() => sumApprovedAdvancePaymentAmount(paymentApplicationSelection.value))
const canExportPaymentApplication = computed(() => pendingPaymentBatches.value.length > 0 || paymentApplicationBatches.value.length > 0)
const allPaymentApplicationsCompleted = computed(() => isSupplierPaymentCompletionAccurate(
  order.value?.items || [],
  purchaseBatches.value
))
const completedPaymentSummaries = computed(() => collectCompletedPaymentSummaries(purchaseBatches.value))
const completedPaymentTotalAmount = computed(() => completedPaymentSummaries.value.reduce((total, summary) => total + Number(summary.totalAmount || 0), 0))
const paymentApplicationEmptyText = computed(() => allPaymentApplicationsCompleted.value ? 'All orders are fully paid' : 'No purchases require a payment request')
const canSelectPaymentApplicationBatch = (batch: PurchaseBatch) => {
  const items = batch.batchItems || []
  return items.length > 0 && items.every((item) => item.currentStatus === 'PURCHASING') && getRemainingPaymentPercent(batch) > 0
}
function getPaymentApplicationDefaults() {
  const cost = selectedPaymentTotalCost.value
  const percent = paymentApplicationForm.paymentPercent

  if (percent === undefined || Number.isNaN(percent)) {
    return {
      advancePaymentAmount: undefined,
      arrivalPaymentAmount: undefined,
      remark: ''
    }
  }

  const amounts = calculatePaymentApplicationAmounts(cost, percent)

  if (percent === 100) {
    return {
      ...amounts,
      remark: 'Full amount 100%'
    }
  }

  return {
    ...amounts,
    remark: percent > 50 ? `Balance Payment ${percent}%` : `Advance ${percent}% (full amount)`
  }
}

function applyPaymentApplicationDefaults() {
  const defaults = getPaymentApplicationDefaults()
  paymentApplicationForm.advancePaymentAmount = defaults.advancePaymentAmount
  paymentApplicationForm.arrivalPaymentAmount = defaults.arrivalPaymentAmount
  paymentApplicationForm.remark = defaults.remark
}
const shippingApprovalBatches = computed(() => purchaseBatches.value.filter((batch) => {
  const items = batch.batchItems || []
  return items.length > 0 &&
    items.every((item) => item.currentStatus === 'ARRIVED_COMPANY') &&
    !pendingGroupedShippingBatchIds.value.has(batch.id)
}))
const groupedApprovedShippingBatchIds = computed(() => new Set(
  (order.value?.shippingApplications || [])
    .filter((application) => application.status === 'APPROVED')
    .flatMap((application) => application.batches.map((batch) => batch.purchaseInfo.id))
))
const approvedShippingSummaries = computed(() => order.value
  ? buildApprovedShippingSummaries({
      inquiryCompany: order.value.inquiryCompany,
      purchaseBatches: purchaseBatches.value.filter((batch) => !groupedApprovedShippingBatchIds.value.has(batch.id)),
      orderItems: order.value.items,
      itemStatusRecords: order.value.itemStatusRecords,
      files: order.value.files
    })
  : []
)
const approvedGroupedShippingRows = computed(() => (order.value?.shippingApplications || [])
  .filter((application) => application.status === 'APPROVED')
  .flatMap((application) => application.batches.map(({ purchaseInfo }) => {
    return {
      batchId: purchaseInfo.id,
      supplierName: purchaseInfo.supplierName,
      buyerCompany: order.value?.inquiryCompany || null,
      purchasePackageText: formatPurchaseBatchItems(purchaseInfo),
      logisticsCompany: application.logisticsCompany,
      trackingNo: application.trackingNo,
      approvedAt: application.approvedAt || application.createdAt,
      file: application.file
    }
  })))
const approvedShippingRows = computed(() => [
  ...approvedGroupedShippingRows.value,
  ...approvedShippingSummaries.value.map((summary) => {
    const batch = purchaseBatches.value.find((item) => item.id === summary.batchId)
    const itemIds = new Set((batch?.batchItems || []).map((item) => item.id))
    const shippingInfo = order.value?.items.find((item) => itemIds.has(item.id) && item.shippingInfo)?.shippingInfo

    return {
      ...summary,
      logisticsCompany: shippingInfo?.customerLogisticsCompany || null,
      trackingNo: shippingInfo?.customerTrackingNo || null
    }
  })
].sort((first, second) => new Date(first.approvedAt).getTime() - new Date(second.approvedAt).getTime()))

const itemStatusSet = computed(() => {
  if (!order.value) {
    return new Set<string>()
  }

  return new Set(order.value.items.map((item) => item.currentStatus))
})

const hasMixedItemStatuses = computed(() => itemStatusSet.value.size > 1)

const batchCurrentStatus = computed(() => {
  if (!order.value || hasMixedItemStatuses.value) {
    return ''
  }

  return order.value.items[0]?.currentStatus || order.value.currentStatus
})

const batchNextStatusOptions = computed(() => {
  if (!batchCurrentStatus.value) {
    return []
  }

  if (['PURCHASE_PAYMENT', 'ARRIVED_COMPANY'].includes(batchCurrentStatus.value) && !canManageOrders.value) {
    return []
  }

  return (ORDER_STATUS_TRANSITIONS[batchCurrentStatus.value] || []).map((status) => ({
    label: ORDER_STATUS_TEXT[status] || status,
    value: status
  }))
})

const orderStatusSummaryText = computed(() => {
  if (!order.value) {
    return '-'
  }

  const statuses = new Set(order.value.items.map((item) => item.currentStatus))

  if (statuses.size <= 1) {
    return ORDER_STATUS_TEXT[order.value.currentStatus] || order.value.currentStatus
  }

  return `${ORDER_STATUS_TEXT[order.value.currentStatus] || order.value.currentStatus} (items)`
})

type PurchaseBatch = NonNullable<OrderDetail['purchaseInfos']>[number]

function formatPurchaseBatchItems(batch: PurchaseBatch) {
  return batch.batchItems?.map((item) => `${item.lineNo}. ${item.materialDescription || item.materialCode || '-'}`).join('; ') || '-'
}

function formatGroupedShippingApplicationBatches(application: OrderShippingApplication) {
  return application.batches
    .map(({ purchaseInfo }) => `${purchaseInfo.supplierName || 'Manufacturer Not Specified'}: ${formatPurchaseBatchItems(purchaseInfo)}`)
    .join('; ')
}

function formatPurchaseBatchItemOption(item: Pick<OrderDetailItem, 'lineNo' | 'materialCode' | 'materialDescription' | 'currentStatus'>) {
  return `${item.lineNo}. ${item.materialDescription || item.materialCode || '-'} (${ORDER_STATUS_TEXT[item.currentStatus] || item.currentStatus})`
}

function getPurchaseBatchItemOptions(batch: PurchaseBatch) {
  const selectedIds = new Set((batch.batchItems || []).map((item) => item.id))
  return order.value?.items.filter((item) => !item.purchaseBatchId || selectedIds.has(item.id)) || []
}

function getBatchPurchaseContractFiles(batch: PurchaseBatch) {
  const files = new Map<string, DownloadableOrderFile>()

  if (batch.purchaseContractFile) {
    files.set(batch.purchaseContractFile.id, batch.purchaseContractFile)
  }

  const itemIds = new Set((batch.batchItems || []).map((item) => item.id))

  order.value?.files
    .filter((file) => file.category === 'PURCHASE_CONTRACT' && file.targetType === 'ORDER_ITEM' && Boolean(file.targetId) && itemIds.has(file.targetId!))
    .forEach((file) => files.set(file.id, file))

  return Array.from(files.values())
}

function formatAttachmentItemLabel(item: AttachmentItem) {
  return `${item.lineNo}. ${item.materialDescription || item.materialCode || '-'}`
}

function getAttachmentFilesForItems(detail: OrderDetail, items: AttachmentItem[]) {
  const itemById = new Map(items.map((item) => [item.id, item]))

  return detail.files
    .filter((file) => file.targetType === 'ORDER_ITEM' && Boolean(file.targetId) && itemById.has(file.targetId!))
    .map((file) => ({
      ...file,
      itemLabel: formatAttachmentItemLabel(itemById.get(file.targetId!)!)
    }))
}

function buildAttachmentGroups(detail: OrderDetail): AttachmentGroup[] {
  const groups: AttachmentGroup[] = []
  const usedItemIds = new Set<string>()

  detail.purchaseInfos
    .filter((batch) => (batch.batchItems?.length || 0) > 0)
    .forEach((batch, index) => {
      const batchItemIds = new Set(batch.batchItems?.map((item) => item.id) || [])
      const items = detail.items.filter((item) => item.purchaseBatchId === batch.id || batchItemIds.has(item.id))

      items.forEach((item) => usedItemIds.add(item.id))
      groups.push({
        id: batch.id,
        title: batch.supplierName ? `${batch.supplierName} Purchase Group` : `Purchase Group ${index + 1}`,
        supplierName: batch.supplierName,
        items,
        files: getAttachmentFilesForItems(detail, items)
      })
    })

  const ungroupedItems = detail.items.filter((item) => !usedItemIds.has(item.id))
  const orderFiles = detail.files
    .filter((file) => file.targetType !== 'ORDER_ITEM')
    .map((file) => ({
      ...file,
      itemLabel: 'Order Attachments'
    }))

  if (ungroupedItems.length || orderFiles.length || !groups.length) {
    groups.push({
      id: 'ungrouped',
      title: 'Order Attachments / Ungrouped Materials',
      supplierName: null,
      items: ungroupedItems,
      files: [
        ...orderFiles,
        ...getAttachmentFilesForItems(detail, ungroupedItems)
      ]
    })
  }

  return groups
}

function resetFileGroupForms(detail: OrderDetail) {
  const groups = buildAttachmentGroups(detail)

  Object.keys(fileGroupForms).forEach((key) => {
    delete fileGroupForms[key]
  })

  groups.forEach((group) => {
    fileGroupForms[group.id] = {
      targetItemId: group.items[0]?.id || '',
      fileCategory: 'SUPPLIER_QUOTE',
      selectedFiles: []
    }
  })
}

function resetBatchContractForms(detail: OrderDetail) {
  Object.keys(batchContractForms).forEach((key) => {
    delete batchContractForms[key]
  })

  detail.purchaseInfos
    .filter((batch) => (batch.batchItems?.length || 0) > 0)
    .forEach((batch) => {
      batchContractForms[batch.id] = {
        selectedFiles: []
      }
    })
}

function formatMoney(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  })
}

function formatOptionalMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '--'
  }

  return formatMoney(value)
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2).replace(/\.00$/, '')}%`
}

function getApprovedPaymentPercent(batch: PurchaseBatch) {
  return (batch.paymentApplications || [])
    .filter((application) => application.status === 'APPROVED')
    .reduce((total, application) => total + Number(application.paymentPercent || 0), 0)
}

function getPendingPaymentPercent(batch: PurchaseBatch) {
  return (batch.paymentApplications || [])
    .filter((application) => application.status === 'PENDING')
    .reduce((total, application) => total + Number(application.paymentPercent || 0), 0)
}

function getRemainingPaymentPercent(batch: PurchaseBatch) {
  return Math.max(0, 100 - getApprovedPaymentPercent(batch) - getPendingPaymentPercent(batch))
}

function getApprovedAdvancePaymentAmount(batch: PurchaseBatch) {
  return sumApprovedAdvancePaymentAmount([batch])
}

function getPaymentReviewStatus(batch: PurchaseBatch) {
  const latestApplication = batch.paymentApplications?.[0]
  const pendingPercent = getPendingPaymentPercent(batch)
  const approvedPercent = getApprovedPaymentPercent(batch)
  const hasPendingStatus = (batch.batchItems || []).some((item) => item.currentStatus === 'PURCHASE_PAYMENT')

  if (latestApplication?.status === 'REJECTED' && pendingPercent === 0) {
    return {
      text: approvedPercent > 0 ? `Rejected; another request can be submitted (approved ${formatPercent(approvedPercent)})` : 'Rejected; can be resubmitted',
      type: 'danger' as const
    }
  }

  if (pendingPercent > 0 || hasPendingStatus) {
    return {
      text: pendingPercent > 0 ? `Under review (this request ${formatPercent(pendingPercent)})` : 'Under Review',
      type: 'warning' as const
    }
  }

  if (approvedPercent >= 100) {
    return {
      text: 'Approved',
      type: 'success' as const
    }
  }

  if (approvedPercent > 0) {
    return {
      text: `Approved ${formatPercent(approvedPercent)}; another request allowed`,
      type: 'info' as const
    }
  }

  return {
    text: 'Not Submitted',
    type: 'info' as const
  }
}

function formatPaymentRemark(batch: PurchaseBatch) {
  const latestApplication = batch.paymentApplications?.[0]

  if (latestApplication?.remark) {
    return latestApplication.remark
  }

  if (!batch.paymentPercent) {
    return '-'
  }

  const percent = Number(batch.paymentPercent)
  const percentText = Number.isInteger(percent) ? String(percent) : String(batch.paymentPercent)

  if (percent === 100) {
    return 'Full amount 100%'
  }

  if (percent > 50) {
    return `Balance Payment ${percentText}%`
  }

  return `Advance ${percentText}% (full amount)`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US')
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function formatDateTimeInput(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
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

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function handleDownloadOrderFile(file: DownloadableOrderFile) {
  downloadingFileId.value = file.id

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
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'File could not be downloaded')
  } finally {
    downloadingFileId.value = ''
  }
}

function toNumber(value: string | null | undefined) {
  return value === null || value === undefined ? undefined : Number(value)
}

function getStatusTagType(status: string) {
  if (['COMPLETED', 'CUSTOMER_PAID'].includes(status)) {
    return 'success'
  }

  if (['BID_LOST', 'LOST_ARCHIVED'].includes(status)) {
    return 'danger'
  }

  if (['PURCHASING'].includes(status)) {
    return 'warning'
  }

  if (['PURCHASE_PAYMENT', 'SHIPPED_TO_CUSTOMER', 'SUPPLIER_SHIPPED', 'ARRIVED_COMPANY'].includes(status)) {
    return 'primary'
  }

  return ''
}

function getItemNextStatusOptions(item: OrderDetailItem) {
  if (['PURCHASE_PAYMENT', 'ARRIVED_COMPANY'].includes(item.currentStatus) && !canManageOrders.value) {
    return []
  }

  return (ORDER_STATUS_TRANSITIONS[item.currentStatus] || []).map((status) => ({
    label: ORDER_STATUS_TEXT[status] || status,
    value: status
  }))
}

function getFlowFormTitle(item: OrderDetailItem) {
  const titleMap: Record<string, string> = {
    PURCHASING: 'Purchase Details',
    PURCHASE_PAYMENT: 'Purchase Details',
    SUPPLIER_SHIPPED: 'Shipping Details',
    ARRIVED_COMPANY: 'Shipping Details',
    SHIPPED_TO_CUSTOMER: 'Shipping Details',
    CUSTOMER_PAID: 'Customer Payment Details',
    COMPLETED: 'Customer Payment Details'
  }

  return titleMap[item.currentStatus] || 'Stage Details'
}

function resetItemStatusForms(items: OrderDetailItem[]) {
  Object.keys(itemStatusForms).forEach((key) => {
    delete itemStatusForms[key]
  })

  items.forEach((item) => {
    const nextStatus = getItemNextStatusOptions(item)[0]?.value || ''
    itemStatusForms[item.id] = {
      status: nextStatus,
      note: '',
      winningPrice: toNumber(item.winningAmount),
      lostReason: item.lostReason || ''
    }
  })

  batchNextStatus.value = batchNextStatusOptions.value[0]?.value || ''
  batchStatusNote.value = ''
}

function resetItemBusinessForms(items: OrderDetailItem[]) {
  Object.keys(itemBusinessForms).forEach((key) => {
    delete itemBusinessForms[key]
  })

  items.forEach((item) => {
    itemBusinessForms[item.id] = {
      quote: {
        supplierName: '',
        contactName: '',
        phone: '',
        quotedPrice: toNumber(item.quotedPrice),
        deliveryTime: item.deliveryTime || '',
        remark: '',
        isSelected: false
      },
      purchase: {
        purchaseCost: toNumber(item.purchaseInfo?.purchaseCost),
        supplierName: item.purchaseInfo?.supplierName || '',
        deliveryTime: item.purchaseInfo?.deliveryTime || '',
        advancePaymentAmount: toNumber(item.purchaseInfo?.advancePaymentAmount),
        advancePaymentStatus: item.purchaseInfo?.advancePaymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
        arrivalPaymentAmount: toNumber(item.purchaseInfo?.arrivalPaymentAmount),
        arrivalPaymentStatus: item.purchaseInfo?.arrivalPaymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
        supplierLogisticsCompany: item.purchaseInfo?.supplierLogisticsCompany || '',
        supplierLogisticsNo: item.purchaseInfo?.supplierTrackingNo || '',
        invoiceStatus: item.purchaseInfo?.invoiceStatus === 'ISSUED' ? 'ISSUED' : 'NOT_RECEIVED'
      },
      delivery: {
        shippingDate: item.shippingInfo?.shippingDate || '',
        buyerCompany: item.shippingInfo?.buyerCompany || order.value?.inquiryCompany || '',
        shippingAmount: toNumber(item.shippingInfo?.shippingAmount),
        weight: item.shippingInfo?.weight || '',
        packageCount: item.shippingInfo?.packageCount || '',
        packageSize: item.shippingInfo?.packageSize || '',
        contractNo: item.shippingInfo?.contractNo || order.value?.orderNo || '',
        salesperson: item.shippingInfo?.salesperson || order.value?.inquiryPerson || '',
        goodsName: item.shippingInfo?.goodsName || item.materialDescription || '',
        supplierBrand: item.shippingInfo?.supplierBrand || item.manufacturer || '',
        shippingQuantity: item.shippingInfo?.shippingQuantity || item.quantity || '',
        expectedDeliveryDate: item.shippingInfo?.expectedDeliveryDate || '',
        needsWoodenBox: Boolean(item.shippingInfo?.needsWoodenBox),
        woodenBoxPrice: item.shippingInfo?.woodenBoxPrice || 'None',
        woodenBoxFreight: item.shippingInfo?.woodenBoxFreight || 'None',
        route: item.shippingInfo?.route || '',
        needsTransfer: Boolean(item.shippingInfo?.needsTransfer),
        transferLogistics: item.shippingInfo?.transferLogistics || 'None',
        estimatedTransferPrice: item.shippingInfo?.estimatedTransferPrice || 'None',
        billingWeight: item.shippingInfo?.billingWeight || '',
        freightEstimate: item.shippingInfo?.freightEstimate || '',
        applicant: item.shippingInfo?.applicant || '',
        approver: item.shippingInfo?.approver || '',
        buyerLogisticsCompany: item.shippingInfo?.customerLogisticsCompany || '',
        buyerLogisticsNo: item.shippingInfo?.customerTrackingNo || '',
        remark: item.shippingInfo?.remark || ''
      },
      fileCategory: 'SUPPLIER_QUOTE',
      selectedFiles: [],
      quoteFiles: [],
      winningContractFiles: [],
      purchaseContractFiles: [],
      paymentApplicationFiles: [],
      productPhotoFiles: [],
      deliveryPhotoFiles: []
    }
  })
}

function fillBusinessForms(detail: OrderDetail) {
  hydrateBasicInfoForm(detail)
  hydrateCustomerPaymentForm(detail)
  resetItemStatusForms(detail.items)
  resetItemBusinessForms(detail.items)
  resetPurchasePricingDrafts(detail.items)
  resetFileGroupForms(detail)
  resetBatchContractForms(detail)
}

function hydrateCustomerPaymentForm(detail: OrderDetail) {
  customerPaymentForm.paidAmount = clampPaymentDraft(
    Number(detail.customerPaymentSummary.paidAmount || 0),
    Number(detail.customerPaymentSummary.orderTotal || 0)
  )
  customerPaymentForm.paidAt = detail.customerPayment?.paidAt || ''
  customerPaymentForm.remark = detail.customerPayment?.remark || ''
}

function resetPurchasePricingDrafts(items: OrderDetailItem[]) {
  Object.keys(purchasePricingDrafts).forEach((key) => {
    delete purchasePricingDrafts[key]
  })

  items.forEach((item) => {
    purchasePricingDrafts[item.id] = {
      purchaseQuantity: toNumber(item.purchaseQuantity),
      purchaseUnitPrice: toNumber(item.purchaseUnitPrice),
      purchaseTotal: toNumber(item.purchaseTotal) ?? toNumber(item.purchaseInfo?.purchaseCost)
    }
  })
}

function hydrateBasicInfoForm(detail: OrderDetail) {
  basicInfoForm.orderNo = detail.orderNo
  basicInfoForm.inquiryCompany = detail.inquiryCompany
  basicInfoForm.declarationCompany = detail.declarationCompany || 'None'
  basicInfoForm.inquiryPerson = detail.inquiryPerson || ''
  basicInfoForm.inquiryDate = formatDateInput(detail.inquiryDate)
  basicInfoForm.inquiryNo = detail.inquiryNo || ''
  basicInfoForm.arrivedAtCompanyAt = formatDateTimeInput(detail.shippingInfo?.arrivedAtCompanyAt)
}

function startBasicInfoEdit() {
  if (!order.value) {
    return
  }

  hydrateBasicInfoForm(order.value)
  isEditingBasicInfo.value = true
}

function cancelBasicInfoEdit() {
  if (order.value) {
    hydrateBasicInfoForm(order.value)
  }

  isEditingBasicInfo.value = false
}

async function handleSaveBasicInfo() {
  if (!order.value) {
    return
  }

  if (!basicInfoForm.orderNo || !basicInfoForm.inquiryCompany || !basicInfoForm.inquiryDate) {
    ElMessage.error('Enter the order number, customer, and inquiry date')
    return
  }

  basicInfoSaving.value = true

  try {
    const { data } = await updateOrderBasicInfoApi(order.value.id, {
      orderNo: basicInfoForm.orderNo,
      inquiryCompany: basicInfoForm.inquiryCompany,
      declarationCompany: basicInfoForm.declarationCompany || 'None',
      inquiryPerson: basicInfoForm.inquiryPerson || undefined,
      inquiryDate: basicInfoForm.inquiryDate,
      inquiryNo: basicInfoForm.inquiryNo || undefined,
      arrivedAtCompanyAt: basicInfoForm.arrivedAtCompanyAt || null
    })
    ElMessage.success(data.message || 'Order Details updated')
    isEditingBasicInfo.value = false
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Order Details could not be saved')
  } finally {
    basicInfoSaving.value = false
  }
}

function hydrateOrderItemEditForm(item: OrderDetailItem) {
  orderItemEditForm.materialCode = item.materialCode || ''
  orderItemEditForm.materialDescription = item.materialDescription || ''
  orderItemEditForm.remark = item.remark || ''
  orderItemEditForm.supplierRemark = item.supplierRemark || ''
  orderItemEditForm.deliveryTime = item.deliveryTime || ''
  orderItemEditForm.unit = item.unit || ''
  orderItemEditForm.quantity = toNumber(item.quantity)
  orderItemEditForm.manufacturer = item.manufacturer || ''
  orderItemEditForm.quotedPrice = toNumber(item.quotedPrice)
  orderItemEditForm.taxIncludedTotal = toNumber(item.taxIncludedTotal)
  orderItemEditForm.applicantDepartment = item.applicantDepartment || ''
}

function startOrderItemEdit(item: OrderDetailItem) {
  editingOrderItemId.value = item.id
  hydrateOrderItemEditForm(item)
}

function cancelOrderItemEdit() {
  editingOrderItemId.value = ''
}

async function handleSaveOrderItemBasicInfo(item: OrderDetailItem) {
  if (!order.value) {
    return
  }

  orderItemEditSaving.value = true

  try {
    const { data } = await updateOrderItemBasicInfoApi(order.value.id, item.id, {
      materialCode: orderItemEditForm.materialCode || undefined,
      materialDescription: orderItemEditForm.materialDescription || undefined,
      remark: orderItemEditForm.remark || undefined,
      supplierRemark: orderItemEditForm.supplierRemark || undefined,
      deliveryTime: orderItemEditForm.deliveryTime || undefined,
      unit: orderItemEditForm.unit || undefined,
      quantity: orderItemEditForm.quantity,
      manufacturer: orderItemEditForm.manufacturer || undefined,
      quotedPrice: orderItemEditForm.quotedPrice,
      taxIncludedTotal: orderItemEditForm.taxIncludedTotal,
      applicantDepartment: orderItemEditForm.applicantDepartment || undefined
    })
    ElMessage.success(data.message || 'Order Items updated')
    editingOrderItemId.value = ''
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Order Items could not be saved')
  } finally {
    orderItemEditSaving.value = false
  }
}

function hydratePurchaseItemEditForm(item: OrderDetailItem) {
  purchaseItemEditForm.materialCode = item.materialCode || ''
  purchaseItemEditForm.materialDescription = item.materialDescription || ''
  purchaseItemEditForm.purchaseQuantity = toNumber(item.purchaseQuantity)
  purchaseItemEditForm.purchaseUnitPrice = toNumber(item.purchaseUnitPrice)
  purchaseItemEditForm.purchaseTotal = toNumber(item.purchaseTotal) ?? toNumber(item.purchaseInfo?.purchaseCost)
}

function startPurchaseItemEdit(item: OrderDetailItem) {
  editingPurchaseItemId.value = item.id
  hydratePurchaseItemEditForm(item)
}

function cancelPurchaseItemEdit() {
  editingPurchaseItemId.value = ''
}

async function handleSavePurchaseItemInfo(item: OrderDetailItem) {
  if (!order.value) {
    return
  }

  purchaseItemEditSaving.value = true

  try {
    await updateOrderItemBasicInfoApi(order.value.id, item.id, {
      materialCode: purchaseItemEditForm.materialCode || undefined,
      materialDescription: purchaseItemEditForm.materialDescription || undefined
    })

    await updatePurchaseItemPricing(order.value.id, {
      items: [{
        itemId: item.id,
        purchaseQuantity: purchaseItemEditForm.purchaseQuantity,
        purchaseUnitPrice: purchaseItemEditForm.purchaseUnitPrice,
        purchaseTotal: purchaseItemEditForm.purchaseTotal
      }]
    })

    ElMessage.success('Purchased Material Price updated')
    editingPurchaseItemId.value = ''
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Purchased Material Details could not be saved')
  } finally {
    purchaseItemEditSaving.value = false
  }
}

function startPurchaseBatchEdit(batch: PurchaseBatch) {
  editingPurchaseBatchId.value = batch.id
  purchaseBatchEditForm.purchaseCost = toNumber(batch.purchaseCost)
  purchaseBatchEditForm.supplierName = batch.supplierName || ''
  purchaseBatchEditForm.deliveryTime = batch.deliveryTime || ''
  purchaseBatchEditForm.itemIds = batch.batchItems?.map((item) => item.id) || []
}

function cancelPurchaseBatchEdit() {
  editingPurchaseBatchId.value = ''
  purchaseBatchEditForm.purchaseCost = undefined
  purchaseBatchEditForm.supplierName = ''
  purchaseBatchEditForm.deliveryTime = ''
  purchaseBatchEditForm.itemIds = []
}

async function handleSavePurchaseBatchBasicInfo(batch: PurchaseBatch) {
  if (!order.value) {
    return
  }

  if (purchaseBatchEditForm.purchaseCost === undefined || !purchaseBatchEditForm.supplierName) {
    ElMessage.error('Enter the purchase cost and manufacturer')
    return
  }

  if (!purchaseBatchEditForm.itemIds.length) {
    ElMessage.error('Select materials for the purchase package')
    return
  }

  purchaseBatchEditSaving.value = true

  try {
    const { data } = await updatePurchaseBatch(order.value.id, {
      itemIds: purchaseBatchEditForm.itemIds,
      purchaseCost: purchaseBatchEditForm.purchaseCost,
      supplierName: purchaseBatchEditForm.supplierName,
      deliveryTime: purchaseBatchEditForm.deliveryTime || undefined
    }, batch.id)
    ElMessage.success(data.message || 'Purchase Package Details updated')
    cancelPurchaseBatchEdit()
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Purchase Package Details could not be saved')
  } finally {
    purchaseBatchEditSaving.value = false
  }
}

async function loadOrder() {
  const id = String(route.params.id)
  loading.value = true

  try {
    const { data } = await getOrderDetailApi(id)
    order.value = data.order
    fillBusinessForms(data.order)
    batchPurchaseSelection.value = []
    paymentApplicationSelection.value = []
    shippingBatchSelection.value = []
    paymentApplicationTableRef.value?.clearSelection?.()
    shippingBatchTableRef.value?.clearSelection?.()
    hydrateOrderPaymentForm()
  } catch {
    ElMessage.error('Order Details could not be loaded')
    router.push({ name: 'orders' })
  } finally {
    loading.value = false
  }
}

type ItemFileListKey =
  | 'selectedFiles'
  | 'quoteFiles'
  | 'winningContractFiles'
  | 'purchaseContractFiles'
  | 'paymentApplicationFiles'
  | 'productPhotoFiles'
  | 'deliveryPhotoFiles'

function handleItemFileListChange(itemId: string, key: ItemFileListKey, files: UploadFiles) {
  itemBusinessForms[itemId][key] = files.slice(-1)
}

function getItemFileListChangeHandler(itemId: string, key: ItemFileListKey) {
  return (_file: UploadFile, files: UploadFiles) => handleItemFileListChange(itemId, key, files)
}

function handleFileGroupListChange(groupId: string, files: UploadFiles) {
  fileGroupForms[groupId].selectedFiles = files.slice(-1)
}

function getFileGroupListChangeHandler(groupId: string) {
  return (_file: UploadFile, files: UploadFiles) => handleFileGroupListChange(groupId, files)
}

function handleBatchPurchaseFileListChange(_file: UploadFile, files: UploadFiles) {
  batchPurchaseForm.purchaseContractFiles = files.slice(-1)
}

function handleCustomerContractFileChange(_file: UploadFile, files: UploadFiles) {
  customerContractFiles.value = files
}

function handleBatchContractFileListChange(batchId: string, files: UploadFiles) {
  batchContractForms[batchId].selectedFiles = files
}

function getBatchContractListChangeHandler(batchId: string) {
  return (_file: UploadFile, files: UploadFiles) => handleBatchContractFileListChange(batchId, files)
}

function handleBatchShippingDeliveryPhotoChange(_file: UploadFile, files: UploadFiles) {
  batchShippingForm.shippingApplicationFiles = files.slice(-1)
}

async function handleBatchShippingApplicationChange(_file: UploadFile, files: UploadFiles) {
  batchShippingForm.shippingApplicationFiles = files.slice(-1)
  const rawFile = batchShippingForm.shippingApplicationFiles[0]?.raw

  if (!rawFile) {
    batchShippingForm.logisticsCompany = ''
    batchShippingForm.trackingNo = ''
    return
  }

  try {
    const workbook = XLSX.read(await rawFile.arrayBuffer(), { type: 'array', raw: false })
    const rows = workbook.SheetNames.flatMap((sheetName) => (
      XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: ''
      })
    ))
    const fields = extractShippingExcelFields(rows)
    batchShippingForm.logisticsCompany = fields.logisticsCompany
    batchShippingForm.trackingNo = fields.trackingNo

    if (!fields.logisticsCompany || !fields.trackingNo) {
      ElMessage.warning('Excel The carrier or tracking number could not be fully read. Enter it manually.')
    }
  } catch {
    batchShippingForm.logisticsCompany = ''
    batchShippingForm.trackingNo = ''
    ElMessage.error('Could not read the shipping approval workbook. Check the file format.')
  }
}

function handleShippingBatchSelectionChange(selection: PurchaseBatch[]) {
  shippingBatchSelection.value = selection
}

function handleBatchPurchaseSelectionChange(selection: OrderDetailItem[]) {
  batchPurchaseSelection.value = selection.filter((item) => item.currentStatus === 'PURCHASING' && !item.purchaseBatchId)
  recalculateSelectedPurchaseCost()
}

function isBatchPurchaseSelectable(item: OrderDetailItem) {
  return item.currentStatus === 'PURCHASING' && !item.purchaseBatchId && !batchPurchaseSubmitting.value
}

function isDirectPurchasePricingEditable(item: OrderDetailItem) {
  return item.currentStatus === 'PURCHASING' && !item.purchaseBatchId
}

function recalculateSelectedPurchaseCost() {
  batchPurchaseForm.purchaseCost = sumPurchaseTotals(
    batchPurchaseSelection.value.map((item) => purchasePricingDrafts[item.id]?.purchaseTotal)
  )
}

function updatePurchaseQuantity(itemId: string, value: number | undefined) {
  const draft = purchasePricingDrafts[itemId]

  if (!draft) {
    return
  }

  draft.purchaseQuantity = value
  draft.purchaseTotal = calculatePurchaseTotal(value, draft.purchaseUnitPrice)
  recalculateSelectedPurchaseCost()
}

function updatePurchaseUnitPrice(itemId: string, value: number | undefined) {
  const draft = purchasePricingDrafts[itemId]

  if (!draft) {
    return
  }

  draft.purchaseUnitPrice = value
  draft.purchaseTotal = calculatePurchaseTotal(draft.purchaseQuantity, value)
  recalculateSelectedPurchaseCost()
}

function updatePackedPurchaseQuantity(value: number | undefined) {
  purchaseItemEditForm.purchaseQuantity = value
  purchaseItemEditForm.purchaseTotal = calculatePurchaseTotal(value, purchaseItemEditForm.purchaseUnitPrice)
}

function updatePackedPurchaseUnitPrice(value: number | undefined) {
  purchaseItemEditForm.purchaseUnitPrice = value
  purchaseItemEditForm.purchaseTotal = calculatePurchaseTotal(purchaseItemEditForm.purchaseQuantity, value)
}

function buildPurchasePricingPayload(items: OrderDetailItem[]) {
  return items.map((item) => ({
    itemId: item.id,
    purchaseQuantity: purchasePricingDrafts[item.id]?.purchaseQuantity,
    purchaseUnitPrice: purchasePricingDrafts[item.id]?.purchaseUnitPrice,
    purchaseTotal: purchasePricingDrafts[item.id]?.purchaseTotal
  }))
}

async function handleSavePurchasePricing() {
  if (!order.value) {
    return
  }

  const items = batchPurchaseEligibleItems.value

  if (!items.length) {
    ElMessage.error('No materials being purchased are available to save')
    return
  }

  batchPurchasePricingSaving.value = true

  try {
    const { data } = await updatePurchaseItemPricing(order.value.id, {
      items: buildPurchasePricingPayload(items)
    })

    items.forEach((item) => {
      const draft = purchasePricingDrafts[item.id]
      item.purchaseQuantity = draft.purchaseQuantity === undefined ? null : String(draft.purchaseQuantity)
      item.purchaseUnitPrice = draft.purchaseUnitPrice === undefined ? null : String(draft.purchaseUnitPrice)
      item.purchaseTotal = draft.purchaseTotal === undefined ? null : String(draft.purchaseTotal)
    })
    ElMessage.success(data.message || 'Purchased Material Price saved')
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Purchased Material Price could not be saved')
  } finally {
    batchPurchasePricingSaving.value = false
  }
}

function resetBatchPurchaseForm() {
  batchPurchaseForm.purchaseContractFiles = []
  batchPurchaseForm.purchaseCost = undefined
  batchPurchaseForm.supplierName = ''
  batchPurchaseForm.deliveryTime = ''
  purchaseTableRef.value?.clearSelection?.()
}

function resetBatchShippingForm() {
  batchShippingForm.logisticsCompany = ''
  batchShippingForm.trackingNo = ''
  batchShippingForm.remark = ''
  batchShippingForm.shippingApplicationFiles = []
  shippingBatchSelection.value = []
  shippingBatchTableRef.value?.clearSelection?.()
}

function hydrateOrderPaymentForm() {
  const batches = paymentApplicationBatches.value
  const filledBatch = batches.find((batch) => batch.paymentPercent || batch.bankName || batch.bankAccount)
  const paymentPercents = new Set(batches.map((batch) => batch.paymentPercent || '').filter(Boolean))

  paymentApplicationForm.paymentPercent = paymentPercents.size === 1
    ? Number(Array.from(paymentPercents)[0])
    : filledBatch?.paymentPercent ? Number(filledBatch.paymentPercent) : undefined
  paymentApplicationForm.bankName = filledBatch?.bankName || ''
  paymentApplicationForm.bankAccount = filledBatch?.bankAccount || ''
  applyPaymentApplicationDefaults()
}

function handlePaymentApplicationSelectionChange(selection: PurchaseBatch[]) {
  paymentApplicationSelection.value = selection
}

watch(
  [selectedPaymentTotalCost, () => paymentApplicationForm.paymentPercent],
  () => {
    applyPaymentApplicationDefaults()
  }
)

function getBatchShippingApplicationFile(batch: PurchaseBatch) {
  const firstItemId = batch.batchItems?.[0]?.id
  return order.value?.files.find((file) => file.category === 'SHIPPING_APPLICATION' && file.targetId === firstItemId) || null
}

async function uploadSelectedItemBusinessFile(item: Pick<OrderDetailItem, 'id'>, fileType: string, files: UploadFile[]) {
  if (!order.value || !files[0]?.raw) {
    return undefined
  }

  const { data } = await uploadOrderItemFile(order.value.id, item.id, fileType, files[0].raw)
  return data.file.id
}

async function handleCustomerContractUpload() {
  if (!order.value) {
    return
  }

  const selectedFiles = customerContractFiles.value.filter((file) => file.raw)

  if (!selectedFiles.length) {
    ElMessage.error('Select a customer contract to upload')
    return
  }

  customerContractUploading.value = true

  try {
    await Promise.all(selectedFiles.map((selectedFile) => {
      const formData = new FormData()
      formData.append('category', 'BID_CONTRACT')
      formData.append('file', selectedFile.raw!)
      return uploadOrderFileApi(order.value!.id, formData)
    }))
    ElMessage.success(`Uploaded ${selectedFiles.length}  customer contracts`)
    customerContractFiles.value = []
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Customer Contract could not be uploaded')
  } finally {
    customerContractUploading.value = false
  }
}

async function handleFileGroupUpload(group: AttachmentGroup) {
  if (!order.value) {
    return
  }

  const form = fileGroupForms[group.id]

  if (!form?.targetItemId) {
    ElMessage.error('Select Associated Material')
    return
  }

  const selectedFile = form.selectedFiles[0]

  if (!selectedFile?.raw) {
    ElMessage.error('Select a file to upload')
    return
  }

  const formData = new FormData()
  formData.append('category', form.fileCategory)
  formData.append('file', selectedFile.raw)
  fileUploadingId.value = form.targetItemId

  try {
    const { data } = await uploadOrderItemFileApi(order.value.id, form.targetItemId, formData)
    ElMessage.success(data.message)
    form.selectedFiles = []
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'File could not be uploaded')
  } finally {
    fileUploadingId.value = ''
  }
}

async function handleSaveItemQuote(item: OrderDetailItem) {
  if (!order.value) {
    return
  }

  const form = itemBusinessForms[item.id]

  if (!form.quote.supplierName || form.quote.quotedPrice === undefined) {
    ElMessage.error('Enter the supplier name and quote')
    return
  }

  businessSubmittingId.value = item.id

  try {
    const quoteFileId = await uploadSelectedItemBusinessFile(item, 'SUPPLIER_QUOTE_FILE', form.quoteFiles)
    await updateItemQuoteInfo(order.value.id, item.id, {
      ...form.quote,
      quoteFileId
    })
    ElMessage.success('Supplier Quote added')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Supplier Quote could not be saved')
  } finally {
    businessSubmittingId.value = ''
  }
}

async function handleQuoteSelectionChange(item: OrderDetailItem, quote: OrderSupplierQuote, isSelected: boolean) {
  if (!order.value) {
    return
  }

  quoteSelectingId.value = quote.id

  try {
    const { data } = await updateItemQuoteSelection(order.value.id, item.id, quote.id, isSelected)
    ElMessage.success(data.message)
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Quote Selection Status could not be updated')
  } finally {
    quoteSelectingId.value = ''
  }
}

async function handleApproveItemStatus(item: OrderDetailItem, status: string, successMessage: string) {
  if (!order.value) {
    return
  }

  itemStatusSubmittingId.value = item.id

  try {
    await updateOrderItemStatusApi(order.value.id, item.id, {
      status,
      note: successMessage
    })
    ElMessage.success(successMessage)
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Approval failed')
  } finally {
    itemStatusSubmittingId.value = ''
  }
}

async function handleSaveItemPurchase(item: OrderDetailItem, nextStatus?: string) {
  if (!order.value) {
    return
  }

  const form = itemBusinessForms[item.id]
  businessSubmittingId.value = item.id

  try {
    const purchaseContractFileId = await uploadSelectedItemBusinessFile(item, 'PURCHASE_CONTRACT', form.purchaseContractFiles)
    const paymentApplicationFileId = await uploadSelectedItemBusinessFile(item, 'PAYMENT_APPLICATION', form.paymentApplicationFiles)
    await updateItemPurchaseInfo(order.value.id, item.id, {
      ...form.purchase,
      purchaseContractFileId,
      paymentApplicationFileId
    })
    if (nextStatus) {
      await updateOrderItemStatusApi(order.value.id, item.id, {
        status: nextStatus,
        note: 'Submitted Payment Request'
      })
    }

    ElMessage.success(nextStatus ? 'Payment request submitted for management approval' : 'Purchase Details saved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Purchase Details could not be saved')
  } finally {
    businessSubmittingId.value = ''
  }
}

async function handleBatchPurchaseSubmit() {
  if (!order.value) {
    return
  }

  const items = batchPurchaseSelection.value.filter((item) => item.currentStatus === 'PURCHASING' && !item.purchaseBatchId)

  if (!items.length) {
    ElMessage.error('Select materials to group for purchase first')
    return
  }

  if (batchPurchaseForm.purchaseCost === undefined || !batchPurchaseForm.supplierName) {
    ElMessage.error('Enter the purchase cost and manufacturer')
    return
  }

  batchPurchaseSubmitting.value = true

  try {
    const purchaseContractFileId = await uploadSelectedItemBusinessFile(items[0], 'PURCHASE_CONTRACT', batchPurchaseForm.purchaseContractFiles)
    await updatePurchaseBatch(order.value.id, {
      itemIds: items.map((item) => item.id),
      itemPricing: buildPurchasePricingPayload(items),
      purchaseCost: batchPurchaseForm.purchaseCost,
      supplierName: batchPurchaseForm.supplierName,
      deliveryTime: batchPurchaseForm.deliveryTime,
      purchaseContractFileId
    })

    ElMessage.success(`Saved ${items.length} purchase packages. Continue with the payment request`)
    resetBatchPurchaseForm()
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Grouped Purchase Request could not be submitted')
  } finally {
    batchPurchaseSubmitting.value = false
  }
}

async function handleUploadBatchContracts(batch: PurchaseBatch) {
  if (!order.value) {
    return
  }

  const firstItem = batch.batchItems?.[0]
  const form = batchContractForms[batch.id]
  const files = (form?.selectedFiles || []).filter((file) => file.raw)

  if (!firstItem) {
    ElMessage.error('Cannot upload a contract to an empty purchase package')
    return
  }

  if (!files.length) {
    ElMessage.error('Select a contract file to upload first')
    return
  }

  contractUploadingBatchId.value = batch.id

  try {
    await Promise.all(files.map((file) => uploadSelectedItemBusinessFile(firstItem, 'PURCHASE_CONTRACT', [file])))
    ElMessage.success(`Uploaded ${files.length}  purchase contracts`)
    form.selectedFiles = []
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Purchase Contract could not be uploaded')
  } finally {
    contractUploadingBatchId.value = ''
  }
}

async function handleDeleteOrderFile(file: DownloadableOrderFile, label = 'File') {
  try {
    await ElMessageBox.confirm(`Confirm deletion${label} ${file.originalName} ?`, `Delete${label}`, {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning'
    })
  } catch {
    return
  }

  deletingFileId.value = file.id

  try {
    const { data } = await deleteOrderFileApi(file.id)
    ElMessage.success(data.message || `${label} deleted`)
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || `${label} could not be deleted`)
  } finally {
    deletingFileId.value = ''
  }
}

function canApprovePurchaseBatch(batch: PurchaseBatch) {
  const batchItems = batch.batchItems || []
  return canManageOrders.value && batchItems.length > 0 && batchItems.every((item) => item.currentStatus === 'PURCHASE_PAYMENT')
}

async function handleApprovePurchaseBatch(batchId: string) {
  if (!order.value) {
    return
  }

  approvingPurchaseBatchId.value = batchId

  try {
    const { data } = await approvePurchaseBatch(order.value.id, batchId)
    ElMessage.success(data.message || 'Payment request approved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Payment Request could not be approved')
  } finally {
    approvingPurchaseBatchId.value = ''
  }
}

async function handleRejectPurchaseBatch(batchId: string) {
  if (!order.value) {
    return
  }

  rejectingPurchaseBatchId.value = batchId

  try {
    const { data } = await rejectPurchaseBatch(order.value.id, batchId)
    ElMessage.success(data.message || 'Payment request rejected')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Payment Request could not be rejected')
  } finally {
    rejectingPurchaseBatchId.value = ''
  }
}

async function handleSavePaymentApplication() {
  if (!order.value) {
    return
  }

  const batches = paymentApplicationSelection.value.filter((batch) => canSelectPaymentApplicationBatch(batch))

  if (!batches.length) {
    ElMessage.error('Select purchase packages for payment first')
    return
  }

  if (paymentApplicationForm.paymentPercent === undefined || !paymentApplicationForm.bankName || !paymentApplicationForm.bankAccount) {
    ElMessage.error('Enter the payment percentage, bank, and account number')
    return
  }

  const exceededBatch = batches.find((batch) => !isPaymentPercentWithinRemaining(
    Number(paymentApplicationForm.paymentPercent || 0),
    getRemainingPaymentPercent(batch)
  ))

  if (exceededBatch) {
    ElMessage.error(`${exceededBatch.supplierName || 'Selected Group'} Remaining Requestable Amount ${formatPercent(getRemainingPaymentPercent(exceededBatch))}`)
    return
  }

  paymentApplicationSubmitting.value = true

  try {
    await Promise.all(batches.map((batch) => updatePurchaseBatch(order.value!.id, {
      itemIds: batch.batchItems?.map((item) => item.id) || [],
      purchaseCost: Number(batch.purchaseCost || 0),
      paymentPercent: paymentApplicationForm.paymentPercent,
      advancePaymentAmount: paymentApplicationForm.advancePaymentAmount,
      arrivalPaymentAmount: paymentApplicationForm.arrivalPaymentAmount,
      bankName: paymentApplicationForm.bankName,
      bankAccount: paymentApplicationForm.bankAccount,
      paymentRemark: paymentApplicationForm.remark,
      submitForApproval: true
    }, batch.id)))

    ElMessage.success('Selected payment requests were submitted for management approval')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Payment Request could not be saved')
  } finally {
    paymentApplicationSubmitting.value = false
  }
}

async function handleExportPaymentApplication() {
  if (!order.value) {
    return
  }

  exportingPaymentApplication.value = true

  try {
    const { data } = await exportOrderPaymentApplicationApi(order.value.id)
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${order.value.orderNo.replace(/[\\/:*?"<>|]/g, '_')}-Order Payment Request.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('Payment Request could not be exported')
  } finally {
    exportingPaymentApplication.value = false
  }
}

async function handleBatchShippingSubmit() {
  if (!order.value) {
    return
  }

  const batches = shippingBatchSelection.value.filter((batch) => {
    const items = batch.batchItems || []
    return items.length > 0 && items.every((item) => item.currentStatus === 'SHIPPED_TO_CUSTOMER')
  })

  if (!batches.length) {
    ElMessage.error('Select purchase packages to ship first')
    return
  }

  const rawFile = batchShippingForm.shippingApplicationFiles[0]?.raw
  if (!rawFile) {
    ElMessage.error('Upload Shipping Approval Excel')
    return
  }

  if (!batchShippingForm.logisticsCompany || !batchShippingForm.trackingNo) {
    ElMessage.error('Enter the carrier and tracking number')
    return
  }

  batchShippingSubmitting.value = true
  let uploadedFileId = ''

  try {
    const formData = new FormData()
    formData.append('fileType', 'SHIPPING_APPLICATION')
    formData.append('file', rawFile)
    const { data: fileData } = await uploadOrderFileApi(order.value.id, formData)
    uploadedFileId = fileData.file.id
    const { data } = await createShippingApplication(order.value.id, {
      batchIds: batches.map((batch) => batch.id),
      fileId: fileData.file.id,
      logisticsCompany: batchShippingForm.logisticsCompany,
      trackingNo: batchShippingForm.trackingNo,
      remark: batchShippingForm.remark || undefined
    })

    ElMessage.success(data.message || `Submitted ${batches.length}  purchase packages awaiting management approval`)
    resetBatchShippingForm()
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>

    if (uploadedFileId && axiosError.response && axiosError.response.status < 500) {
      try {
        await deleteOrderFileApi(uploadedFileId)
      } catch {
        // The attachment center keeps the file when cleanup cannot be confirmed safely.
      }
    }

    ElMessage.error(axiosError.response?.data?.message || 'Grouped Shipping Request could not be submitted')
  } finally {
    batchShippingSubmitting.value = false
  }
}

async function handleApproveGroupedShippingApplication(applicationId: string) {
  if (!order.value) {
    return
  }

  approvingShippingApplicationId.value = applicationId

  try {
    const { data } = await approveShippingApplication(order.value.id, applicationId)
    ElMessage.success(data.message || 'Shipping requests for the selected packages were approved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Shipping Request could not be approved')
  } finally {
    approvingShippingApplicationId.value = ''
  }
}

async function handleRejectGroupedShippingApplication(applicationId: string) {
  if (!order.value) {
    return
  }

  rejectingShippingApplicationId.value = applicationId

  try {
    const { data } = await rejectShippingApplication(order.value.id, applicationId)
    ElMessage.success(data.message || 'Shipping requests for the selected packages were rejected')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Shipping Request could not be rejected')
  } finally {
    rejectingShippingApplicationId.value = ''
  }
}

async function handleApproveShippingBatch(batchId: string) {
  if (!order.value) {
    return
  }

  const batch = purchaseBatches.value.find((item) => item.id === batchId)
  const batchItems = batch?.batchItems?.filter((item) => item.currentStatus === 'ARRIVED_COMPANY') || []

  if (!batchItems.length) {
    ElMessage.error('This purchase package has no materials awaiting shipping approval')
    return
  }

  approvingShippingBatchId.value = batchId

  try {
    for (const batchItem of batchItems) {
      await updateOrderItemStatusApi(order.value.id, batchItem.id, {
        status: 'CUSTOMER_PAID',
        note: 'Grouped shipping request approved'
      })
    }

    ElMessage.success('Grouped shipping request approved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Could not approve grouped shipping request')
  } finally {
    approvingShippingBatchId.value = ''
  }
}

async function handleSaveItemDelivery(item: OrderDetailItem, nextStatus?: string) {
  if (!order.value) {
    return
  }

  const form = itemBusinessForms[item.id]
  businessSubmittingId.value = item.id

  try {
    const productPhotoFileId = await uploadSelectedItemBusinessFile(item, 'PRODUCT_PHOTO', form.productPhotoFiles)
    const deliveryPhotoFileId = await uploadSelectedItemBusinessFile(item, 'DELIVERY_PHOTO', form.deliveryPhotoFiles)
    await updateItemDeliveryInfo(order.value.id, item.id, {
      ...form.delivery,
      productPhotoFileId,
      deliveryPhotoFileId
    })
    if (nextStatus) {
      await updateOrderItemStatusApi(order.value.id, item.id, {
        status: nextStatus,
        note: 'Submitted Shipping Request'
      })
    }

    ElMessage.success(nextStatus ? 'Shipping request submitted for management approval' : 'Shipping Details saved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Shipping Details could not be saved')
  } finally {
    businessSubmittingId.value = ''
  }
}

async function handleSaveCustomerPayment() {
  if (!order.value) {
    return
  }

  const paidAmount = Number(customerPaymentForm.paidAmount)
  const validationError = getPaymentDraftError(paidAmount, customerPaymentOrderTotal.value)

  if (validationError) {
    ElMessage.error(validationError)
    return
  }

  customerPaymentSaving.value = true

  try {
    const { data } = await updateCustomerPayment(order.value.id, {
      customerPaymentStatus: paidAmount > 0 ? 'PAID' : 'UNPAID',
      customerPaymentAmount: paidAmount,
      paidAt: customerPaymentForm.paidAt || undefined,
      remark: customerPaymentForm.remark || undefined
    })
    ElMessage.success(data.message || 'Customer payment details saved')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Could not save customer payment details')
  } finally {
    customerPaymentSaving.value = false
  }
}

async function handleExportShippingApplication() {
  if (!order.value) {
    return
  }

  const batchIds = shippingBatchSelection.value.map((batch) => batch.id)

  if (!batchIds.length) {
    ElMessage.error('Select purchase packages to export under Shipping Details first')
    return
  }

  exportingShipping.value = true

  try {
    const { data } = await exportShippingApplicationApi(order.value.id, batchIds)
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${order.value.orderNo.replace(/[\\/:*?"<>|]/g, '_')}-Shipping Request.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('Shipping Request could not be exported')
  } finally {
    exportingShipping.value = false
  }
}

async function handleExportPurchaseContract() {
  if (!order.value) {
    return
  }

  exportingPurchaseContract.value = true

  try {
    const { data } = await exportPurchaseContractApi(order.value.id)
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${order.value.orderNo.replace(/[\\/:*?"<>|]/g, '_')}-Purchase Contract.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('Could not export purchase contract')
  } finally {
    exportingPurchaseContract.value = false
  }
}

async function handleDeleteOrder() {
  if (!order.value) {
    return
  }

  try {
    await ElMessageBox.confirm(`Delete order ${order.value.orderNo} ? This cannot be undone.`, 'Delete Order', {
      type: 'warning',
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    })
  } catch {
    return
  }

  deletingOrder.value = true

  try {
    const { data } = await deleteOrderApi(order.value.id)
    ElMessage.success(data.message)
    router.push({ name: 'orders' })
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Order could not be deleted')
  } finally {
    deletingOrder.value = false
  }
}

function validateItemBusinessInfoForStatus(item: OrderDetailItem) {
  void item
  return true
}

async function handleBatchStatusSubmit() {
  if (!order.value) {
    return
  }

  if (!batchNextStatus.value) {
    ElMessage.error('Select Next Status')
    return
  }

  const items = order.value.items.filter((item) => {
    return item.currentStatus === batchCurrentStatus.value && getItemNextStatusOptions(item).some((option) => option.value === batchNextStatus.value)
  })

  if (!items.length) {
    ElMessage.error('No materials are available for a status change')
    return
  }

  batchStatusSubmitting.value = true

  try {
    for (const item of items) {
      await updateOrderItemStatusApi(order.value.id, item.id, {
        status: batchNextStatus.value,
        note: batchStatusNote.value
      })
    }

    ElMessage.success('Order moved to the next step')
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Could not update order status')
  } finally {
    batchStatusSubmitting.value = false
  }
}

async function saveItemBusinessInfoForStatus(item: OrderDetailItem) {
  if (!order.value) {
    return
  }

  const form = itemBusinessForms[item.id]
  const statusForm = itemStatusForms[item.id]

  if (item.currentStatus === 'INQUIRY' && form.quote.supplierName && form.quote.quotedPrice !== undefined) {
    const quoteFileId = await uploadSelectedItemBusinessFile(item, 'SUPPLIER_QUOTE_FILE', form.quoteFiles)
    await updateItemQuoteInfo(order.value.id, item.id, {
      ...form.quote,
      quoteFileId
    })
  }

  if (item.currentStatus === 'QUOTED') {
    await updateItemBidInfo(order.value.id, item.id, { bidPrice: form.quote.quotedPrice })

    if (statusForm?.status === 'BID_WON') {
      await uploadSelectedItemBusinessFile(item, 'WINNING_CONTRACT', form.winningContractFiles)
    }
  }

  if (item.currentStatus === 'BID_WON' || item.currentStatus === 'BID_LOST') {
    if (item.currentStatus === 'BID_WON') {
      await uploadSelectedItemBusinessFile(item, 'WINNING_CONTRACT', form.winningContractFiles)
    }

    await updateItemWinningInfo(order.value.id, item.id, {
      result: statusForm?.lostReason ? 'LOST' : 'WON',
      winningPrice: statusForm?.winningPrice,
      lostReason: statusForm?.lostReason
    })
  }

  if (item.currentStatus === 'PURCHASING' || item.currentStatus === 'PURCHASE_PAYMENT') {
    const purchaseContractFileId = await uploadSelectedItemBusinessFile(item, 'PURCHASE_CONTRACT', form.purchaseContractFiles)
    const paymentApplicationFileId = await uploadSelectedItemBusinessFile(item, 'PAYMENT_APPLICATION', form.paymentApplicationFiles)
    await updateItemPurchaseInfo(order.value.id, item.id, {
      ...form.purchase,
      purchaseContractFileId,
      paymentApplicationFileId
    })
  }

  if (['SUPPLIER_SHIPPED', 'ARRIVED_COMPANY', 'SHIPPED_TO_CUSTOMER'].includes(item.currentStatus)) {
    const productPhotoFileId = await uploadSelectedItemBusinessFile(item, 'PRODUCT_PHOTO', form.productPhotoFiles)
    const deliveryPhotoFileId = await uploadSelectedItemBusinessFile(item, 'DELIVERY_PHOTO', form.deliveryPhotoFiles)
    await updateItemDeliveryInfo(order.value.id, item.id, {
      ...form.delivery,
      productPhotoFileId,
      deliveryPhotoFileId
    })
  }

}

async function handleItemStatusSubmit(item: OrderDetailItem) {
  if (!order.value) {
    return
  }

  const form = itemStatusForms[item.id]

  if (!form?.status) {
    ElMessage.error('Select New Status')
    return
  }

  if (form.status === item.currentStatus) {
    ElMessage.error('The new status must differ from the current status')
    return
  }

  if (form.status === 'BID_LOST' && !form.lostReason) {
    ElMessage.error('Enter the reason for losing the bid')
    return
  }

  if (!validateItemBusinessInfoForStatus(item)) {
    return
  }

  itemStatusSubmittingId.value = item.id

  try {
    await saveItemBusinessInfoForStatus(item)
    const { data } = await updateOrderItemStatusApi(order.value.id, item.id, {
      status: form.status,
      note: form.note,
      winningPrice: form.winningPrice,
      lostReason: form.lostReason
    })

    ElMessage.success(data.message)
    await loadOrder()
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>
    ElMessage.error(axiosError.response?.data?.message || 'Material Status could not be updated')
  } finally {
    itemStatusSubmittingId.value = ''
  }
}

onMounted(loadOrder)
</script>
