import type { UserRole } from '@prisma/client'
import type { z } from 'zod'

import type { AIProviderTool } from '../providers/ai-provider.js'

export interface ToolContext {
  user: {
    id: string
    username: string
    realName: string | null
    role: UserRole
  }
}

export interface AgentTool<TArgs = unknown, TResult = unknown> {
  name: string
  description: string
  parameters: z.ZodTypeAny
  execute(args: TArgs, context: ToolContext): Promise<TResult>
  toProviderTool?: () => AIProviderTool
}

export class ToolExecutionError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'ToolExecutionError'
    this.statusCode = statusCode
  }
}
