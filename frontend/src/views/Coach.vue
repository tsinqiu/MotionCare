<template>
  <div class="page-stack coach-page">
    <section class="coach-head">
      <div>
        <p class="overline">接下来怎么练</p>
        <h2>教练</h2>
      </div>
      <span class="ai-mode-pill" :class="{ fallback: modelStatus.fallback }">
        <span class="dot" aria-hidden="true"></span>
        {{ modelStatus.label }}
      </span>
    </section>

    <section class="chat-surface">
      <StateBlock
        v-if="aiLoading"
        title="正在连接教练"
        message="正在确认训练建议服务是否可用。"
      />
      <StateBlock
        v-else-if="aiError && messages.length === 0"
        title="教练暂时不可用"
        message="连接暂时不可用，稍后再试一次。"
        action-label="重试"
        tone="danger"
        @action="loadCoach"
      />

      <template v-else>
        <StateBlock
          v-if="messages.length === 0"
          title="还没有对话"
          message="选择一个常见问题，或直接说说你接下来的训练目标。"
        />
        <div v-else ref="messageListRef" class="chat-messages">
          <TransitionGroup name="msg">
            <article v-for="message in messages" :key="message.id" class="chat-message" :class="message.role">
              <div class="chat-avatar">{{ message.role === 'user' ? userInitial : '教练' }}</div>
              <div class="chat-bubble"><p>{{ message.content }}</p></div>
            </article>
            <article v-if="sending" key="typing" class="chat-message assistant">
              <div class="chat-avatar">教练</div>
              <div class="chat-bubble typing"><span></span><span></span><span></span></div>
            </article>
          </TransitionGroup>
        </div>

        <div class="quick-prompts">
          <button v-for="prompt in quickPrompts" :key="prompt" type="button" @click="ask(prompt)">{{ prompt }}</button>
        </div>

        <form class="chat-composer" @submit.prevent="submit">
          <textarea
            v-model.trim="draft"
            rows="1"
            placeholder="问问今天怎么练、如何恢复或下一次安排……"
            @keydown.enter.exact.prevent="submit"
          ></textarea>
          <button class="send-btn" type="submit" :disabled="sending || !draft" aria-label="发送">
            <Send :size="18" />
          </button>
        </form>
        <p v-if="chatError" class="form-error">建议生成失败，请稍后重试。</p>
      </template>
    </section>

    <section class="dark-panel">
      <div class="section-heading">
        <div><h2>推荐训练</h2></div>
      </div>
      <StateBlock v-if="recommendationLoading" title="正在加载推荐" message="正在读取训练建议和课程。" />
      <StateBlock
        v-else-if="recommendationError"
        title="推荐暂时不可用"
        message="连接暂时不可用，稍后再试一次。"
        action-label="重试"
        tone="danger"
        @action="loadRecommendations"
      />
      <StateBlock
        v-else-if="recommendations.length === 0"
        title="暂时没有推荐"
        message="先记录几次运动，之后再来看看。"
        action-label="记录运动"
        @action="router.push('/record')"
      />
      <div v-else class="recommendation-list">
        <article v-for="item in recommendations" :key="item.id" class="recommendation-card">
          <small>{{ typeLabel(item.type) }}</small>
          <h3>{{ item.title }}</h3>
          <p>{{ item.summary || item.content || '打开教练对话，结合你的情况继续询问。' }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { Send } from '@lucide/vue'
import { useRouter } from 'vue-router'

import StateBlock from '@/components/StateBlock.vue'
import { getAiHealth, sendAiMessage } from '@/services/ai'
import { getExploreRecommendations } from '@/services/explore'
import { authSession } from '@/stores/authStore'

const router = useRouter()
const quickPrompts = ['今天适合怎么练？', '最近需要减量吗？', '下一次跑步怎么安排？']
const messages = ref([])
const recommendations = ref([])
const modelHealth = ref(null)
const draft = ref('')
const aiLoading = ref(false)
const recommendationLoading = ref(false)
const sending = ref(false)
const aiError = ref('')
const recommendationError = ref('')
const chatError = ref('')
const messageListRef = ref(null)

const userInitial = computed(() => (authSession.user?.username || '我').slice(0, 1).toUpperCase())
const modelStatus = computed(() => {
  if (aiLoading.value) return { label: '连接中', fallback: true }
  if (modelHealth.value?.status === 'ok') return { label: '教练在线', fallback: false }
  return { label: '基础建议', fallback: true }
})

function typeLabel(type) {
  return { course: '训练课程', article: '运动知识', training_advice: '训练建议' }[type] || '推荐内容'
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  })
}

async function loadAiStatus() {
  aiLoading.value = true
  aiError.value = ''
  try {
    modelHealth.value = await getAiHealth()
  } catch (error) {
    modelHealth.value = { status: 'fallback' }
    aiError.value = error instanceof Error ? error.message : '教练服务暂时不可用'
  } finally {
    aiLoading.value = false
  }
}

async function loadRecommendations() {
  recommendationLoading.value = true
  recommendationError.value = ''
  try {
    const page = await getExploreRecommendations({ page: 1, page_size: 6 })
    recommendations.value = page.items || []
  } catch (error) {
    recommendations.value = []
    recommendationError.value = error instanceof Error ? error.message : '训练推荐加载失败'
  } finally {
    recommendationLoading.value = false
  }
}

function loadCoach() {
  return Promise.allSettled([loadAiStatus(), loadRecommendations()])
}

async function ask(text) {
  draft.value = text
  await submit()
}

async function submit() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  messages.value.push({ id: Date.now(), role: 'user', content })
  draft.value = ''
  sending.value = true
  chatError.value = ''
  scrollToBottom()
  try {
    const envelope = await sendAiMessage(content)
    messages.value.push({ id: Date.now() + 1, role: 'assistant', content: envelope.data?.content || '暂时没有生成有效建议。' })
  } catch (error) {
    chatError.value = error instanceof Error ? error.message : '建议生成失败，请稍后重试。'
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

onMounted(loadCoach)
</script>

<style scoped>
.coach-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.coach-head h2 { margin: 2px 0 0; }
.coach-head .overline { margin: 0; }

.ai-mode-pill .dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  margin-right: 6px;
  vertical-align: middle;
}
.ai-mode-pill.fallback .dot { background: var(--orange); }

.chat-surface {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 48vh;
  overflow-y: auto;
  scrollbar-width: none;
}
.chat-messages::-webkit-scrollbar { display: none; }

.chat-message {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  max-width: 88%;
}
.chat-message.user { flex-direction: row-reverse; margin-left: auto; }
.chat-avatar {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
.chat-message.user .chat-avatar { background: var(--green); color: #04240f; }
.chat-bubble {
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--panel-soft);
  line-height: 1.5;
}
.chat-bubble p { margin: 0; }
.chat-message.user .chat-bubble {
  background: var(--green);
  color: #04240f;
  border-bottom-right-radius: 6px;
}
.chat-message.assistant .chat-bubble { border-bottom-left-radius: 6px; }

.chat-bubble.typing { display: flex; gap: 4px; }
.chat-bubble.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--faint);
  animation: typing-blink 1.2s infinite ease-in-out;
}
.chat-bubble.typing span:nth-child(2) { animation-delay: 0.2s; }
.chat-bubble.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-blink {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

.quick-prompts {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.quick-prompts::-webkit-scrollbar { display: none; }
.quick-prompts button {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--panel-soft);
  color: var(--text);
  font-size: 13px;
  white-space: nowrap;
}

.chat-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel-soft);
}
.chat-composer textarea {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text);
  resize: none;
  max-height: 96px;
  line-height: 1.5;
  padding: 6px;
}
.chat-composer textarea:focus { outline: none; }
.send-btn {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: none;
  background: var(--green);
  color: #04240f;
}

.recommendation-list { display: grid; gap: 12px; }
.recommendation-card {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--panel-soft);
}
.recommendation-card small { color: var(--green-strong); font-weight: 600; }
.recommendation-card h3 { margin: 6px 0; font-size: var(--fs-title); }
.recommendation-card p { margin: 0; color: var(--muted); line-height: 1.5; }
</style>
