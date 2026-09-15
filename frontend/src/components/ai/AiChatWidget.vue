<template>
  <div class="ai-chat-widget" :class="{ 'is-open': open }">
    <transition name="ai-chat-panel">
      <section v-if="open" class="ai-chat-panel" :class="{ minimized }" aria-label="AI Assistant Chat">
        <header class="ai-chat-header">
          <div>
            <strong>AI Assistant</strong>
            <span>Answers based on actual order data</span>
          </div>
          <div class="ai-chat-header-actions">
            <el-button text :icon="Minus" @click="minimized = !minimized" />
            <el-button text :icon="Close" @click="open = false" />
          </div>
        </header>

        <template v-if="!minimized">
          <div ref="messageListRef" class="ai-chat-messages">
            <div v-if="!messages.length" class="ai-chat-empty">
              Ask about order details, similar past orders, quote suggestions, unpaid orders, delayed orders, or employee performance.
            </div>
            <article
              v-for="message in messages"
              :key="message.id"
              class="ai-chat-message"
              :class="message.role"
            >
              <div class="ai-chat-bubble">
                <p>{{ message.content }}</p>
                <span v-if="message.toolsUsed?.length" class="ai-chat-tools">
                  Using tool: {{ message.toolsUsed.join('、') }}
                </span>
              </div>
            </article>
            <article v-if="loading" class="ai-chat-message assistant">
              <div class="ai-chat-bubble">
                <el-icon class="is-loading"><Loading /></el-icon>
                Querying order data...
              </div>
            </article>
          </div>

          <div v-if="errorText" class="ai-chat-error">{{ errorText }}</div>

          <footer class="ai-chat-input">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="3"
              resize="none"
              maxlength="2000"
              show-word-limit
              placeholder="Ask a question. Enter to send; Shift+Enter for a new line"
              @keydown="handleKeydown"
            />
            <el-button type="primary" :icon="Position" :loading="loading" :disabled="!canSend" @click="sendMessage">
              Send
            </el-button>
          </footer>
        </template>
      </section>
    </transition>

    <el-button class="ai-chat-fab" type="primary" circle :icon="ChatRound" @click="toggleOpen" />
  </div>
</template>

<script setup lang="ts">
import { ChatRound, Close, Loading, Minus, Position } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'

import { sendAiChatMessageApi } from '@/api/ai'
import type { AiChatMessage } from '@/types/ai'

const route = useRoute()
const open = ref(false)
const minimized = ref(false)
const loading = ref(false)
const errorText = ref('')
const inputText = ref('')
const conversationId = ref<string | null>(null)
const messages = ref<AiChatMessage[]>([])
const messageListRef = ref<HTMLElement>()

const canSend = computed(() => Boolean(inputText.value.trim()) && !loading.value)

function createMessage(role: AiChatMessage['role'], content: string, toolsUsed?: string[]) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    toolsUsed
  }
}

async function scrollToBottom() {
  await nextTick()
  const element = messageListRef.value

  if (element) {
    element.scrollTop = element.scrollHeight
  }
}

function toggleOpen() {
  open.value = !open.value

  if (open.value) {
    minimized.value = false
    void scrollToBottom()
  }
}

function getCurrentOrderId() {
  return route.name === 'order-detail' && typeof route.params.id === 'string'
    ? route.params.id
    : null
}

async function sendMessage() {
  const text = inputText.value.trim()

  if (!text || loading.value) {
    return
  }

  errorText.value = ''
  inputText.value = ''
  messages.value.push(createMessage('user', text))
  loading.value = true
  await scrollToBottom()

  try {
    const { data } = await sendAiChatMessageApi({
      message: text,
      order_id: getCurrentOrderId(),
      conversation_id: conversationId.value
    })

    conversationId.value = data.conversation_id
    messages.value.push(createMessage('assistant', data.answer, data.tools_used))
  } catch (error) {
    const responseError = error as { response?: { data?: { message?: string } } }
    const message = responseError.response?.data?.message || 'AI The assistant is unavailable. Please try again later.'
    errorText.value = message
    ElMessage.error(message)
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  void sendMessage()
}
</script>

<style scoped>
.ai-chat-widget {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2600;
  display: grid;
  justify-items: end;
  gap: 12px;
  pointer-events: none;
}

.ai-chat-widget > * {
  pointer-events: auto;
}

.ai-chat-fab {
  width: 48px;
  height: 48px;
  box-shadow: 0 14px 36px rgba(37, 99, 235, 0.28);
}

.ai-chat-panel {
  width: 380px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.2);
}

.ai-chat-panel.minimized {
  width: 300px;
}

.ai-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  color: #ffffff;
  background: #172033;
}

.ai-chat-header strong,
.ai-chat-header span {
  display: block;
}

.ai-chat-header strong {
  font-size: 15px;
}

.ai-chat-header span {
  margin-top: 2px;
  color: #cbd5e1;
  font-size: 12px;
}

.ai-chat-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-chat-header-actions :deep(.el-button) {
  color: #ffffff;
}

.ai-chat-messages {
  display: flex;
  max-height: 420px;
  min-height: 260px;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px;
  background: #f8fafc;
}

.ai-chat-empty {
  margin: auto;
  color: #667085;
  font-size: 14px;
  line-height: 1.7;
  text-align: center;
}

.ai-chat-message {
  display: flex;
}

.ai-chat-message.user {
  justify-content: flex-end;
}

.ai-chat-bubble {
  max-width: 82%;
  padding: 10px 12px;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.ai-chat-message.user .ai-chat-bubble {
  color: #ffffff;
  background: #409eff;
  border-color: #409eff;
}

.ai-chat-bubble p {
  margin: 0;
}

.ai-chat-tools {
  display: block;
  margin-top: 8px;
  color: #667085;
  font-size: 12px;
}

.ai-chat-error {
  padding: 8px 16px;
  color: #b42318;
  background: #fff1f0;
  border-top: 1px solid #ffd6d2;
  font-size: 13px;
}

.ai-chat-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 12px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
}

.ai-chat-input .el-button {
  align-self: end;
}

.ai-chat-panel-enter-active,
.ai-chat-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ai-chat-panel-enter-from,
.ai-chat-panel-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 640px) {
  .ai-chat-widget {
    right: 12px;
    bottom: 12px;
    left: 12px;
  }

  .ai-chat-panel,
  .ai-chat-panel.minimized {
    width: 100%;
  }

  .ai-chat-messages {
    max-height: 52vh;
  }

  .ai-chat-input {
    grid-template-columns: 1fr;
  }
}
</style>
