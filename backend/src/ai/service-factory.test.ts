import assert from 'node:assert/strict'
import test from 'node:test'

import { createProviderFromEnv } from './service-factory.js'
import { DashScopeProvider } from './providers/dashscope-provider.js'

test('creates DashScope provider when AI_PROVIDER is bailian', () => {
  const provider = createProviderFromEnv({
    aiProvider: 'bailian',
    dashScopeApiKey: 'secret-key',
    aiModel: 'qwen3.7-plus',
    dashScopeBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  })

  assert.ok(provider instanceof DashScopeProvider)
})
