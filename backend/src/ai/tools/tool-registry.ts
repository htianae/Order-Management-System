import { z } from 'zod'

import type { AIProviderTool } from '../providers/ai-provider.js'
import type { AgentTool, ToolContext } from './tool-types.js'
import { ToolExecutionError } from './tool-types.js'

function zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) {
    const innerSchema = zodTypeToJsonSchema(schema.innerType())
    return { ...innerSchema, ...(schema.description ? { description: schema.description } : {}) }
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    const innerSchema = zodTypeToJsonSchema(schema.unwrap())
    return { ...innerSchema, ...(schema.description ? { description: schema.description } : {}) }
  }

  const description = schema.description

  if (schema instanceof z.ZodString) {
    return { type: 'string', ...(description ? { description } : {}) }
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', ...(description ? { description } : {}) }
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', ...(description ? { description } : {}) }
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options, ...(description ? { description } : {}) }
  }

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodTypeToJsonSchema(schema.element), ...(description ? { description } : {}) }
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    Object.entries(shape).forEach(([key, value]) => {
      const child = value as z.ZodTypeAny
      properties[key] = zodTypeToJsonSchema(child)

      if (!(child instanceof z.ZodOptional) && !(child instanceof z.ZodDefault)) {
        required.push(key)
      }
    })

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
      ...(description ? { description } : {})
    }
  }

  return { type: 'object', ...(description ? { description } : {}) }
}

function toProviderTool(tool: AgentTool): AIProviderTool {
  return tool.toProviderTool?.() || {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodTypeToJsonSchema(tool.parameters as z.ZodTypeAny)
    }
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>()

  constructor(tools: AgentTool[]) {
    tools.forEach((tool) => {
      this.tools.set(tool.name, tool)
    })
  }

  getProviderTools() {
    return Array.from(this.tools.values()).map(toProviderTool)
  }

  async execute(name: string, rawArguments: string, context: ToolContext) {
    const tool = this.tools.get(name)

    if (!tool) {
      throw new ToolExecutionError(`Unknown tool: ${name}`, 400)
    }

    let parsedJson: unknown

    try {
      parsedJson = rawArguments ? JSON.parse(rawArguments) : {}
    } catch {
      throw new ToolExecutionError(`Invalid tool arguments for ${name}: arguments must be JSON`, 400)
    }

    const parsedArgs = tool.parameters.safeParse(parsedJson)

    if (!parsedArgs.success) {
      throw new ToolExecutionError(`Invalid tool arguments for ${name}: ${parsedArgs.error.message}`, 400)
    }

    return tool.execute(parsedArgs.data, context)
  }
}
