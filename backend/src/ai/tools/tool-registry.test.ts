import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'

import { ToolRegistry } from './tool-registry.js'
import { createDefaultToolRegistry } from './index.js'
import type { AgentTool, ToolContext } from './tool-types.js'

const context: ToolContext = {
  user: {
    id: 'user-1',
    username: 'hengan',
    realName: 'Hengan',
    role: 'EMPLOYEE'
  }
}

test('registers tools and executes a validated tool call', async () => {
  const echoTool: AgentTool<{ text: string }, { text: string }> = {
    name: 'echo',
    description: 'Echoes text',
    parameters: z.object({ text: z.string().min(1) }),
    execute: async (args) => ({ text: args.text })
  }
  const registry = new ToolRegistry([echoTool])

  assert.deepEqual(registry.getProviderTools().map((tool) => tool.function.name), ['echo'])
  assert.deepEqual(await registry.execute('echo', '{"text":"hello"}', context), { text: 'hello' })
})

test('rejects unknown tools and invalid arguments', async () => {
  const registry = new ToolRegistry([
    {
      name: 'needs_number',
      description: 'Requires a number',
      parameters: z.object({ value: z.number() }),
      execute: async (args) => args
    }
  ])

  await assert.rejects(() => registry.execute('missing', '{}', context), /Unknown tool/)
  await assert.rejects(() => registry.execute('needs_number', '{"value":"bad"}', context), /Invalid tool arguments/)
})

test('keeps refined object fields in provider tool schema', () => {
  const registry = new ToolRegistry([
    {
      name: 'lookup',
      description: 'Looks up an order',
      parameters: z.object({
        orderId: z.string().optional().describe('database id'),
        orderNo: z.string().optional()
      }).refine((value) => Boolean(value.orderId || value.orderNo)),
      execute: async (args) => args
    }
  ])

  const [tool] = registry.getProviderTools()
  const parameters = tool.function.parameters as {
    properties?: Record<string, { type?: string; description?: string }>
  }

  assert.equal(parameters.properties?.orderId?.type, 'string')
  assert.equal(parameters.properties?.orderId?.description, 'database id')
  assert.equal(parameters.properties?.orderNo?.type, 'string')
})

test('converts zod enums to provider string enum schema', () => {
  const registry = new ToolRegistry([
    {
      name: 'ranking',
      description: 'Ranks data',
      parameters: z.object({
        sortBy: z.enum(['orderCount', 'winningAmount', 'profit']).optional()
      }),
      execute: async (args) => args
    }
  ])

  const [tool] = registry.getProviderTools()
  const parameters = tool.function.parameters as {
    properties?: Record<string, { type?: string; enum?: string[] }>
  }

  assert.equal(parameters.properties?.sortBy?.type, 'string')
  assert.deepEqual(parameters.properties?.sortBy?.enum, ['orderCount', 'winningAmount', 'profit'])
})

test('default registry exposes business analysis tools', () => {
  const names = createDefaultToolRegistry().getProviderTools().map((tool) => tool.function.name)

  assert.ok(names.includes('get_customer_deal_ranking'))
  assert.ok(names.includes('get_historical_quote_recommendation'))
  assert.ok(names.includes('analyze_product_performance'))
  assert.ok(names.includes('analyze_manufacturer_performance'))
  assert.ok(names.includes('get_monthly_business_insights'))
})
