export interface AIProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: AIProviderToolCall[]
}

export interface AIProviderTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface AIProviderToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AIProviderResponse {
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: AIProviderToolCall[]
  }
}

export interface AIProvider {
  chat(input: {
    messages: AIProviderMessage[]
    tools: AIProviderTool[]
    timeoutMs: number
  }): Promise<AIProviderResponse>
}

export class AIProviderError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 502) {
    super(message)
    this.name = 'AIProviderError'
    this.statusCode = statusCode
  }
}
