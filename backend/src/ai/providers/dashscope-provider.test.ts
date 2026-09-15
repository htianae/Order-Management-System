import assert from 'node:assert/strict'
import test from 'node:test'

import { DashScopeProvider } from './dashscope-provider.js'

test('calls DashScope OpenAI-compatible chat completions with tool calling enabled', async () => {
  const previousFetch = globalThis.fetch
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init || {} })
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: {
                  name: 'get_order_detail',
                  arguments: '{"orderNo":"A001"}'
                }
              }
            ]
          }
        }
      ]
    }), { status: 200 })
  }) as typeof fetch

  try {
    const provider = new DashScopeProvider({
      apiKey: 'secret-key',
      model: 'qwen3.7-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    })
    const result = await provider.chat({
      messages: [{ role: 'user', content: '查订单 A001' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_order_detail',
            description: '查订单',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      timeoutMs: 1000
    })
    const body = JSON.parse(String(calls[0].init.body))

    assert.equal(calls[0].url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer secret-key')
    assert.equal(body.model, 'qwen3.7-plus')
    assert.equal(body.tool_choice, 'auto')
    assert.equal(body.enable_thinking, false)
    assert.equal(result.message.tool_calls?.[0]?.function.name, 'get_order_detail')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('requires DASHSCOPE_API_KEY', async () => {
  const provider = new DashScopeProvider({ apiKey: '', model: 'qwen3.7-plus' })

  await assert.rejects(
    () => provider.chat({ messages: [], tools: [], timeoutMs: 1000 }),
    /DASHSCOPE_API_KEY/
  )
})

test('normalizes object tool arguments to JSON strings', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'get_customer_deal_ranking',
                arguments: { year: 2026, sortBy: 'orderCount' }
              }
            }
          ]
        }
      }
    ]
  }), { status: 200 })) as typeof fetch

  try {
    const provider = new DashScopeProvider({ apiKey: 'secret-key', model: 'qwen3.7-plus' })
    const result = await provider.chat({ messages: [], tools: [], timeoutMs: 1000 })

    assert.equal(result.message.tool_calls?.[0]?.function.arguments, '{"year":2026,"sortBy":"orderCount"}')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('maps DashScope auth, quota, timeout, and model errors', async () => {
  const previousFetch = globalThis.fetch
  const provider = new DashScopeProvider({ apiKey: 'secret-key', model: 'qwen3.7-plus' })

  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 })) as typeof fetch
    await assert.rejects(() => provider.chat({ messages: [], tools: [], timeoutMs: 1000 }), /DashScope authentication failed/)

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })) as typeof fetch
    await assert.rejects(() => provider.chat({ messages: [], tools: [], timeoutMs: 1000 }), /quota/)

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 })) as typeof fetch
    await assert.rejects(() => provider.chat({ messages: [], tools: [], timeoutMs: 1000 }), /model not found/)
  } finally {
    globalThis.fetch = previousFetch
  }
})
