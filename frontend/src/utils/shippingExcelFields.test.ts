import assert from 'node:assert/strict'
import test from 'node:test'

type ShippingExcelModule = {
  extractShippingExcelFields: (rows: unknown[][]) => {
    logisticsCompany: string
    trackingNo: string
  }
}

async function loadParser() {
  try {
    return await import('./shippingExcelFields') as ShippingExcelModule
  } catch {
    return {} as Partial<ShippingExcelModule>
  }
}

test('reads carrier and tracking number from the cells after their labels', async () => {
  const parser = await loadParser()
  assert.equal(typeof parser.extractShippingExcelFields, 'function')

  const result = parser.extractShippingExcelFields!([
    ['各物流/快递公司预计运费金额：', '顺丰：63元'],
    [],
    ['物流/快递公司：', '顺丰 ', '运单号：', 'SF1564406303516']
  ])

  assert.deepEqual(result, {
    logisticsCompany: '顺丰',
    trackingNo: 'SF1564406303516'
  })
})

test('supports moved labels, English colons, whitespace and blank cells', async () => {
  const parser = await loadParser()
  assert.equal(typeof parser.extractShippingExcelFields, 'function')

  const result = parser.extractShippingExcelFields!([
    ['其他', null, '  运单号:  ', '', null, 'YT123456'],
    ['  物流 / 快递公司 : ', null, '圆通']
  ])

  assert.deepEqual(result, {
    logisticsCompany: '圆通',
    trackingNo: 'YT123456'
  })
})

test('returns empty fields instead of guessing when exact labels are absent', async () => {
  const parser = await loadParser()
  assert.equal(typeof parser.extractShippingExcelFields, 'function')

  const result = parser.extractShippingExcelFields!([
    ['各物流/快递公司预计运费金额：', '中通：50元'],
    ['快递单', 'ABC123']
  ])

  assert.deepEqual(result, {
    logisticsCompany: '',
    trackingNo: ''
  })
})

test('imports English shipping request labels after an XLSX round trip', async () => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Carrier:', 'Example Carrier', 'Tracking No.:', 'TRACK-123']
  ]), 'Shipping Request')
  const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(reopened.Sheets['Shipping Request'], { header: 1 })
  assert.deepEqual((await loadParser()).extractShippingExcelFields!(rows), { logisticsCompany: 'Example Carrier', trackingNo: 'TRACK-123' })
})
