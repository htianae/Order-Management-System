import assert from 'node:assert/strict'
import test from 'node:test'

import { createLatestRequestGuard } from './latestRequest.js'

test('accepts only the newest request when responses finish out of order', () => {
  const guard = createLatestRequestGuard()
  const firstRequest = guard.begin()
  const secondRequest = guard.begin()

  assert.equal(guard.isLatest(firstRequest), false)
  assert.equal(guard.isLatest(secondRequest), true)
})
