import { findFirstValueBelowHeader } from './orderExcelFields'

const inquiryCompanyLabels = [
  'Customer',
  'Customer Name',
  'Inquiry Company',
  '需求单位',
  '需求公司',
  '客户',
  '客户名称',
  '需求方',
  '使用单位',
  '公司名称',
  '询价公司'
]

export function findInquiryCompanyBelowHeader<T>(rows: T[][], headerIndex: number) {
  return findFirstValueBelowHeader(rows, headerIndex, inquiryCompanyLabels)
}
