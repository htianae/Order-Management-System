import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  buildShippingApplicationWorkbook,
  ShippingApplicationFieldConflictError,
  type ShippingApplicationWorkbookInput,
  type ShippingApplicationWorkbookItem
} from './shippingApplicationWorkbook.js'

const templatePath = fileURLToPath(
  new URL('../../templates/shipping-application-template.xlsx', import.meta.url)
)

const allowedTemplateLabels = new Set([
  'Shipping Request',
  'Shipping Date:',
  'Customer',
  'Contract Amount (CNY)',
  'Weight',
  'Packages',
  'Dimensions (cm)',
  'Notes',
  'Contract No.',
  'Salesperson',
  'Goods Name',
  'Supplier / Brand',
  'Quantity',
  'Delivery Date',
  'Wooden Crate Required:',
  'Crate Cost (CNY):',
  'Crate Freight (CNY):',
  'Origin / Destination:',
  'Transfer Required:',
  'Transfer Carrier:',
  'Transfer Cost (CNY):',
  'Billing Weight (kg):',
  'Estimated Freight (CNY):',
  'Carrier:',
  'Tracking No.:',
  'Applicant:',
  'Approver:'
])

const forbiddenSourceValues = [
  '多宝山',
  '2371/4500981670',
  '刘志野',
  '低压滤芯',
  '固安县费欧特/国产配件',
  '170公斤',
  '5件',
  '0.8立方',
  '固安县-嫩江',
  '预估50元',
  '厂家直接发到嫩江',
  '顺心捷达',
  '鸿利物流',
  'S71982313129'
]

function item(
  id: string,
  lineNo: number,
  overrides: Partial<ShippingApplicationWorkbookItem> = {}
): ShippingApplicationWorkbookItem {
  return {
    id,
    lineNo,
    materialDescription: `物料 ${lineNo}`,
    manufacturer: '物料厂家',
    quantity: new Prisma.Decimal('2'),
    taxIncludedTotal: new Prisma.Decimal('20.50'),
    purchaseSupplierName: '采购厂家',
    purchaseQuantity: new Prisma.Decimal('2'),
    itemDeliveryTime: '2026-10-01',
    purchaseDeliveryTime: '2026-10-02',
    shippingInfo: null,
    ...overrides
  }
}

function input(items: ShippingApplicationWorkbookItem[]): ShippingApplicationWorkbookInput {
  return {
    orderNo: 'ORDER-1',
    inquiryCompany: '测试询价公司',
    creatorName: '订单创建人',
    exportedByName: '当前导出人',
    items
  }
}

function cellString(value: ExcelJS.CellValue): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('')
  }
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text
  }
  return null
}

function workbookStrings(workbook: ExcelJS.Workbook) {
  const strings: string[] = []

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cellString(cell.value)
        if (value !== null && value !== '') {
          strings.push(value)
        }
      })
    })
  })

  return strings
}

function workbookNoteAddresses(workbook: ExcelJS.Workbook) {
  const addresses: string[] = []

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.note !== null && cell.note !== undefined) {
          addresses.push(`${sheet.name}!${cell.address}`)
        }
      })
    })
  })

  return addresses
}

function assertOnlyAllowedTemplateCellValues(workbook: ExcelJS.Workbook) {
  let valueCount = 0

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.master.address !== cell.address || cell.value === null || cell.value === '') {
          return
        }

        valueCount += 1
        const value = cellString(cell.value)
        assert.notEqual(value, null, `Unexpected non-text value at ${sheet.name}!${cell.address}`)
        assert.ok(
          allowedTemplateLabels.has(value!),
          `Unexpected template value at ${sheet.name}!${cell.address}: ${value}`
        )
      })
    })
  })

  assert.ok(valueCount > 0)
}

function findLabelCell(sheet: ExcelJS.Worksheet, label: string) {
  let found: ExcelJS.Cell | undefined

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!found && cell.master.address === cell.address && cell.value === label) {
        found = cell
      }
    })
  })

  assert.ok(found, `Missing label: ${label}`)
  return found
}

function mergedRangeAt(sheet: ExcelJS.Worksheet, address: string) {
  const cell = sheet.getCell(address)
  const merges = (sheet as ExcelJS.Worksheet & {
    _merges: Record<string, { range: string }>
  })._merges

  assert.equal(cell.isMerged, true, `${address} should remain merged`)
  return merges[cell.master.address]?.range
}

function assertNoSourceText(text: string, location: string) {
  forbiddenSourceValues.forEach((value) => {
    assert.equal(text.includes(value), false, `Source value leaked in ${location}: ${value}`)
  })
}

async function assertSanitizedTemplatePackage() {
  const archive = await JSZip.loadAsync(await readFile(templatePath))
  const entryNames = Object.keys(archive.files)
  const annotationEntries = entryNames.filter((name) => /comments/i.test(name))
  const vmlEntries = entryNames.filter((name) => /(?:^|\/)vmlDrawing|\.vml$/i.test(name))

  assert.deepEqual(annotationEntries, [], 'Template package still contains comment parts')
  assert.deepEqual(vmlEntries, [], 'Template package still contains VML parts')

  const xmlEntries = entryNames.filter((name) =>
    !archive.files[name].dir && /\.(?:xml|rels|vml)$/i.test(name)
  )
  const packageText = (await Promise.all(
    xmlEntries.map((name) => archive.files[name].async('string'))
  )).join('\n')

  assert.equal(/<legacyDrawing\b/i.test(packageText), false, 'Template retains a legacy note drawing')
  assert.equal(
    /relationships\/vmlDrawing|Target="[^"]*\.vml"/i.test(packageText),
    false,
    'Template retains a VML relationship'
  )
  assertNoSourceText(packageText, 'XLSX package XML')
}

test('sanitized template retains the new labels without example business data', async () => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const sheet = workbook.getWorksheet('Shipping Request')

  assert.ok(sheet)
  assert.equal(sheet.getCell('A1').value, 'Shipping Request')
  assert.equal(sheet.getCell('A4').value, 'Contract No.')
  assert.equal(sheet.getCell('F4').value, 'Delivery Date')
  assert.equal(sheet.getCell('A8').value, 'Wooden Crate Required:')
  assert.equal(sheet.getCell('A13').value, 'Carrier:')
  assertOnlyAllowedTemplateCellValues(workbook)
  assert.deepEqual(workbookNoteAddresses(workbook), [])
  assertNoSourceText(workbookStrings(workbook).join('\n'), 'workbook cells')
  await assertSanitizedTemplatePackage()
})

test('uses the default template and keeps dynamic material rows after disk round-trip', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'shipping-application-workbook-'))
  t.after(async () => rm(directory, { recursive: true, force: true }))

  for (const itemCount of [1, 3, 5, 25]) {
    const workbook = await buildShippingApplicationWorkbook(input(
      Array.from({ length: itemCount }, (_, index) => item(`item-${index + 1}`, index + 1))
    ))
    const outputPath = join(directory, `shipping-${itemCount}.xlsx`)
    await workbook.xlsx.writeFile(outputPath)

    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.readFile(outputPath)
    const sheet = reopened.getWorksheet('Shipping Request')!
    const lowerSectionRow = 5 + itemCount

    assert.equal(sheet.rowCount, itemCount + 11)
    assert.equal(sheet.getCell('A5').value, 'ORDER-1')
    assert.equal(sheet.getCell('C5').value, '物料 1')
    assert.equal(sheet.getCell(`C${4 + itemCount}`).value, `物料 ${itemCount}`)
    assert.equal(findLabelCell(sheet, 'Wooden Crate Required:').row, lowerSectionRow)
    assert.equal(mergedRangeAt(sheet, `B${lowerSectionRow + 2}`), `B${lowerSectionRow + 2}:C${lowerSectionRow + 2}`)
    assert.equal(mergedRangeAt(sheet, `A${lowerSectionRow + 3}`), `A${lowerSectionRow + 3}:A${lowerSectionRow + 4}`)
    assert.equal(mergedRangeAt(sheet, `D${lowerSectionRow + 5}`), `D${lowerSectionRow + 5}:F${lowerSectionRow + 5}`)
    assert.equal(mergedRangeAt(sheet, `D${lowerSectionRow + 6}`), `D${lowerSectionRow + 6}:F${lowerSectionRow + 6}`)
  }
})

test('maps selected material, purchase and shared shipping fields into the new template', async () => {
  const shippingDate = new Date(2026, 7, 17)
  const expectedDeliveryDate = new Date(2026, 8, 11)
  const workbook = await buildShippingApplicationWorkbook(input([
    item('item-2', 20, {
      materialDescription: '第二项',
      manufacturer: '品牌 B',
      purchaseSupplierName: '供应商 B',
      purchaseQuantity: new Prisma.Decimal('3'),
      winningAmount: null,
      taxIncludedTotal: new Prisma.Decimal('30'),
      shippingInfo: {
        contractNo: 'CONTRACT-2',
        salesperson: '业务员 B',
        goodsName: '发货名称 B',
        supplierBrand: '供货单位 B',
        shippingQuantity: '3',
        expectedDeliveryDate
      }
    }),
    item('item-1', 10, {
      materialDescription: '第一项',
      manufacturer: '物料厂家',
      purchaseSupplierName: '采购厂家',
      purchaseQuantity: new Prisma.Decimal('2'),
      winningAmount: new Prisma.Decimal('20.50'),
      taxIncludedTotal: new Prisma.Decimal('99'),
      shippingInfo: {
        shippingDate,
        weight: '170公斤',
        packageCount: '5件',
        packageSize: '0.8立方',
        remark: '加急',
        needsWoodenBox: false,
        woodenBoxPrice: '无',
        woodenBoxFreight: '无',
        route: '固安县-嫩江',
        needsTransfer: true,
        transferLogistics: '鸿利物流',
        estimatedTransferPrice: '预估50元',
        billingWeight: '170公斤',
        freightEstimate: '厂家直接发到嫩江',
        customerLogisticsCompany: '顺心捷达',
        customerTrackingNo: 'S71982313129'
      }
    })
  ]))
  const sheet = workbook.getWorksheet('Shipping Request')!
  const lowerSectionRow = 7

  assert.equal(sheet.getCell('F1').value, '2026.8.17')
  assert.equal(sheet.getCell('A3').value, '测试询价公司')
  assert.equal(sheet.getCell('B3').value, 50.5)
  assert.equal(sheet.getCell('C3').value, '170公斤')
  assert.equal(sheet.getCell('D3').value, '5件')
  assert.equal(sheet.getCell('E3').value, '0.8立方')
  assert.equal(sheet.getCell('F3').value, '加急')

  assert.equal(sheet.getCell('A5').value, 'ORDER-1')
  assert.equal(sheet.getCell('B5').value, '订单创建人')
  assert.equal(sheet.getCell('C5').value, '第一项')
  assert.equal(sheet.getCell('D5').value, '采购厂家/物料厂家')
  assert.equal(sheet.getCell('E5').value, 2)
  assert.equal(sheet.getCell('F5').value, '2026-10-01')

  assert.equal(sheet.getCell('A6').value, 'CONTRACT-2')
  assert.equal(sheet.getCell('B6').value, '业务员 B')
  assert.equal(sheet.getCell('C6').value, '发货名称 B')
  assert.equal(sheet.getCell('D6').value, '供货单位 B')
  assert.equal(sheet.getCell('E6').value, '3')
  assert.equal(sheet.getCell('F6').value, '2026.9.11')

  assert.equal(sheet.getCell(`B${lowerSectionRow}`).value, '□Yes   ☑No')
  assert.equal(sheet.getCell(`D${lowerSectionRow}`).value, '无')
  assert.equal(sheet.getCell(`F${lowerSectionRow}`).value, '无')
  assert.equal(sheet.getCell(`B${lowerSectionRow + 1}`).value, '固安县-嫩江')
  assert.equal(sheet.getCell(`D${lowerSectionRow + 1}`).value, '☑Yes   □No')
  assert.equal(sheet.getCell(`F${lowerSectionRow + 1}`).value, '鸿利物流')
  assert.equal(sheet.getCell(`B${lowerSectionRow + 2}`).value, '预估50元')
  assert.equal(sheet.getCell(`E${lowerSectionRow + 2}`).value, '170公斤')
  assert.equal(sheet.getCell(`B${lowerSectionRow + 3}`).value, '厂家直接发到嫩江')
  assert.equal(sheet.getCell(`B${lowerSectionRow + 5}`).value, '顺心捷达')
  assert.equal(sheet.getCell(`D${lowerSectionRow + 5}`).value, 'S71982313129')
  assert.equal(sheet.getCell(`B${lowerSectionRow + 6}`).value, '当前导出人')
  assert.equal(sheet.getCell(`D${lowerSectionRow + 6}`).value, null)
})

test('leaves the selected amount blank when any material has no known amount', async () => {
  const workbook = await buildShippingApplicationWorkbook(input([
    item('item-1', 1, { winningAmount: new Prisma.Decimal('10.25') }),
    item('item-2', 2, { winningAmount: null, taxIncludedTotal: null })
  ]))
  const sheet = workbook.getWorksheet('Shipping Request')!

  assert.equal(sheet.getCell('B3').value, null)
})

test('de-duplicates selected material IDs and keeps stable line-number order', async () => {
  const workbook = await buildShippingApplicationWorkbook(input([
    item('item-3', 30),
    item('item-1', 10),
    item('item-2', 20),
    item('item-2', 0, { materialDescription: '重复项不应导出' })
  ]))
  const sheet = workbook.getWorksheet('Shipping Request')!

  assert.deepEqual(
    [5, 6, 7].map((row) => sheet.getCell(`C${row}`).value),
    ['物料 10', '物料 20', '物料 30']
  )
})

test('uses the only non-empty shared value and leaves wholly unknown fields blank', async () => {
  const workbook = await buildShippingApplicationWorkbook(input([
    item('item-1', 1, { shippingInfo: { route: '统一路线' } }),
    item('item-2', 2, { shippingInfo: null })
  ]))
  const sheet = workbook.getWorksheet('Shipping Request')!
  const lowerSectionRow = 7

  assert.equal(sheet.getCell(`B${lowerSectionRow + 1}`).value, '统一路线')
  assert.equal(sheet.getCell('C3').value, null)
  assert.equal(sheet.getCell(`B${lowerSectionRow}`).value, null)
})

test('rejects selected materials with inconsistent non-empty shared shipping fields', async () => {
  await assert.rejects(
    buildShippingApplicationWorkbook(input([
      item('item-1', 1, { shippingInfo: { weight: '100公斤', route: '路线 A' } }),
      item('item-2', 2, { shippingInfo: { weight: '200公斤', route: '路线 B' } })
    ])),
    (error) => {
      assert.ok(error instanceof ShippingApplicationFieldConflictError)
      assert.deepEqual(error.fields, ['Weight', 'Origin / Destination'])
      return true
    }
  )
})

test('English shipping export can be read by the import field parser', async () => {
  // Keep the cross-workspace round-trip check out of the backend TypeScript
  // program while allowing the test runner to resolve the frontend module.
  const parserModulePath = '../../../frontend/src/utils/shippingExcelFields.js'
  const { extractShippingExcelFields } = await import(parserModulePath)
  const workbook = await buildShippingApplicationWorkbook(input([
    item('round-trip', 1, { shippingInfo: { customerLogisticsCompany: 'Example Carrier', customerTrackingNo: 'TRACK-123' } })
  ]))
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer())
  const sheet = reopened.getWorksheet('Shipping Request')!
  const rows: unknown[][] = []
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
  assert.deepEqual(extractShippingExcelFields(rows), {
    logisticsCompany: 'Example Carrier', trackingNo: 'TRACK-123'
  })
})
