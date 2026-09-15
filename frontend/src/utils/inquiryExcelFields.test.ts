import assert from 'node:assert/strict'
import test from 'node:test'

import { findInquiryCompanyBelowHeader } from './inquiryExcelFields'

test('reads the inquiry company below the demand-company header', () => {
  const rows = [
    ['', 'id', 'itemStatus'],
    ['', 'XBJ202607020072-紫金山铜矿'],
    ['', '需求公司', '物料编码', '物料描述'],
    ['', '紫金山铜矿', '7010021303', '小型可编程逻辑控制器']
  ]

  assert.equal(findInquiryCompanyBelowHeader(rows, 2), '紫金山铜矿')
})

test('supports the demand-unit header used by newer inquiry sheets', () => {
  const rows = [
    ['需求单位', '物料编码', '物料描述'],
    ['中国科学器材有限公司', '7010021303', '逻辑控制器']
  ]

  assert.equal(findInquiryCompanyBelowHeader(rows, 0), '中国科学器材有限公司')
})
