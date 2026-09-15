import { env } from '../config/env.js'
import { AgentService } from './agent.service.js'
import type { AIProvider } from './providers/ai-provider.js'
import { DashScopeProvider } from './providers/dashscope-provider.js'
import { createDefaultToolRegistry } from './tools/index.js'

type AIProviderConfig = Pick<typeof env, 'aiProvider' | 'dashScopeApiKey' | 'aiModel' | 'dashScopeBaseUrl'>

export function createProviderFromEnv(config: AIProviderConfig = env): AIProvider {
  if (config.aiProvider === 'bailian' || config.aiProvider === 'dashscope') {
    return new DashScopeProvider({
      apiKey: config.dashScopeApiKey,
      model: config.aiModel,
      baseUrl: config.dashScopeBaseUrl
    })
  }

  return new DashScopeProvider({
    apiKey: config.dashScopeApiKey,
    model: config.aiModel,
    baseUrl: config.dashScopeBaseUrl
  })
}

export function createAgentService() {
  return new AgentService({
    provider: createProviderFromEnv(),
    registry: createDefaultToolRegistry(),
    maxToolIterations: env.aiAgentMaxToolIterations,
    timeoutMs: env.aiAgentTimeoutMs
  })
}
