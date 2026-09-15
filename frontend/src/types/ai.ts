export interface AiChatRequest {
  message: string
  order_id?: string | null
  conversation_id?: string | null
}

export interface AiChatResponse {
  answer: string
  conversation_id: string | null
  tools_used: string[]
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
}
