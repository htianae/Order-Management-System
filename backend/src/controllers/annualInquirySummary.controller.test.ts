import { UserRole } from '@prisma/client'
import assert from 'node:assert/strict'
import test from 'node:test'

import { createAnnualInquirySummaryHandler } from './annualInquirySummary.controller.js'

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

function createRequest(query: Record<string, unknown>, role: UserRole = UserRole.EMPLOYEE) {
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
    findInquiryItems: async () => [],
    buildWorkbook: () => ({
      xlsx: {
        writeBuffer: async () => Uint8Array.from([1, 2, 3])
      }
    }),
    ...overrides
  } as any
}

const inquiryRows = [
  {
    result: 'WON',
    inquiry: { inquiryCompany: '测试公司' }
  }
]

test('annual inquiry summary export requires authentication', async () => {
  const handler = createAnnualInquirySummaryHandler(createDependencies())
  const response = createResponse()

  await handler({ query: { year: '2026' } } as any, response as any)

  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.body, { message: 'Please sign in' })
})

test('annual inquiry summary export rejects invalid years', async () => {
  const handler = createAnnualInquirySummaryHandler(createDependencies())
  const response = createResponse()

  await handler(createRequest({ year: ['2026'] }), response as any)

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.body, { message: 'Invalid year' })
})

test('employee export uses the authenticated employee scope and ignores forged user ids', async () => {
  let capturedWhere: any
  const handler = createAnnualInquirySummaryHandler(createDependencies({
    findInquiryItems: async (where: any) => {
      capturedWhere = where
      return inquiryRows
    }
  }))
  const response = createResponse()

  await handler(createRequest({ year: '2026', creatorId: 'another-user' }), response as any)

  assert.equal(capturedWhere.inquiry.creatorId, 'employee-1')
  assert.equal(response.statusCode, 200)
})

test('boss and admin exports are not restricted to one creator', async () => {
  for (const role of [UserRole.BOSS, UserRole.ADMIN]) {
    let capturedWhere: any
    const handler = createAnnualInquirySummaryHandler(createDependencies({
      findInquiryItems: async (where: any) => {
        capturedWhere = where
        return inquiryRows
      }
    }))
    const response = createResponse()

    await handler(createRequest({ year: '2026' }, role), response as any)

    assert.equal(capturedWhere.inquiry.creatorId, undefined)
    assert.equal(response.statusCode, 200)
  }
})

test('returns not found when the selected year has no inquiry items', async () => {
  const handler = createAnnualInquirySummaryHandler(createDependencies())
  const response = createResponse()

  await handler(createRequest({ year: '2026' }), response as any)

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.body, { message: 'No inquiry summary data for this year' })
})

test('returns an xlsx file with the expected annual filename', async () => {
  const handler = createAnnualInquirySummaryHandler(createDependencies({
    findInquiryItems: async () => inquiryRows
  }))
  const response = createResponse()

  await handler(createRequest({ year: '2026' }), response as any)

  assert.equal(
    response.headers['Content-Type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  assert.match(response.headers['Content-Disposition'], /2026-Annual%20Inquiry%20Summary\.xlsx/)
  assert.ok(Buffer.isBuffer(response.sent))
})

test('maps database and workbook failures to a stable export error', async () => {
  const databaseHandler = createAnnualInquirySummaryHandler(createDependencies({
    findInquiryItems: async () => {
      throw new Error('database unavailable')
    }
  }))
  const databaseResponse = createResponse()

  await databaseHandler(createRequest({ year: '2026' }), databaseResponse as any)
  assert.equal(databaseResponse.statusCode, 500)
  assert.deepEqual(databaseResponse.body, { message: 'Failed to export annual inquiry summary' })

  const workbookHandler = createAnnualInquirySummaryHandler(createDependencies({
    findInquiryItems: async () => inquiryRows,
    buildWorkbook: () => ({
      xlsx: {
        writeBuffer: async () => {
          throw new Error('workbook failed')
        }
      }
    })
  }))
  const workbookResponse = createResponse()

  await workbookHandler(createRequest({ year: '2026' }), workbookResponse as any)
  assert.equal(workbookResponse.statusCode, 500)
  assert.deepEqual(workbookResponse.body, { message: 'Failed to export annual inquiry summary' })
})
