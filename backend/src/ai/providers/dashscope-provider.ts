import type { AIProvider, AIProviderMessage, AIProviderResponse, AIProviderTool } from './ai-provider.js'
import { AIProviderError } from './ai-provider.js'

function getChatCompletionsUrl(baseUrl?: string) {
  const normalized = (baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '')

  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => '')

  if (!text) {
    return ''
  }

  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; code?: string }; message?: string; code?: string }
    return parsed.error?.message || parsed.message || parsed.error?.code || parsed.code || text.slice(0, 200)
  } catch {
    return text.slice(0, 200)
  }
}

function normalizeToolArguments(argumentsValue: unknown) {
  if (typeof argumentsValue === 'string') {
    return argumentsValue
  }

  if (argumentsValue === null || argumentsValue === undefined) {
    return '{}'
  }

  return JSON.stringify(argumentsValue)
}

function normalizeProviderMessage(message: AIProviderResponse['message']) {
  if (!message.tool_calls?.length) {
    return message
  }

  return {
    ...message,
    tool_calls: message.tool_calls.map((toolCall) => ({
      ...toolCall,
      function: {
        ...toolCall.function,
        arguments: normalizeToolArguments((toolCall.function as { arguments?: unknown }).arguments)
      }
    }))
  }
}

export class DashScopeProvider implements AIProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly url: string

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model
    this.url = getChatCompletionsUrl(options.baseUrl)
  }

  async chat(input: {
    messages: AIProviderMessage[]
    tools: AIProviderTool[]
    timeoutMs: number
  }): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw new AIProviderError('DASHSCOPE_API_KEY is not configured for the AI service', 503)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: input.messages,
          ...(input.tools.length
            ? {
                tools: input.tools,
                tool_choice: 'auto',
                parallel_tool_calls: true
              }
            : {}),
          enable_thinking: false,
          temperature: 0.2
        })
      })

      if (response.status === 401 || response.status === 403) {
        throw new AIProviderError(`DashScope authentication failed or access denied (${response.status}): ${await readErrorMessage(response)}`, 502)
      }

      if (response.status === 404) {
        throw new AIProviderError(`DashScope model not found or invalid endpoint: ${await readErrorMessage(response) || this.model}`, 502)
      }

      if (response.status === 429) {
        throw new AIProviderError(`DashScope quota exceeded or rate limit reached: ${await readErrorMessage(response)}`, 429)
      }

      if (!response.ok) {
        throw new AIProviderError(`DashScope service error (${response.status}): ${await readErrorMessage(response)}`, 502)
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: AIProviderResponse['message']
        }>
      }
      const message = data.choices?.[0]?.message

      if (!message) {
        throw new AIProviderError('DashScope returned an empty response', 502)
      }

      return { message: normalizeProviderMessage(message) }
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AIProviderError('DashScope API request timed out', 504)
      }

      throw new AIProviderError('DashScope API request failed', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
}
