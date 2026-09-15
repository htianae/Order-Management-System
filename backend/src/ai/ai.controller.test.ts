import assert from 'node:assert/strict'
import test from 'node:test'

import { createAiChatHandler } from './ai.controller.js'

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    }
  }
}

test('AI chat handler requires an authenticated user', async () => {
  const handler = createAiChatHandler({
    chat: async () => ({ answer: 'ok', conversation_id: null, tools_used: [] })
  })
  const res = createResponse()

  await handler({ body: { message: '你好' } } as any, res as any)

  assert.equal(res.statusCode, 401)
})

test('AI chat handler validates message and returns agent result', async () => {
  const handler = createAiChatHandler({
    chat: async (input) => ({
      answer: `收到：${input.message}`,
      conversation_id: null,
      tools_used: ['get_order_detail']
    })
  })
  const res = createResponse()

  await handler({
    user: { id: 'u1', username: 'u1', realName: null, role: 'EMPLOYEE' },
    body: { message: '查订单', order_id: 'order-1' }
  } as any, res as any)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    answer: '收到：查订单',
    conversation_id: null,
    tools_used: ['get_order_detail']
  })
})

test('AI chat handler maps service errors', async () => {
  const handler = createAiChatHandler({
    chat: async () => {
      const error = new Error('AI 服务暂时不可用') as Error & { statusCode: number }
      error.statusCode = 502
      throw error
    }
  })
  const res = createResponse()

  await handler({
    user: { id: 'u1', username: 'u1', realName: null, role: 'EMPLOYEE' },
    body: { message: '你好' }
  } as any, res as any)

  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { message: 'AI 服务暂时不可用' })
})
