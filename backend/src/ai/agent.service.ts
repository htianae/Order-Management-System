import type { AIProvider, AIProviderMessage, AIProviderResponse, AIProviderTool } from './providers/ai-provider.js'
import { aiSystemPrompt } from './prompts.js'
import type { ToolRegistry } from './tools/tool-registry.js'
import type { ToolContext } from './tools/tool-types.js'

export class AgentServiceError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = 'AgentServiceError'
    this.statusCode = statusCode
  }
}

export class AgentService {
  private readonly provider: AIProvider
  private readonly registry: ToolRegistry
  private readonly maxToolIterations: number
  private readonly timeoutMs: number

  constructor(options: {
    provider: AIProvider
    registry: ToolRegistry
    maxToolIterations: number
    timeoutMs: number
  }) {
    this.provider = options.provider
    this.registry = options.registry
    this.maxToolIterations = options.maxToolIterations
    this.timeoutMs = options.timeoutMs
  }

  private async callProvider(input: {
    messages: AIProviderMessage[]
    tools: AIProviderTool[]
  }): Promise<AIProviderResponse> {
    try {
      return await this.provider.chat({
        messages: input.messages,
        tools: input.tools,
        timeoutMs: this.timeoutMs
      })
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode) || 502
        throw new AgentServiceError(error.message, statusCode)
      }

      throw new AgentServiceError('AI service is temporarily unavailable. Please try again later', 502)
    }
  }

  private async generateFinalAnswerFromToolResults(messages: AIProviderMessage[], toolsUsed: string[]) {
    const response = await this.callProvider({
      messages: [
        ...messages,
        {
          role: 'user',
          content: 'Tool results are available. Do not call more tools. Answer using the available real data; if it is insufficient, say "Insufficient data available".'
        }
      ],
      tools: []
    })

    if (response.message.tool_calls?.length) {
      throw new AgentServiceError('The AI agent reached its tool-call limit. Please narrow your question and retry.', 400)
    }

    return {
      answer: response.message.content || 'Insufficient data available. The AI did not generate a valid answer.',
      conversation_id: null,
      tools_used: Array.from(new Set(toolsUsed))
    }
  }

  async chat(input: { message: string; context: ToolContext; orderId?: string | null }) {
    const messages: AIProviderMessage[] = [
      { role: 'system', content: aiSystemPrompt },
      {
        role: 'user',
        content: input.orderId
          ? `${input.message}\n\nCurrent page context (for tool arguments only): {"orderId":"${input.orderId}"}\nTo query the current page order, pass this orderId unchanged as the orderId argument to get_order_detail or generate_order_summary. Do not treat it as orderNo.`
          : input.message
      }
    ]
    const toolsUsed: string[] = []
    const executedToolSignatures = new Set<string>()

    for (let iteration = 0; iteration <= this.maxToolIterations; iteration += 1) {
      const response = await this.callProvider({
        messages,
        tools: this.registry.getProviderTools()
      })

      const toolCalls = response.message.tool_calls || []

      if (!toolCalls.length) {
        return {
          answer: response.message.content || 'Insufficient data available. The AI did not generate a valid answer.',
          conversation_id: null,
          tools_used: Array.from(new Set(toolsUsed))
        }
      }

      if (iteration >= this.maxToolIterations) {
        throw new AgentServiceError('The AI agent reached its tool-call limit. Please narrow your question and retry.', 400)
      }

      const toolSignatures = toolCalls.map((toolCall) => `${toolCall.function.name}:${toolCall.function.arguments}`)

      if (toolSignatures.every((signature) => executedToolSignatures.has(signature))) {
        return this.generateFinalAnswerFromToolResults(messages, toolsUsed)
      }

      messages.push({
        role: 'assistant',
        content: response.message.content,
        tool_calls: toolCalls
      })

      for (const toolCall of toolCalls) {
        toolsUsed.push(toolCall.function.name)
        executedToolSignatures.add(`${toolCall.function.name}:${toolCall.function.arguments}`)

        try {
          const result = await this.registry.execute(toolCall.function.name, toolCall.function.arguments, input.context)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool execution failed'
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              ok: false,
              error: message
            })
          })
        }
      }
    }

    throw new AgentServiceError('The AI agent reached its tool-call limit. Please narrow your question and retry.', 400)
  }
}
