<template>
  <div class="page-stack coach-page">
    <section class="coach-head">
      <div>
        <p class="overline">智能教练</p>
        <h2>训练建议</h2>
      </div>
      <span class="ai-mode-pill" :class="{ fallback: modelStatus.fallback }">
        <span class="dot" aria-hidden="true"></span>
        {{ modelStatus.label }}
      </span>
    </section>

    <section class="coach-insight-panel">
      <div class="section-heading">
        <div>
          <p class="overline">每日简报</p>
          <h2>恢复建议</h2>
        </div>
        <span class="status-chip">{{ modelStatus.label }}</span>
      </div>
      <p>把近期训练、恢复和目标放在同一个对话里，优先生成可执行的下一次训练安排。</p>
      <div class="coach-prescription-grid">
        <span>
          <small>训练处方</small>
          <b>强度 / 时长 / 配速</b>
        </span>
        <span>
          <small>恢复建议</small>
          <b>睡眠 / 压力 / 心率变异</b>
        </span>
        <span>
          <small>比赛策略</small>
          <b>补给 / 分段 / 目标</b>
        </span>
      </div>
    </section>

    <section class="coach-ml-panel">
      <div class="section-heading">
        <div>
          <p class="overline">本地教练模型</p>
          <h2>模型判断</h2>
        </div>
        <span class="status-chip" :class="mlRiskTone">{{ mlRiskLabel }}</span>
      </div>

      <div class="coach-ml-score">
        <span>
          <small>准备度</small>
          <strong>{{ readinessScoreDisplay }}</strong>
        </span>
        <div class="coach-ml-score__track" :style="{ '--score-position': `${readinessScoreValue}%` }">
          <i aria-hidden="true"></i>
        </div>
      </div>

      <div class="coach-ml-metrics">
        <span><small>模型来源</small><b>{{ coachProviderLabel }}</b></span>
        <span><small>训练动作</small><b>{{ loadActionLabel }}</b></span>
        <span><small>置信度</small><b>{{ confidenceDisplay }}</b></span>
        <span><small>数据完整度</small><b>{{ dataCompletenessDisplay }}</b></span>
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

    <section class="morning-readiness-card">
      <div class="section-heading">
        <div>
          <p class="overline">主观输入</p>
          <h2>晨间状态</h2>
        </div>
      </div>
      <form class="readiness-form" @submit.prevent="saveReadiness">
        <label class="readiness-range">
          <span>主观状态 <b>{{ readinessForm.readinessScore }}/5</b></span>
          <input v-model.number="readinessForm.readinessScore" type="range" min="1" max="5" step="1" />
        </label>

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

        <textarea v-model.trim="readinessForm.note" rows="2" maxlength="180" placeholder="今天的身体备注"></textarea>
        <button class="save-readiness-btn" type="submit" :disabled="readinessSending">
          <Check :size="16" />
          {{ readinessSending ? '保存中' : '保存状态' }}
        </button>
      </form>
      <p v-if="readinessMessage" class="soft-note">{{ readinessMessage }}</p>
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

    <section class="coach-course-panel">
      <div class="section-heading">
        <div>
          <p class="overline">训练建议</p>
          <h2>推荐训练</h2>
        </div>
        <span class="status-chip good">推荐训练</span>
      </div>
      <div class="course-prescription-strip">
        <span>
          <small>本周重点</small>
          <b>{{ courseFocusLabel }}</b>
        </span>
        <span>
          <small>强度控制</small>
          <b>{{ courseIntensityLabel }}</b>
        </span>
        <span>
          <small>执行方式</small>
          <b>建议 + 教练追问</b>
        </span>
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
          <div class="recommendation-card__top">
            <small class="course-pill">{{ typeLabel(item.type) }}</small>
            <span class="course-intensity-ladder" :aria-label="recommendationMeta(item).intensity">
              <i :class="{ active: recommendationMeta(item).intensityLevel >= 1 }">轻</i>
              <i :class="{ active: recommendationMeta(item).intensityLevel >= 2 }">中</i>
              <i :class="{ active: recommendationMeta(item).intensityLevel >= 3 }">强</i>
            </span>
          </div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.summary || item.content || '打开教练对话，结合你的情况继续询问。' }}</p>
          <div class="recommendation-card__metrics">
            <span><small>训练目标</small><b>{{ recommendationMeta(item).goal }}</b></span>
            <span><small>预计时长</small><b>{{ recommendationMeta(item).duration }}</b></span>
            <span><small>推荐原因</small><b>{{ recommendationMeta(item).reason }}</b></span>
          </div>
          <button class="course-plan-btn" type="button" @click="ask(coursePrompt(item))">
            <Check :size="15" />
            加入今日计划
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

const quickPrompts = ['生成训练处方', '恢复建议怎么做？', '下一次跑步怎么安排？', '比赛配速怎么拆？']
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
const confidenceDisplay = computed(() => {
  const confidence = Number(mlInsight.value?.confidence)
  return Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : '--'
})
const dataCompletenessDisplay = computed(() => {
  const score = Number(mlInsight.value?.dataCompleteness?.score)
  return Number.isFinite(score) ? `${Math.round(score)}%` : '--'
})
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
}[mlInsight.value?.loadAction] || '--'))
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
.coach-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-radius: var(--radius-xl);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.coach-head > div { min-width: 0; }
.coach-head h2 {
  margin: 2px 0 0;
  font-size: 24px;
  line-height: 1.15;
}
.coach-head .overline { margin: 0; }

.coach-insight-panel {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.coach-insight-panel p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.coach-prescription-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.coach-prescription-grid span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-radius: 10px;
  background: var(--panel-soft);
}

.coach-prescription-grid small {
  color: var(--muted);
  font-size: 11px;
}

.coach-prescription-grid b {
  color: var(--text);
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ai-mode-pill {
  flex: 0 0 auto;
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
.ai-mode-pill.fallback .dot { background: var(--orange); }

.coach-ml-panel,
.morning-readiness-card {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: var(--space-5);
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.coach-ml-score {
  display: grid;
  gap: 10px;
}

.coach-ml-score span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.coach-ml-score small,
.coach-ml-metrics small,
.segmented-field > span,
.readiness-range > span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.coach-ml-score strong {
  font-size: 34px;
  line-height: 1;
}

.coach-ml-score__track {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, #ef4444, #f59e0b 42%, var(--green) 78%);
}

.coach-ml-score__track i {
  position: absolute;
  top: -4px;
  left: clamp(0%, var(--score-position), 100%);
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--text);
  transform: translateX(-2px);
}

.coach-ml-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.coach-ml-metrics span {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 10px;
  border-radius: 10px;
  background: var(--panel-soft);
}

.coach-ml-metrics b {
  min-width: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
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
  padding: 7px 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 12%, var(--panel-soft));
  color: var(--green-strong);
  font-size: 12px;
  white-space: nowrap;
}

.feedback-actions {
  align-items: center;
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
  padding: 8px 12px;
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
  justify-content: space-between;
  gap: 12px;
}

.readiness-range input {
  width: 100%;
  accent-color: var(--green);
}

.segmented-field > div {
  display: flex;
  min-width: 0;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.segmented-field > div::-webkit-scrollbar { display: none; }

.segmented-field button {
  padding: 8px 13px;
}

.segmented-field button.active {
  border-color: transparent;
  background: var(--green);
  color: #04240f;
}

.readiness-form textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--text);
  resize: vertical;
  line-height: 1.5;
  padding: 10px 12px;
}

.readiness-form textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--green) 30%, transparent);
}

.save-readiness-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
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
  width: 100%;
  min-width: 0;
  gap: 12px;
  max-height: 48vh;
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
  width: 100%;
  min-width: 0;
  align-items: flex-end;
  gap: 10px;
  padding: 8px;
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
  width: 44px;
  height: 44px;
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
  gap: 14px;
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

.course-prescription-strip,
.recommendation-card__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.course-prescription-strip span,
.recommendation-card__metrics span {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
}

.course-prescription-strip small,
.recommendation-card__metrics small {
  color: var(--muted);
  font-size: 11px;
}

.course-prescription-strip b,
.recommendation-card__metrics b {
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.recommendation-list { display: grid; min-width: 0; gap: 12px; }
.recommendation-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--panel-soft);
}
.recommendation-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.course-pill {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 60%;
  padding: 5px 9px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-green) 12%, transparent);
  color: var(--green-strong);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.course-intensity-ladder {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  min-width: 86px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--panel);
}
.course-intensity-ladder i {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 22px;
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}
.course-intensity-ladder i.active {
  background: var(--app-green);
  color: #04240f;
}
.recommendation-card h3 { margin: 0; font-size: var(--fs-title); line-height: 1.28; }
.recommendation-card p { margin: 0; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
.course-plan-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  gap: 6px;
  min-height: 38px;
  padding: 0 13px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--green);
  color: #04240f;
  font-size: 13px;
  font-weight: 800;
}

@media (max-width: 640px) {
  .coach-prescription-grid,
  .coach-ml-metrics,
  .course-prescription-strip,
  .recommendation-card__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .coach-ml-score strong {
    font-size: 30px;
  }
}
</style>
