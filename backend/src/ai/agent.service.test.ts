import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'

import { AgentService } from './agent.service.js'
import { ToolRegistry } from './tools/tool-registry.js'
import type { AIProvider } from './providers/ai-provider.js'
import type { ToolContext } from './tools/tool-types.js'

const context: ToolContext = {
  user: {
    id: 'user-1',
    username: 'hengan',
    realName: null,
    role: 'EMPLOYEE'
  }
}

test('runs a tool call and returns the final answer with used tools', async () => {
  let callCount = 0
  const provider: AIProvider = {
    chat: async () => {
      callCount += 1

      if (callCount === 1) {
        return {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"orderNo":"A001"}' }
              }
            ]
          }
        }
      }

      return {
        message: {
          role: 'assistant',
          content: '订单 A001 已查询。'
        }
      }
    }
  }
  const registry = new ToolRegistry([
    {
      name: 'lookup',
      description: 'Looks up an order',
      parameters: z.object({ orderNo: z.string() }),
      execute: async () => ({ orderNo: 'A001' })
    }
  ])
  const service = new AgentService({ provider, registry, maxToolIterations: 5, timeoutMs: 1000 })

  const result = await service.chat({ message: '查订单 A001', context })

  assert.equal(result.answer, '订单 A001 已查询。')
  assert.deepEqual(result.tools_used, ['lookup'])
})

test('stops when the model exceeds the maximum tool iterations', async () => {
  const provider: AIProvider = {
    chat: async () => ({
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: `call-${Date.now()}`,
            type: 'function',
            function: { name: 'loop', arguments: '{}' }
          }
        ]
      }
    })
  }
  const registry = new ToolRegistry([
    {
      name: 'loop',
      description: 'Loops',
      parameters: z.object({}),
      execute: async () => ({ ok: true })
    }
  ])
  const service = new AgentService({ provider, registry, maxToolIterations: 2, timeoutMs: 1000 })

  await assert.rejects(() => service.chat({ message: '一直查', context }), /tool-call limit/)
})

test('forces a final answer when the model repeats the same tool call', async () => {
  let callCount = 0
  const provider: AIProvider = {
    chat: async (input) => {
      callCount += 1

      if (input.tools.length === 0) {
        return {
          message: {
            role: 'assistant',
            content: '订单 A001 已查询完成。'
          }
        }
      }

      return {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `call-${callCount}`,
              type: 'function',
              function: { name: 'lookup', arguments: '{"orderNo":"A001"}' }
            }
          ]
        }
      }
    }
  }
  const registry = new ToolRegistry([
    {
      name: 'lookup',
      description: 'Looks up an order',
      parameters: z.object({ orderNo: z.string() }),
      execute: async () => ({ orderNo: 'A001' })
    }
  ])
  const service = new AgentService({ provider, registry, maxToolIterations: 5, timeoutMs: 1000 })

  const result = await service.chat({ message: '查订单 A001', context })

  assert.equal(result.answer, '订单 A001 已查询完成。')
  assert.deepEqual(result.tools_used, ['lookup'])
})

test('maps provider failures to a controlled AI service error', async () => {
  const provider: AIProvider = {
    chat: async () => {
      throw new Error('provider down')
    }
  }
  const service = new AgentService({
    provider,
    registry: new ToolRegistry([]),
    maxToolIterations: 1,
    timeoutMs: 1000
  })

  await assert.rejects(() => service.chat({ message: '你好', context }), /AI service is temporarily unavailable/)
})

test('preserves safe provider error messages for configuration problems', async () => {
  const provider: AIProvider = {
    chat: async () => {
      const error = new Error('DashScope authentication failed or access denied (403)') as Error & { statusCode: number }
      error.statusCode = 502
      throw error
    }
  }
  const service = new AgentService({
    provider,
    registry: new ToolRegistry([]),
    maxToolIterations: 1,
    timeoutMs: 1000
  })

  await assert.rejects(() => service.chat({ message: '你好', context }), /DashScope authentication failed/)
})
