<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <p class="overline">健康详情</p>
          <h2>身体数据</h2>
        </div>
        <div class="date-nav">
          <button class="btn-icon" type="button" @click="prevDay">‹</button>
          <input v-model="selectedDate" type="date" class="date-input" />
          <button class="btn-icon" type="button" @click="nextDay">›</button>
        </div>
      </div>
    </section>

    <StateBlock v-if="loading" title="加载中..." message="正在获取健康数据" />
    <StateBlock v-else-if="error" title="加载失败" :message="error" tone="danger" action-label="重试" @action="loadAll" />

    <template v-else>
      <div class="metric-grid">
        <MetricCard label="步数" :value="summary.steps != null ? `${summary.steps}` : '--'" />
        <MetricCard label="距离" :value="summary.distanceM != null ? `${(summary.distanceM / 1000).toFixed(2)} km` : '--'" />
        <MetricCard label="活跃卡路里" :value="summary.activeCalories != null ? `${summary.activeCalories}` : '--'" />
        <MetricCard label="强度分钟" :value="intensitySummary" />
        <MetricCard label="静息心率" :value="summary.restingHeartRateBpm != null ? `${summary.restingHeartRateBpm} bpm` : '--'" />
        <MetricCard label="平均压力" :value="summary.avgStressLevel != null ? `${summary.avgStressLevel}` : '--'" />
        <MetricCard label="睡眠评分" :value="summary.sleepScore != null ? `${summary.sleepScore}/100` : '--'" />
        <MetricCard label="HRV" :value="summary.avgHrv != null ? `${summary.avgHrv}` : '--'" />
        <MetricCard label="HRV 状态" :value="summary.hrvStatus || '--'" />
        <MetricCard label="睡眠心率" :value="summary.avgHeartRateDuringSleep != null ? `${summary.avgHeartRateDuringSleep} bpm` : '--'" />
        <MetricCard label="训练状态" :value="summary.trainingStatus || trainingStatus?.trainingStatus || '--'" />
        <MetricCard label="FTP" :value="summary.cyclingFtp != null ? `${summary.cyclingFtp} W` : ftpText" />
      </div>

      <section class="dark-panel recovery-advice-panel">
        <div class="section-heading">
          <div>
            <p class="overline">AI Recovery</p>
            <h2>{{ sleepAdviceTitle }}</h2>
          </div>
          <strong class="status-chip" :class="sleepAdviceTone">{{ riskLabel }}</strong>
        </div>
        <p>{{ recoverySummary }}</p>
        <p v-if="recoveryFactors" class="recovery-factors">{{ recoveryFactors }}</p>
      </section>

      <section class="dark-panel morning-panel">
        <div class="section-heading">
          <div>
            <p class="overline">Morning Readiness</p>
            <h2>晨间状态打分</h2>
          </div>
          <button class="save-btn" type="button" :disabled="morningSaving" @click="submitMorningForm">
            {{ morningSaving ? '保存中' : '保存' }}
          </button>
        </div>
        <div class="morning-grid">
          <label>
            <span>今日感觉</span>
            <input v-model.number="morningForm.readinessScore" type="number" min="1" max="5" />
          </label>
          <label>
            <span>肌肉酸痛</span>
            <select v-model="morningForm.muscleSoreness">
              <option value="none">无</option>
              <option value="mild">轻微</option>
              <option value="obvious">明显</option>
            </select>
          </label>
          <label>
            <span>精神状态</span>
            <select v-model="morningForm.mentalState">
              <option value="poor">差</option>
              <option value="normal">一般</option>
              <option value="good">好</option>
            </select>
          </label>
          <label>
            <span>训练意愿</span>
            <select v-model="morningForm.trainingWillingness">
              <option value="rest">休息</option>
              <option value="easy">轻松练</option>
              <option value="normal">正常练</option>
            </select>
          </label>
        </div>
        <textarea v-model="morningForm.note" rows="2" maxlength="500" placeholder="可选备注，例如腿部酸痛、睡眠不踏实" />
        <p v-if="morningMessage" class="morning-message">{{ morningMessage }}</p>
      </section>

      <div class="detail-grid">
        <ChartPanel v-if="heartRateMonitorData.length" title="全天心率" eyebrow="监测心率" :option="lineOption(heartRateMonitorData, 'bpm', '#33b5ff')" />
        <ChartPanel v-if="heartRateSleepData.length" title="睡眠心率" eyebrow="夜间心率" :option="lineOption(heartRateSleepData, 'bpm', '#21d47b')" />
        <ChartPanel v-if="stressMonitorData.length" title="全天压力" eyebrow="监测压力" :option="lineOption(stressMonitorData, '压力', '#ff9d19', 0, 100)" />
        <ChartPanel v-if="stressSleepData.length" title="睡眠压力" eyebrow="夜间压力" :option="lineOption(stressSleepData, '压力', '#f97316', 0, 100)" />
        <ChartPanel v-if="stepData.length" title="步数分布" eyebrow="全天步数" :option="barOption(stepData, '步数', '#33b5ff')" />
        <ChartPanel v-if="intensityData.length" title="强度分钟" eyebrow="日内分布" :option="barOption(intensityData, '分钟', '#8b5cf6')" />
        <ChartPanel v-if="sleepStages.length" title="睡眠阶段" eyebrow="夜间睡眠" :option="sleepStageOption" />
        <ChartPanel v-if="hrvSampleData.length" title="HRV 采样" eyebrow="夜间 HRV" :option="lineOption(hrvSampleData, 'ms', '#8b5cf6')" />
        <ChartPanel v-if="sleepMovementData.length" title="睡眠体动" eyebrow="movement/restless" :option="barOption(sleepMovementData, '体动', '#21d47b')" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

import ChartPanel from '@/components/ChartPanel.vue'
import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getDailyBrief, sendMorningReadiness } from '@/services/ai'
import {
  getHealthSamples,
  getLatestCyclingFtp,
  getLatestRacePredictions,
  getLatestLactateThreshold,
  getLatestTrainingStatus,
} from '@/services/health'

const loading = ref(false)
const error = ref('')

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const selectedDate = ref(formatLocalDate(new Date()))

const summary = ref({})
const heartRateMonitorData = ref([])
const heartRateSleepData = ref([])
const stressMonitorData = ref([])
const stressSleepData = ref([])
const stepData = ref([])
const intensityData = ref([])
const sleepStages = ref([])
const hrvSampleData = ref([])
const sleepMovementData = ref([])
const trainingStatus = ref(null)
const racePredictions = ref(null)
const lactateThreshold = ref(null)
const cyclingFtp = ref(null)
const aiBrief = ref(null)
const morningSaving = ref(false)
const morningMessage = ref('')
const morningForm = ref({
  readinessScore: 3,
  muscleSoreness: 'none',
  mentalState: 'normal',
  trainingWillingness: 'easy',
  note: '',
})

const intensitySummary = computed(() => {
  const moderate = summary.value.moderateIntensityMinutes
  const vigorous = summary.value.vigorousIntensityMinutes
  if (moderate == null && vigorous == null) return '--'
  return `${moderate || 0}/${vigorous || 0} 分`
})

const ftpText = computed(() => (cyclingFtp.value?.ftpW != null ? `${cyclingFtp.value.ftpW} W` : '--'))
const sleepAdvice = computed(() => aiBrief.value?.placements?.sleep || null)
const sleepAdviceTitle = computed(() => sleepAdvice.value?.title || '睡眠与恢复建议')
const sleepAdviceText = computed(() => sleepAdvice.value?.text || '这里会预留睡眠、HRV、压力和训练负荷的综合建议。')
const sleepAdviceTone = computed(() => sleepAdvice.value?.tone || 'neutral')
const recoverySummary = computed(() => {
  const ml = aiBrief.value?.ml
  if (!ml) return sleepAdviceText.value
  const readinessLabels = { low: '偏低', medium: '中等', high: '较好' }
  const score = ml.readinessScore != null ? `恢复分 ${ml.readinessScore}` : '恢复分 --'
  return `${score}，恢复状态${readinessLabels[ml.readinessLevel] || '--'}。${sleepAdviceText.value}`
})
const recoveryFactors = computed(() => {
  const ml = aiBrief.value?.ml
  if (!ml) return ''
  const factors = Array.isArray(ml.topFactors) && ml.topFactors.length ? ml.topFactors.join('、') : ''
  const completeness = ml.dataCompleteness?.score != null ? `数据完整度 ${ml.dataCompleteness.score}%` : ''
  return [factors ? `关键原因：${factors}` : '', completeness].filter(Boolean).join('；')
})
const riskLabel = computed(() => {
  const labels = { green: '风险低', yellow: '注意恢复', orange: '恢复优先', red: '高风险' }
  return labels[aiBrief.value?.riskLevel] || '预留'
})

function toTimestamp(ts) {
  return ts ? new Date(ts).getTime() : 0
}

function lineOption(rows, unit, color, min, max) {
  return {
    color: [color],
    tooltip: {
      trigger: 'axis',
      formatter: (params = []) => {
        const point = params[0]
        if (!point) return ''
        return `${point.axisValue}<br/>${point.value[1]} ${unit}`
      },
    },
    grid: { left: 50, right: 16, top: 8, bottom: 24 },
    xAxis: { type: 'time', axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: unit, min, max },
    series: [{
      type: 'line',
      data: rows.map((d) => [toTimestamp(d.time), d.value]),
      symbol: 'none',
      lineStyle: { width: 1.5 },
      areaStyle: { opacity: 0.1 },
    }],
  }
}

function barOption(rows, unit, color) {
  return {
    color: [color],
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 16, top: 8, bottom: 24 },
    xAxis: { type: 'time', axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: unit },
    series: [{
      type: 'bar',
      data: rows.map((d) => [toTimestamp(d.time), d.value]),
      barMaxWidth: 10,
    }],
  }
}

const stageColors = { deep: '#21d47b', light: '#33b5ff', rem: '#8b5cf6', awake: '#ef4444', unknown: '#94a3b8' }
const stageLabels = { deep: '深睡', light: '浅睡', rem: 'REM', awake: '清醒', unknown: '未知' }

const sleepStageOption = computed(() => ({
  color: Object.values(stageColors),
  tooltip: {
    trigger: 'item',
    formatter: (params) => `${stageLabels[params.value[1]] || params.value[1]}<br/>${params.value[2] || 0} 分钟`,
  },
  grid: { left: 50, right: 16, top: 8, bottom: 24 },
  xAxis: { type: 'time', axisLabel: { fontSize: 10 } },
  yAxis: { type: 'category', data: Object.values(stageLabels), axisLabel: { fontSize: 11 } },
  series: [{
    type: 'scatter',
    symbolSize: 9,
    data: sleepStages.value.map((s) => ({
      value: [toTimestamp(s.stageStartUtc), stageLabels[s.stageType] || s.stageType, Math.round((s.durationS || 0) / 60)],
      itemStyle: { color: stageColors[s.stageType] || stageColors.unknown },
    })),
  }],
}))

function prevDay() {
  const d = new Date(`${selectedDate.value}T00:00:00`)
  d.setDate(d.getDate() - 1)
  selectedDate.value = formatLocalDate(d)
}

function nextDay() {
  const d = new Date(`${selectedDate.value}T00:00:00`)
  d.setDate(d.getDate() + 1)
  selectedDate.value = formatLocalDate(d)
}

async function submitMorningForm() {
  if (morningSaving.value) return
  morningSaving.value = true
  morningMessage.value = ''
  try {
    await sendMorningReadiness({
      feedbackDate: selectedDate.value,
      ...morningForm.value,
    })
    morningMessage.value = '晨间状态已保存'
  } catch (err) {
    morningMessage.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    morningSaving.value = false
  }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  const date = selectedDate.value
  try {
    const [
      healthRes,
      hrMonitorRes,
      hrSleepRes,
      stressMonitorRes,
      stressSleepRes,
      stepsRes,
      intensityRes,
      stagesRes,
      hrvRes,
      movementRes,
      trainingRes,
      raceRes,
      thresholdRes,
      ftpRes,
      aiRes,
    ] = await Promise.all([
      fetch(`/api/dashboard/health?date=${date}`).then((r) => (r.ok ? r.json() : {})),
      getHealthSamples('heart-rate', { date, source: 'monitoring' }),
      getHealthSamples('heart-rate', { date, source: 'sleep' }),
      getHealthSamples('stress', { date, source: 'monitoring' }),
      getHealthSamples('stress', { date, source: 'sleep' }),
      getHealthSamples('steps', { date }),
      getHealthSamples('intensity-minutes', { date }),
      getHealthSamples('sleep-stages', { date }),
      getHealthSamples('hrv', { date }),
      getHealthSamples('sleep-movement', { date }),
      getLatestTrainingStatus(),
      getLatestRacePredictions(),
      getLatestLactateThreshold(),
      getLatestCyclingFtp(),
      getDailyBrief().catch(() => ({ data: null })),
    ])

    summary.value = healthRes || {}
    heartRateMonitorData.value = hrMonitorRes
    heartRateSleepData.value = hrSleepRes
    stressMonitorData.value = stressMonitorRes
    stressSleepData.value = stressSleepRes
    stepData.value = stepsRes
    intensityData.value = intensityRes
    sleepStages.value = stagesRes
    hrvSampleData.value = hrvRes
    sleepMovementData.value = movementRes
    trainingStatus.value = trainingRes
    racePredictions.value = raceRes
    lactateThreshold.value = thresholdRes
    cyclingFtp.value = ftpRes
    aiBrief.value = aiRes?.data || null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载健康数据失败'
  } finally {
    loading.value = false
  }
}

watch(selectedDate, loadAll, { immediate: true })
</script>

<style scoped>
.date-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-input {
  background: var(--panel-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 4px 8px;
  font-size: 14px;
}

.btn-icon {
  background: var(--panel-strong);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: var(--panel);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.recovery-advice-panel {
  margin-top: 16px;
}

.morning-panel {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.morning-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.morning-grid label {
  display: grid;
  gap: 6px;
}

.morning-grid span {
  color: var(--muted);
  font-size: 13px;
}

.morning-grid input,
.morning-grid select,
.morning-panel textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-strong);
  color: var(--text);
  padding: 8px 10px;
}

.save-btn {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--green);
  color: #04130b;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.morning-message {
  margin: 0;
  color: var(--green);
  font-size: 13px;
}

.recovery-advice-panel p {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.recovery-advice-panel .recovery-factors {
  margin-top: 8px;
  font-size: 13px;
}

@media (max-width: 800px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .morning-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
