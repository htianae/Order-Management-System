import type { Request, Response } from 'express'
import { z } from 'zod'

import { createAgentService } from './service-factory.js'

const aiChatSchema = z.object({
  message: z.string().trim().min(1, 'Please enter a question').max(2000, 'Question must not exceed 2,000 characters'),
  order_id: z.string().trim().optional().nullable(),
  conversation_id: z.string().trim().optional().nullable()
})

export interface AiChatService {
  chat(input: {
    message: string
    orderId?: string | null
    conversationId?: string | null
    context: {
      user: NonNullable<Request['user']>
    }
  }): Promise<{
    answer: string
    conversation_id: string | null
    tools_used: string[]
  }>
}

export function createAiChatHandler(service: AiChatService = createAgentService()) {
  return async function aiChat(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Please sign in' })
    }

    const parsed = aiChatSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid AI question format',
        errors: parsed.error.flatten().fieldErrors
      })
    }

    try {
      const result = await service.chat({
        message: parsed.data.message,
        orderId: parsed.data.order_id || null,
        conversationId: parsed.data.conversation_id || null,
        context: {
          user: req.user
        }
      })

      return res.json(result)
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500
      const message = error instanceof Error ? error.message : 'AI service error'

      return res.status(statusCode).json({ message })
    }
  }
}

export const aiChat = createAiChatHandler()
