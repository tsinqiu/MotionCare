<template>
  <div class="page-stack">
    <StateBlock
      v-if="error"
      title="今日状态加载失败"
      :message="error"
      action-label="重试"
      tone="danger"
      @action="reloadToday"
    />

    <template v-else>
      <div class="today-layout">
        <section class="dark-panel start-workout-panel compact">
          <div>
            <p class="overline">浏览器模拟运动</p>
            <h2>开始运动</h2>
            <p>快速记录一次浏览器运动，并写入运动记录。</p>
          </div>
          <RouterLink class="start-fab" to="/start">
            <Play :size="18" />
            开始运动
          </RouterLink>
        </section>

        <section class="dark-panel training-panel ai-brief-panel">
          <div class="section-heading">
            <div>
              <p class="overline">AI Brief</p>
              <h2>智能运动简报</h2>
            </div>
            <span class="ai-mode-pill" :class="{ fallback: aiFallback }">{{ aiModeLabel }}</span>
          </div>
          <div class="ai-brief-copy">
            <strong>{{ aiHeadline }}</strong>
            <span v-if="aiRiskLabel" class="status-chip" :class="aiRiskTone">{{ aiRiskLabel }}</span>
            <p>{{ aiRecommendation }}</p>
          </div>
          <div v-if="mlSignals.length" class="ml-signal-row">
            <span v-for="signal in mlSignals" :key="signal.label">
              <small>{{ signal.label }}</small>
              <b>{{ signal.value }}</b>
            </span>
          </div>
          <details v-if="mlInsightItems.length" class="ml-insight-panel">
            <summary>智能依据</summary>
            <div>
              <span v-for="item in mlInsightItems" :key="item.label">
                <small>{{ item.label }}</small>
                <b>{{ item.value }}</b>
              </span>
            </div>
          </details>
          <div v-if="aiBrief.ml" class="feedback-row">
            <button
              v-for="item in feedbackOptions"
              :key="item.value"
              type="button"
              :disabled="feedbackSending || feedbackValue === item.value"
              @click="submitFeedback(item.value)"
            >
              {{ feedbackValue === item.value ? '已记录' : item.label }}
            </button>
          </div>
          <p v-if="feedbackMessage" class="feedback-message">{{ feedbackMessage }}</p>
          <div class="ai-brief-sections">
            <span
              v-for="section in aiSections"
              :key="section.key"
              :class="section.tone"
            >
              <small>{{ section.title }}</small>
              <b>{{ section.text }}</b>
            </span>
          </div>
          <p v-if="aiError" class="ai-brief-error">
            {{ aiError }}
            <button type="button" @click="loadAiBrief">重新生成</button>
          </p>
          <div class="training-targets">
            <span
              v-for="metric in aiMetrics"
              :key="metric.label"
              :class="metric.tone"
            >
              <small>{{ metric.label }}</small>
              <b>{{ metric.value }}</b>
            </span>
          </div>
        </section>
      </div>

      <div class="metric-grid">
        <MetricCard label="本月活动" :value="`${overview.monthlySummary?.activityCount || 0}`" />
        <MetricCard label="本月距离" :value="formatDistance((overview.monthlySummary?.totalDistanceKm || 0) * 1000)" />
        <MetricCard label="训练负荷" :value="`${overview.yearlySummary?.totalTrainingLoad || 0}`" />
        <MetricCard label="平均心率" :value="`${overview.monthlySummary?.avgHeartRateBpm || '--'} bpm`" />
      </div>

      <section class="dark-panel" v-if="healthData">
        <div class="section-heading">
          <div>
            <h2>今日身体状态</h2>
          </div>
        </div>
        <div class="health-grid">
          <span><small>步数</small><b>{{ healthData.steps ?? '--' }}</b></span>
          <span><small>活跃卡路里</small><b>{{ healthData.activeCalories ?? '--' }}</b></span>
          <span><small>强度分钟</small><b>{{ healthData.moderateIntensityMinutes ?? 0 }}/{{ healthData.vigorousIntensityMinutes ?? 0 }} 分</b></span>
          <span><small>静息心率</small><b>{{ healthData.restingHeartRateBpm ?? '--' }} bpm</b></span>
          <span><small>压力</small><b>{{ healthData.avgStressLevel ?? '--' }}</b></span>
          <span><small>睡眠</small><b>{{ healthData.sleepScore ?? '--' }}/100</b></span>
          <span><small>深睡</small><b>{{ healthData.deepSleepS ? (healthData.deepSleepS/3600).toFixed(1) : '--' }}h</b></span>
          <span><small>HRV</small><b>{{ healthData.avgHrv ?? '--' }} <template v-if="healthData.hrvStatus">({{ healthData.hrvStatus }})</template></b></span>
          <span><small>睡眠心率</small><b>{{ healthData.avgHeartRateDuringSleep ?? '--' }} bpm</b></span>
          <span v-if="healthData.trainingStatus"><small>训练状态</small><b>{{ healthData.trainingStatus }}</b></span>
          <span v-if="healthData.vo2max"><small>VO2max</small><b>{{ healthData.vo2max }}</b></span>
          <span v-if="healthData.cyclingFtp"><small>FTP</small><b>{{ healthData.cyclingFtp }} W</b></span>
        </div>
        <div class="section-footer">
          <RouterLink to="/health" class="text-link">查看完整健康详情 →</RouterLink>
        </div>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <h2>最近运动</h2>
          </div>
          <RouterLink to="/activities">全部记录</RouterLink>
        </div>
        <div class="activity-card-grid">
          <ActivityCard
            v-for="activity in recentActivities"
            :key="activity.id"
            :activity="activity"
            @select="router.push(`/activities/${activity.id}`)"
          />
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Play } from '@lucide/vue'

import ActivityCard from '@/components/ActivityCard.vue'
import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { getDailyBrief, sendAiFeedback } from '@/services/ai'
import { getDashboardOverview } from '@/services/dashboard'
import { formatDistance } from '@/utils/formatters'
import { getTodayHealth } from '@/services/dashboard'

const router = useRouter()
const defaultOverview = {
  recentActivities: [],
  monthlySummary: {},
  yearlySummary: {},
  trainingLoad: [],
}
const defaultBrief = {
  headline: '正在生成智能运动简报',
  sections: [
    { key: 'recent', title: '近期运动', tone: 'steady', text: '正在读取最近运动记录。' },
    { key: 'body', title: '负荷状态', tone: 'steady', text: '正在分析训练负荷和恢复状态。' },
    { key: 'sleep', title: '睡眠恢复', tone: 'steady', text: '正在读取睡眠、HRV 和压力数据。' },
    { key: 'weather', title: '天气影响', tone: 'steady', text: '正在结合活动天气和体感温度。' },
    { key: 'today', title: '今日安排', tone: 'steady', text: '正在生成今日训练建议。' },
  ],
  metrics: [
    { label: '最近负荷', value: '--', tone: 'steady' },
    { label: 'CTL', value: '--', tone: 'steady' },
    { label: 'ATL', value: '--', tone: 'steady' },
    { label: 'TSB', value: '--', tone: 'steady' },
  ],
  recommendation: '正在读取近期运动、训练负荷和今日状态，请稍候。',
}

const sectionDefaults = [
  { key: 'recent', title: '近期运动', tone: 'steady', text: '已读取最近运动记录，可结合活动频率、距离和类型判断训练连续性。' },
  { key: 'body', title: '负荷状态', tone: 'steady', text: '已读取训练负荷指标，可结合 CTL、ATL、TSB 判断恢复状态。' },
  { key: 'sleep', title: '睡眠恢复', tone: 'steady', text: '睡眠、HRV 和压力数据会用于判断恢复优先级。' },
  { key: 'weather', title: '天气影响', tone: 'steady', text: '温度、湿度和天气状况会用于修正训练建议。' },
  { key: 'today', title: '今日安排', tone: 'steady', text: '建议结合近期负荷安排训练强度，避免连续高强度刺激。' },
]

function normalizeBrief(brief) {
  const source = brief && typeof brief === 'object' ? brief : {}
  const sections = Array.isArray(source.sections) ? source.sections : []
  const metrics = Array.isArray(source.metrics) ? source.metrics : defaultBrief.metrics

  return {
    headline: source.headline || defaultBrief.headline,
    riskLevel: source.riskLevel || '',
    ml: source.ml || null,
    recommendation: source.recommendation || defaultBrief.recommendation,
    placements: source.placements || {},
    sections: sectionDefaults.map((fallback, index) => {
      const item = sections.find((candidate) => candidate?.key === fallback.key) || sections[index] || {}
      return {
        key: item.key || fallback.key,
        title: item.title || fallback.title,
        tone: item.tone || fallback.tone,
        text: item.text || fallback.text,
      }
    }),
    metrics: metrics.map((metric, index) => ({
      label: metric.label || defaultBrief.metrics[index]?.label || '指标',
      value: metric.value ?? defaultBrief.metrics[index]?.value ?? '--',
      tone: metric.tone || defaultBrief.metrics[index]?.tone || 'steady',
    })),
  }
}

async function loadAiBrief() {
  aiLoading.value = true
  aiError.value = ''
  aiBrief.value = normalizeBrief(defaultBrief)
  aiMeta.value = { ai: { fallback: true, provider: 'loading' } }
  try {
    const briefEnvelope = await getDailyBrief()
    aiBrief.value = normalizeBrief(briefEnvelope.data)
    aiMeta.value = briefEnvelope.meta || {}
  } catch (err) {
    aiBrief.value = normalizeBrief({
      ...defaultBrief,
      headline: '智能简报暂时不可用',
      recommendation: '已保留基础训练提示，可稍后重新生成。',
      sections: sectionDefaults,
    })
    aiMeta.value = { ai: { fallback: true, provider: 'rules' } }
    aiError.value = err instanceof Error ? err.message : '智能简报生成失败'
  } finally {
    aiLoading.value = false
  }
}

async function reloadToday() {
  await Promise.all([load(), loadAiBrief()])
}

const { data: overviewData, error, load } = useAsyncData(getDashboardOverview, defaultOverview)
const healthData = ref(null)
getTodayHealth().then(d => { healthData.value = d })
const aiBrief = ref(normalizeBrief(defaultBrief))
const aiMeta = ref({ ai: { fallback: true, provider: 'loading' } })
const aiLoading = ref(true)
const aiError = ref('')
const feedbackSending = ref(false)
const feedbackValue = ref('')
const feedbackMessage = ref('')

const overview = computed(() => overviewData.value || defaultOverview)
const aiFallback = computed(() => aiLoading.value || aiMeta.value?.ai?.fallback !== false)
const aiModeLabel = computed(() => {
  if (aiLoading.value) return '生成中'
  if (aiFallback.value) return '规则模式'
  const provider = aiMeta.value?.ai?.provider
  if (provider === 'deepseek') return 'DeepSeek'
  return 'AI 模型'
})
const aiHeadline = computed(() => (aiLoading.value ? defaultBrief.headline : aiBrief.value.headline))
const aiRiskLabel = computed(() => {
  const labels = { green: '风险低', yellow: '注意恢复', orange: '恢复优先', red: '高风险' }
  return labels[aiBrief.value.riskLevel] || ''
})
const aiRiskTone = computed(() => (['orange', 'red'].includes(aiBrief.value.riskLevel) ? 'danger' : aiBrief.value.riskLevel === 'green' ? 'good' : 'neutral'))
const aiRecommendation = computed(() => (aiLoading.value ? defaultBrief.recommendation : aiBrief.value.recommendation))
const aiSections = computed(() => (aiLoading.value ? defaultBrief.sections : aiBrief.value.sections))
const aiMetrics = computed(() => aiBrief.value.metrics)
const mlSignals = computed(() => {
  const ml = aiBrief.value.ml
  if (!ml) return []
  const readinessLabels = { low: '偏低', medium: '中等', high: '较好' }
  const loadActionLabels = { rest: '休息', reduce: '降负荷', maintain: '维持', progress: '推进' }
  const weatherLabels = { low: '低', medium: '中', high: '高' }
  return [
    { label: '恢复分', value: ml.readinessScore != null ? `${ml.readinessScore}` : '--' },
    { label: '恢复状态', value: readinessLabels[ml.readinessLevel] || '--' },
    { label: '负荷动作', value: loadActionLabels[ml.loadAction] || '--' },
    { label: '天气风险', value: weatherLabels[ml.weatherRisk] || '--' },
  ]
})
const feedbackOptions = [
  { label: '有用', value: 'helpful' },
  { label: '太保守', value: 'too_conservative' },
  { label: '太激进', value: 'too_aggressive' },
  { label: '不符合身体状态', value: 'not_matching_body' },
]
const mlInsightItems = computed(() => {
  const ml = aiBrief.value.ml
  if (!ml) return []
  const items = []
  const factorText = Array.isArray(ml.topFactors) && ml.topFactors.length ? ml.topFactors.join('、') : '未发现明显异常信号'
  items.push({ label: '关键原因', value: factorText })
  if (ml.dataCompleteness?.score != null) {
    items.push({ label: '数据完整度', value: `${ml.dataCompleteness.score}%` })
  }
  if (ml.confidence != null) {
    items.push({ label: '模型置信度', value: `${Math.round(Number(ml.confidence) * 100)}%` })
  }
  return items
})
async function submitFeedback(value) {
  if (!aiBrief.value.ml || feedbackSending.value) return
  feedbackSending.value = true
  feedbackMessage.value = ''
  try {
    await sendAiFeedback({
      suggestionType: 'daily_brief',
      feedback: value,
      suggestionDate: aiMeta.value?.ai?.contextSignals?.latestDate,
      modelVersion: aiBrief.value.ml.modelVersion,
      ml: aiBrief.value.ml,
    })
    feedbackValue.value = value
    feedbackMessage.value = '反馈已保存'
  } catch (err) {
    feedbackMessage.value = err instanceof Error ? err.message : '反馈保存失败'
  } finally {
    feedbackSending.value = false
  }
}
const recentActivities = computed(() => (overview.value?.recentActivities || []).slice(0, 6))

onMounted(loadAiBrief)
</script>

<style scoped>
.health-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.health-grid span {
  background: var(--bg-elevated, #1a1a2e);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.health-grid small {
  font-size: 12px;
  color: var(--text-muted, #888);
}
.health-grid b {
  font-size: 18px;
}

.ml-signal-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.ml-signal-row span {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--panel-soft);
  display: grid;
  gap: 4px;
}

.ml-signal-row small {
  color: var(--muted);
  font-size: 12px;
}

.ml-signal-row b {
  color: var(--text);
}

.ml-insight-panel {
  margin: 8px 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
  padding: 10px 12px;
}

.ml-insight-panel summary {
  cursor: pointer;
  color: var(--text);
  font-weight: 700;
}

.ml-insight-panel div {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.ml-insight-panel span {
  display: grid;
  gap: 4px;
}

.ml-insight-panel small,
.feedback-message {
  color: var(--muted);
  font-size: 12px;
}

.ml-insight-panel b {
  color: var(--text);
  line-height: 1.45;
}

.feedback-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 12px;
}

.feedback-row button {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-soft);
  color: var(--text);
  padding: 7px 10px;
  cursor: pointer;
}

.feedback-row button:disabled {
  cursor: default;
  color: var(--green);
}

@media (max-width: 800px) {
  .ml-signal-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ml-insight-panel div {
    grid-template-columns: 1fr;
  }
}
</style>
