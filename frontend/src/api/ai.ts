import { http } from './http'
import type { AiChatRequest, AiChatResponse } from '@/types/ai'

export function sendAiChatMessageApi(payload: AiChatRequest) {
  return http.post<AiChatResponse>('/ai/chat', payload)
}
