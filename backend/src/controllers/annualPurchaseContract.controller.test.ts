import { UserRole } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import { createAnnualPurchaseContractHandlers } from './annualPurchaseContract.controller.js'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    sent: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
      return this
    },
    send(payload: unknown) {
      this.sent = payload
      return this
    }
  }
}

function createRequest(
  query: Record<string, unknown>,
  role: UserRole = UserRole.EMPLOYEE
) {
  return {
    query,
    user: {
      id: role === UserRole.EMPLOYEE ? 'employee-1' : 'manager-1',
      username: 'tester',
      realName: '测试用户',
      role
    }
  } as any
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  return {
    findCompanies: async () => [],
    findOrders: async () => [],
    buildWorkbook: () => ({
      xlsx: {
        writeBuffer: async () => Uint8Array.from([1, 2, 3])
      }
    }),
    ...overrides
  } as any
}

test('annual purchase contract handlers require authentication', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies())
  const companiesResponse = createResponse()
  const exportResponse = createResponse()

  await handlers.listCompanies({ query: { year: '2026' } } as any, companiesResponse as any)
  await handlers.exportContracts({ query: { year: '2026', inquiryCompany: '测试公司' } } as any, exportResponse as any)

  assert.equal(companiesResponse.statusCode, 401)
  assert.equal(exportResponse.statusCode, 401)
})

test('rejects invalid years and a missing inquiry company', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies())
  const invalidYearResponse = createResponse()
  const missingCompanyResponse = createResponse()

  await handlers.listCompanies(createRequest({ year: ['2026'] }), invalidYearResponse as any)
  await handlers.exportContracts(createRequest({ year: '2026' }), missingCompanyResponse as any)

  assert.equal(invalidYearResponse.statusCode, 400)
  assert.equal(missingCompanyResponse.statusCode, 400)
})

test('lists distinct companies inside the employee permission scope', async () => {
  let capturedWhere: any
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findCompanies: async (where: any) => {
      capturedWhere = where
      return [
        { inquiryCompany: ' B公司 ' },
        { inquiryCompany: 'A公司' },
        { inquiryCompany: 'B公司' },
        { inquiryCompany: '   ' }
      ]
    }
  }))
  const response = createResponse()

  await handlers.listCompanies(createRequest({ year: '2026' }), response as any)

  assert.equal(capturedWhere.creatorId, 'employee-1')
  assert.deepEqual(response.body, { items: ['A公司', ' B公司 ', 'B公司'] })
})

test('returns a clear not-found response when no contracts match', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies())
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({ year: '2026', inquiryCompany: '无数据公司' }),
    response as any
  )

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.body, { message: 'No matching purchase contract data' })
})

test('boss exports all creators and receives an xlsx response', async () => {
  let capturedWhere: any
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findOrders: async (where: any) => {
      capturedWhere = where
      return [{ id: 'order-1' }]
    }
  }))
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({ year: '2026', inquiryCompany: '测试/公司' }, UserRole.BOSS),
    response as any
  )

  assert.equal(capturedWhere.creatorId, undefined)
  assert.equal(capturedWhere.inquiryCompany, '测试/公司')
  assert.equal(response.statusCode, 200)
  assert.equal(
    response.headers['Content-Type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  assert.match(response.headers['Content-Disposition'], /2026-%E6%B5%8B%E8%AF%95_%E5%85%AC%E5%8F%B8/)
  assert.ok(Buffer.isBuffer(response.sent))
})

test('employee export ignores forged creator parameters and uses the authenticated user', async () => {
  let capturedWhere: any
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findOrders: async (where: any) => {
      capturedWhere = where
      return [{ id: 'order-1' }]
    }
  }))
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({
      year: '2026',
      inquiryCompany: '测试公司',
      creatorId: 'another-user',
      userId: 'another-user'
    }),
    response as any
  )

  assert.equal(capturedWhere.creatorId, 'employee-1')
  assert.equal(response.statusCode, 200)
})

test('admin export is not restricted to one creator', async () => {
  let capturedWhere: any
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findOrders: async (where: any) => {
      capturedWhere = where
      return [{ id: 'order-1' }]
    }
  }))
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({ year: '2026', inquiryCompany: '测试公司' }, UserRole.ADMIN),
    response as any
  )

  assert.equal(capturedWhere.creatorId, undefined)
  assert.equal(response.statusCode, 200)
})

test('maps company database errors to a stable server error response', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findCompanies: async () => {
      throw new Error('database unavailable')
    }
  }))
  const response = createResponse()

  await handlers.listCompanies(createRequest({ year: '2026' }), response as any)

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, { message: 'Failed to load customers' })
})

test('maps order database errors to a stable export error response', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findOrders: async () => {
      throw new Error('database unavailable')
    }
  }))
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({ year: '2026', inquiryCompany: '测试公司' }),
    response as any
  )

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, { message: 'Failed to export annual purchase contracts' })
})

test('maps workbook write errors to a stable export error response', async () => {
  const handlers = createAnnualPurchaseContractHandlers(createDependencies({
    findOrders: async () => [{ id: 'order-1' }],
    buildWorkbook: () => ({
      xlsx: {
        writeBuffer: async () => {
          throw new Error('workbook failed')
        }
      }
    })
  }))
  const response = createResponse()

  await handlers.exportContracts(
    createRequest({ year: '2026', inquiryCompany: '测试公司' }),
    response as any
  )

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.body, { message: 'Failed to export annual purchase contracts' })
})
