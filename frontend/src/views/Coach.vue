<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <p class="overline">接下来怎么练</p>
          <h2>教练</h2>
          <p>结合近期运动和恢复状态，安排下一步训练。</p>
        </div>
        <span class="ai-mode-pill" :class="{ fallback: modelStatus.fallback }">{{ modelStatus.label }}</span>
      </div>
    </section>

    <div class="coach-grid">
      <section class="assistant-surface">
        <div class="section-heading">
          <div><h2>训练问答</h2></div>
        </div>

        <StateBlock
          v-if="aiLoading"
          title="正在连接教练"
          message="正在确认训练建议服务是否可用。"
        />
        <StateBlock
          v-else-if="aiError && messages.length === 0"
          title="教练暂时不可用"
          :message="aiError"
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
          <div v-else ref="messageListRef" class="assistant-messages">
            <article v-for="message in messages" :key="message.id" class="assistant-message" :class="message.role">
              <div class="assistant-avatar">{{ message.role === 'user' ? userInitial : '教练' }}</div>
              <div class="assistant-bubble"><p>{{ message.content }}</p></div>
            </article>
            <article v-if="sending" class="assistant-message assistant">
              <div class="assistant-avatar">教练</div>
              <div class="assistant-bubble"><p>正在结合你的运动记录生成建议……</p></div>
            </article>
          </div>

          <div class="assistant-prompts">
            <button v-for="prompt in quickPrompts" :key="prompt" type="button" @click="ask(prompt)">{{ prompt }}</button>
          </div>

          <form class="assistant-composer" @submit.prevent="submit">
            <textarea v-model.trim="draft" rows="2" placeholder="问问今天怎么练、如何恢复或下一次跑步安排……" @keydown.enter.exact.prevent="submit"></textarea>
            <button class="primary-link" type="submit" :disabled="sending || !draft">
              <Send :size="16" />
              发送
            </button>
          </form>
          <p v-if="chatError" class="form-error">{{ chatError }}</p>
        </template>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <h2>推荐训练</h2>
            <p>从已有课程与训练建议中挑选适合继续阅读的内容。</p>
          </div>
        </div>
        <StateBlock v-if="recommendationLoading" title="正在加载推荐" message="正在读取训练建议和课程。" />
        <StateBlock
          v-else-if="recommendationError"
          title="推荐暂时不可用"
          :message="recommendationError"
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
.coach-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  gap: 18px;
  align-items: start;
}
.recommendation-list { display: grid; gap: 12px; }
.recommendation-card {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
}
.recommendation-card h3 { margin: 6px 0; }
@media (max-width: 900px) { .coach-grid { grid-template-columns: 1fr; } }
</style>
