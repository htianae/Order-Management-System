import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findFirstValueBelowHeader,
  findOrderInquiryCompanyBelowHeader,
  findOrderNumberFromRows
} from './orderExcelFields'

test('reads the company below the demand-company column header', () => {
  const rows = [
    ['', 'id', 'itemStatus'],
    ['', 'XBJ202607020072-紫金山铜矿'],
    ['', '需求公司', '物料编码', '物料描述'],
    ['', '紫金山铜矿', '7010021303', '小型可编程逻辑控制器']
  ]

  assert.equal(
    findFirstValueBelowHeader(rows, 2, ['需求公司', '需求单位', '公司名称', '询价公司']),
    '紫金山铜矿'
  )
})

test('returns empty when the requested column is not present', () => {
  assert.equal(findFirstValueBelowHeader([['物料编码'], ['701']], 0, ['需求公司']), '')
})

test('reads the company dynamically below a demand-company-name header', () => {
  const rows = [
    ['id', 'requireCompanyName', 'materialNumber'],
    ['', 'XBJ202606120270-蓝伟鹏-仪表采购方案-6月13日询价'],
    ['', '需求公司名称', '物料编码'],
    ['', '新疆紫金有色金属有限公司', '7010020546']
  ]

  assert.equal(findOrderInquiryCompanyBelowHeader(rows, 2), '新疆紫金有色金属有限公司')
})

test('extracts an XBJ order number from the workbook title before the material header', () => {
  const rows = [
    ['id', 'requireCompanyName', 'materialNumber'],
    ['', 'XBJ202606120270-蓝伟鹏-仪表采购方案-6月13日询价 2026-06-15 19点12截止'],
    ['', '需求公司名称', '物料编码']
  ]

  assert.equal(findOrderNumberFromRows(rows, 2), 'XBJ202606120270')
})
