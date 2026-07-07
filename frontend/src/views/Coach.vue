<template>
  <div class="page-stack coach-page">
    <section class="coach-summary-card">
      <div class="coach-summary-card__top">
        <span class="ai-mode-pill" :class="{ fallback: modelStatus.fallback }">
          <span class="dot" aria-hidden="true"></span>
          {{ modelStatus.label }}
        </span>
        <span class="status-chip" :class="mlRiskTone">{{ mlRiskLabel }}</span>
      </div>

      <div class="coach-summary-card__main">
        <div class="coach-score-ring" :style="{ '--score-position': `${readinessScoreValue}%` }">
          <small>训练指数</small>
          <strong>{{ readinessScoreDisplay }}</strong>
        </div>
        <div class="coach-summary-copy">
          <h2>{{ loadActionLabel }}</h2>
          <p>{{ coachSummaryText }}</p>
        </div>
      </div>

      <div v-if="topFactors.length" class="factor-strip">
        <span v-for="factor in topFactors" :key="factor">{{ factor }}</span>
      </div>

      <div class="feedback-actions" aria-label="建议反馈">
        <span>建议反馈</span>
        <button
          v-for="option in feedbackOptions"
          :key="option.value"
          type="button"
          :disabled="feedbackSending"
          @click="sendFeedback(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <p v-if="feedbackMessage" class="soft-note">{{ feedbackMessage }}</p>
    </section>

    <section class="chat-surface">
      <div class="chat-surface__head">
        <div>
          <h2>教练</h2>
        </div>
      </div>

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
        <div v-if="messages.length === 0" class="chat-empty-state">
          <strong>从一个问题开始</strong>
          <p>你可以让教练把训练、恢复和目标拆成下一次可执行安排。</p>
        </div>
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

    <section class="morning-readiness-card">
      <div class="readiness-head">
        <h2>晨间状态</h2>
      </div>
      <form class="readiness-form" @submit.prevent="saveReadiness">
        <label class="readiness-range">
          <span>主观状态 <b>{{ readinessForm.readinessScore }}/5</b></span>
          <input v-model.number="readinessForm.readinessScore" type="range" min="1" max="5" step="1" />
        </label>

        <div class="readiness-option-grid">
          <div class="segmented-field">
          <span>肌肉酸痛</span>
          <div>
            <button
              v-for="option in sorenessOptions"
              :key="option.value"
              type="button"
              :class="{ active: readinessForm.muscleSoreness === option.value }"
              @click="readinessForm.muscleSoreness = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          </div>

          <div class="segmented-field">
          <span>训练意愿</span>
          <div>
            <button
              v-for="option in willingnessOptions"
              :key="option.value"
              type="button"
              :class="{ active: readinessForm.trainingWillingness === option.value }"
              @click="readinessForm.trainingWillingness = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          </div>
        </div>

        <div class="readiness-note-row">
          <textarea v-model.trim="readinessForm.note" rows="1" maxlength="180" placeholder="身体备注"></textarea>
          <button class="save-readiness-btn" type="submit" :disabled="readinessSending">
            <Check :size="16" />
            {{ readinessSending ? '保存中' : '保存' }}
          </button>
        </div>
      </form>
      <p v-if="readinessMessage" class="soft-note">{{ readinessMessage }}</p>
    </section>

    <section class="coach-course-panel">
      <div class="section-heading">
        <div>
          <p class="overline">可执行建议</p>
          <h2>推荐训练</h2>
        </div>
        <span class="status-chip good">{{ courseIntensityLabel }}</span>
      </div>
      <StateBlock v-if="recommendationLoading" title="正在加载推荐" message="正在读取训练建议。" />
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
        message="有更多训练数据后，这里会展示推荐训练。"
      />
      <div v-else class="recommendation-list">
        <article v-for="item in recommendations" :key="item.id" class="recommendation-card">
          <div class="recommendation-card__icon" aria-hidden="true">
            <Check :size="22" />
          </div>
          <div class="recommendation-card__body">
            <div class="recommendation-card__top">
              <small class="course-pill">{{ typeLabel(item.type) }}</small>
              <span>{{ recommendationMeta(item).duration }}</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary || item.content || '打开教练对话，结合你的情况继续询问。' }}</p>
            <small>{{ recommendationMeta(item).reason }} · {{ recommendationMeta(item).intensity }}</small>
          </div>
          <button class="course-plan-btn" type="button" @click="ask(coursePrompt(item))">
            <Check :size="15" />
            加入
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { Check, Send } from '@lucide/vue'

import StateBlock from '@/components/StateBlock.vue'
import {
  getAiHealth,
  getDailyBrief,
  sendAiMessage,
  submitAiFeedback,
  submitMorningReadiness,
} from '@/services/ai'
import { getExploreRecommendations } from '@/services/explore'
import { authSession } from '@/stores/authStore'

const quickPrompts = ['今天怎么练？', '恢复怎么安排？', '下一次跑步怎么跑？', '比赛配速建议']
const feedbackOptions = [
  { label: '有帮助', value: 'helpful' },
  { label: '太保守', value: 'too_conservative' },
  { label: '太激进', value: 'too_aggressive' },
  { label: '不符合状态', value: 'not_matching_body' },
]
const sorenessOptions = [
  { label: '无', value: 'none' },
  { label: '轻微', value: 'mild' },
  { label: '明显', value: 'obvious' },
]
const willingnessOptions = [
  { label: '休息', value: 'rest' },
  { label: '轻松练', value: 'easy' },
  { label: '按计划', value: 'normal' },
]
const messages = ref([])
const recommendations = ref([])
const modelHealth = ref(null)
const dailyBrief = ref(null)
const draft = ref('')
const aiLoading = ref(false)
const recommendationLoading = ref(false)
const sending = ref(false)
const feedbackSending = ref(false)
const readinessSending = ref(false)
const aiError = ref('')
const recommendationError = ref('')
const chatError = ref('')
const feedbackMessage = ref('')
const readinessMessage = ref('')
const messageListRef = ref(null)
const readinessForm = ref({
  readinessScore: 3,
  muscleSoreness: 'none',
  mentalState: 'normal',
  trainingWillingness: 'easy',
  note: '',
})

const userInitial = computed(() => (authSession.user?.username || '我').slice(0, 1).toUpperCase())
const modelStatus = computed(() => {
  if (aiLoading.value) return { label: '连接中', fallback: true }
  if (modelHealth.value?.status === 'ok') return { label: '教练在线', fallback: false }
  return { label: '基础建议', fallback: true }
})
const mlInsight = computed(() => dailyBrief.value?.ml || null)
const topFactors = computed(() => (mlInsight.value?.topFactors || []).slice(0, 4))
const readinessScoreValue = computed(() => {
  const score = Number(mlInsight.value?.readinessScore)
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
})
const readinessScoreDisplay = computed(() => (mlInsight.value?.readinessScore ?? '--'))
const coachProviderLabel = computed(() => {
  if (mlInsight.value?.provider === 'local_model') return '本地模型'
  if (mlInsight.value?.provider === 'rules') return '规则基线'
  if (modelHealth.value?.coach?.modelAvailable) return '模型就绪'
  return modelStatus.value.label
})
const loadActionLabel = computed(() => ({
  rest: '休息',
  reduce: '降负荷',
  maintain: '维持',
  progress: '推进',
}[mlInsight.value?.loadAction] || '待判断'))
const coachSummaryText = computed(() => ({
  rest: '今天优先恢复，把睡眠、拉伸和轻活动放在训练前面。',
  reduce: '身体负荷偏高，建议缩短时长并把强度控制在轻松区间。',
  maintain: '状态比较稳定，可以按计划完成一次有氧或技术训练。',
  progress: '恢复和负荷条件允许，可以安排一次更有质量的训练。',
}[mlInsight.value?.loadAction] || '同步近期训练和恢复数据后，教练会给出更具体的安排。'))
const mlRiskLabel = computed(() => ({
  green: '低风险',
  yellow: '注意',
  orange: '降负荷',
  red: '恢复优先',
}[mlInsight.value?.riskLevel] || '等待数据'))
const mlRiskTone = computed(() => {
  if (['red', 'orange'].includes(mlInsight.value?.riskLevel)) return 'warning'
  if (mlInsight.value?.riskLevel === 'green') return 'good'
  return 'steady'
})
const courseFocusLabel = computed(() => ({
  rest: '恢复吸收',
  reduce: '降负荷练习',
  maintain: '稳定堆量',
  progress: '推进能力',
}[mlInsight.value?.loadAction] || '跑步能力'))
const courseIntensityLabel = computed(() => ({
  red: '只做恢复',
  orange: '轻强度',
  yellow: '中低强度',
  green: '按计划推进',
}[mlInsight.value?.riskLevel] || '按状态调整'))

function typeLabel(type) {
  return { course: '训练课程', article: '运动知识', training_advice: '训练建议' }[type] || '推荐内容'
}

function recommendationMeta(item) {
  const type = item?.type || 'course'
  const risk = mlInsight.value?.riskLevel || 'yellow'
  const isCourse = type === 'course'
  const isAdvice = type === 'training_advice'
  const intensityLevel = risk === 'green' && isCourse ? 3 : ['red', 'orange'].includes(risk) ? 1 : 2

  return {
    goal: isCourse ? '跑步专项' : isAdvice ? '训练决策' : '知识补给',
    duration: item?.readTime || (isCourse ? '20-40 分钟' : '5-10 分钟'),
    reason: isCourse ? courseFocusLabel.value : isAdvice ? '匹配今日状态' : '补齐训练认知',
    intensity: ['轻强度', '中等强度', '高强度'][intensityLevel - 1],
    intensityLevel,
  }
}

function coursePrompt(item) {
  return `把「${item.title}」加入今日计划，结合我的恢复状态给出强度、时长和配速安排。`
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

async function loadDailyBrief() {
  try {
    const envelope = await getDailyBrief()
    dailyBrief.value = envelope.data || null
  } catch (_error) {
    dailyBrief.value = null
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
  return Promise.allSettled([loadAiStatus(), loadDailyBrief(), loadRecommendations()])
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

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function sendFeedback(feedback) {
  if (feedbackSending.value) return
  const ml = mlInsight.value || {}
  feedbackSending.value = true
  feedbackMessage.value = ''
  try {
    await submitAiFeedback({
      suggestionType: 'daily_brief',
      feedback,
      suggestionDate: localDateString(),
      modelVersion: ml.modelVersion || modelHealth.value?.coach?.modelVersion || 'coach-v1',
      ml: {
        provider: ml.provider || coachProviderLabel.value,
        riskLevel: ml.riskLevel || null,
        loadAction: ml.loadAction || null,
        weatherRisk: ml.weatherRisk || null,
      },
    })
    feedbackMessage.value = '建议反馈已保存'
  } catch (_error) {
    feedbackMessage.value = '建议反馈保存失败'
  } finally {
    feedbackSending.value = false
  }
}

async function saveReadiness() {
  if (readinessSending.value) return
  readinessSending.value = true
  readinessMessage.value = ''
  try {
    await submitMorningReadiness({
      feedbackDate: localDateString(),
      ...readinessForm.value,
    })
    readinessMessage.value = '晨间状态已保存'
  } catch (_error) {
    readinessMessage.value = '晨间状态保存失败'
  } finally {
    readinessSending.value = false
  }
}

onMounted(loadCoach)
</script>

<style scoped>
.ai-mode-pill {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--app-green) 34%, var(--border));
  border-radius: var(--radius-pill);
  color: var(--green-strong);
  background: color-mix(in srgb, var(--app-green) 10%, var(--panel));
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.ai-mode-pill .dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  margin-right: 6px;
  vertical-align: middle;
}
.ai-mode-pill.fallback {
  border-color: color-mix(in srgb, var(--app-amber) 34%, var(--border));
  color: var(--app-amber);
  background: color-mix(in srgb, var(--app-amber) 10%, var(--panel));
}
.ai-mode-pill.fallback .dot { background: var(--app-amber); }

.status-chip.warning,
.status-chip.steady {
  color: var(--app-amber);
  border-color: color-mix(in srgb, var(--app-amber) 38%, var(--border));
  background: color-mix(in srgb, var(--app-amber) 9%, var(--panel));
}

.status-chip.good {
  background: color-mix(in srgb, var(--app-green) 10%, var(--panel));
}

.coach-summary-card,
.morning-readiness-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: var(--space-5);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--app-green) 16%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.coach-summary-card {
  overflow: hidden;
  border-top: 4px solid var(--app-green);
  background:
    radial-gradient(90% 100% at 0% 0%, color-mix(in srgb, var(--app-blue) 10%, transparent), transparent 52%),
    var(--panel);
}

.coach-summary-card__top,
.coach-summary-card__main,
.chat-surface__head,
.recommendation-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 12px;
}

.coach-summary-card__main {
  align-items: stretch;
  justify-content: flex-start;
}

.coach-score-ring {
  flex: 0 0 96px;
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  border-radius: 24px;
  background:
    linear-gradient(var(--panel), var(--panel)) padding-box,
    conic-gradient(var(--app-green) 0 var(--score-position), color-mix(in srgb, var(--app-blue) 20%, var(--border)) var(--score-position) 100%) border-box;
  border: 8px solid transparent;
}

.coach-score-ring small,
.segmented-field > span,
.readiness-range > span,
.recommendation-card small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.coach-score-ring strong {
  color: var(--text);
  font-size: 34px;
  line-height: 1;
}

.coach-summary-copy {
  display: grid;
  align-content: center;
  min-width: 0;
  gap: 5px;
}

.coach-summary-copy h2 {
  margin: 0;
  font-size: 26px;
  line-height: 1.1;
}

.coach-summary-copy p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.factor-strip,
.feedback-actions {
  display: flex;
  min-width: 0;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.factor-strip::-webkit-scrollbar,
.feedback-actions::-webkit-scrollbar { display: none; }

.factor-strip span {
  flex: 0 0 auto;
  max-width: 220px;
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel-soft));
  color: var(--green-strong);
  font-size: 12px;
  white-space: nowrap;
}

.feedback-actions {
  align-items: center;
  padding-top: 2px;
}

.feedback-actions > span {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.feedback-actions button,
.segmented-field button {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel-soft);
  color: var(--text);
  font-size: 13px;
  white-space: nowrap;
}

.feedback-actions button {
  padding: 7px 11px;
}

.readiness-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.readiness-head h2 {
  margin: 0;
  font-size: var(--fs-title);
  line-height: 1.15;
}

.readiness-form {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.readiness-range,
.segmented-field {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.readiness-range > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.readiness-range > span b {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  color: var(--green-strong);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel-soft));
  font-size: 13px;
  line-height: 1.2;
}

.readiness-range input {
  width: 100%;
  accent-color: var(--green);
}

.readiness-option-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.segmented-field > div {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  gap: 6px;
}

.segmented-field button {
  padding: 7px 10px;
}

.segmented-field button.active {
  border-color: transparent;
  background: var(--green);
  color: #04240f;
}

.readiness-note-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: stretch;
}

.readiness-form textarea {
  width: 100%;
  min-height: 46px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--text);
  resize: none;
  line-height: 1.5;
  padding: 11px 12px;
}

.readiness-form textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--green) 30%, transparent);
}

.save-readiness-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  gap: 6px;
  min-width: 86px;
  min-height: 46px;
  padding: 0 13px;
  border: none;
  border-radius: 12px;
  background: var(--green);
  color: #04240f;
  font-weight: 700;
}

.chat-surface {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  gap: 12px;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--app-blue) 14%, var(--border));
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.chat-surface__head h2 {
  margin: 2px 0 0;
  font-size: var(--fs-title);
}

.chat-empty-state {
  display: grid;
  gap: 6px;
  min-height: 128px;
  align-content: center;
  padding: 18px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-blue) 6%, var(--panel-soft));
}

.chat-empty-state strong {
  font-size: 20px;
}

.chat-empty-state p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  gap: 12px;
  max-height: 44vh;
  min-height: 180px;
  overflow-y: auto;
  scrollbar-width: none;
}
.chat-messages::-webkit-scrollbar { display: none; }

.chat-message {
  display: flex;
  min-width: 0;
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
  min-width: 0;
  padding: 10px 14px;
  border-radius: 16px;
  background: var(--panel-soft);
  line-height: 1.5;
  overflow-wrap: anywhere;
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
  width: 100%;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 1px;
}
.quick-prompts::-webkit-scrollbar { display: none; }
.quick-prompts button {
  flex: 0 0 auto;
  padding: 7px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--panel-soft);
  color: var(--text);
  font-size: 13px;
  white-space: nowrap;
}

.chat-composer {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-end;
  gap: 10px;
  padding: 7px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--panel-soft);
}
.chat-composer textarea {
  flex: 1;
  min-width: 0;
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
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: none;
  background: var(--green);
  color: #04240f;
}

.coach-course-panel {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.coach-course-panel .overline,
.coach-course-panel h2 {
  margin: 0;
}

.recommendation-list { display: grid; min-width: 0; gap: 12px; }
.recommendation-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--panel-soft);
}

.recommendation-card__icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--green-strong);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel));
}

.recommendation-card__body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.recommendation-card__top {
  justify-content: space-between;
  gap: 8px;
}

.recommendation-card__top > span {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.course-pill {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 5px 9px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 12%, transparent);
  color: var(--green-strong);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.recommendation-card h3 {
  min-width: 0;
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommendation-card p {
  display: -webkit-box;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--muted);
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.course-plan-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--green);
  color: #04240f;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 640px) {
  .coach-score-ring {
    flex-basis: 88px;
    width: 88px;
    height: 88px;
    border-width: 7px;
  }

  .coach-summary-copy h2 {
    font-size: 24px;
  }
}

@container phone-frame (max-width: 390px) {
  .coach-summary-card__main {
    gap: 10px;
  }

  .coach-score-ring {
    flex-basis: 82px;
    width: 82px;
    height: 82px;
  }

  .coach-score-ring strong {
    font-size: 28px;
  }

  .readiness-option-grid,
  .readiness-note-row {
    grid-template-columns: 1fr;
  }

  .recommendation-card {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .recommendation-card__icon {
    width: 46px;
    height: 46px;
  }

  .course-plan-btn {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
}
</style>
