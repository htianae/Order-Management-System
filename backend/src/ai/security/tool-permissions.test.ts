import assert from 'node:assert/strict'
import test from 'node:test'

import { getInquiryReadScope, getOrderReadScope, isBossOrAdmin } from './tool-permissions.js'

test('boss and admin can access global AI data scopes', () => {
  assert.equal(isBossOrAdmin('BOSS'), true)
  assert.equal(isBossOrAdmin('ADMIN'), true)
  assert.deepEqual(getOrderReadScope({ id: 'boss-1', username: 'boss', realName: null, role: 'BOSS' }), {})
  assert.deepEqual(getInquiryReadScope({ id: 'admin-1', username: 'admin', realName: null, role: 'ADMIN' }), {})
})

test('employees are scoped to their own orders and inquiries', () => {
  const user = { id: 'user-1', username: 'u1', realName: null, role: 'EMPLOYEE' as const }

  assert.deepEqual(getOrderReadScope(user), {
    OR: [{ creatorId: 'user-1' }, { ownerId: 'user-1' }]
  })
  assert.deepEqual(getInquiryReadScope(user), { creatorId: 'user-1' })
})
