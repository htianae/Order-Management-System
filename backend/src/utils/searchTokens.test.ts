import assert from 'node:assert/strict'
import test from 'node:test'

import { tokenizeSearchText } from './searchTokens.js'

test('splits pasted product names on path-like separators', () => {
  assert.deepEqual(
    tokenizeSearchText('冷却风机\\GFDD520-120/A3\\850m³/h\\1400r/min\\0.04kW'),
    ['冷却风机', 'GFDD520-120', 'A3', '850m³', 'h', '1400r', 'min', '0.04kW']
  )
})

test('keeps a simple keyword unchanged', () => {
  assert.deepEqual(tokenizeSearchText('冷却风机'), ['冷却风机'])
})
