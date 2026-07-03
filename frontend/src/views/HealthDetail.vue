<template>
  <div class="page-stack">
    <section class="dark-panel">
      <div class="section-heading">
        <div>
          <p class="overline">健康详情</p>
          <h2>身体数据</h2>
        </div>
        <div class="health-date-selector" aria-label="选择健康日期">
          <button class="health-date-step" type="button" aria-label="前一天" @click="prevDay">
            <ChevronLeft :size="18" aria-hidden="true" />
          </button>
          <label class="health-date-chip">
            <CalendarDays :size="17" aria-hidden="true" />
            <span>{{ formattedSelectedDate }}</span>
            <input v-model="selectedDate" type="date" aria-label="选择日期" class="health-date-native" />
          </label>
          <button class="health-date-step" type="button" aria-label="后一天" @click="nextDay">
            <ChevronRight :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>

    <StateBlock v-if="loading" title="加载中..." message="正在获取健康数据" />
    <StateBlock v-else-if="error" title="加载失败" :message="error" tone="danger" action-label="重试" @action="loadAll" />
    <section v-else-if="!hasHealthData" class="health-empty-rq-panel">
      <div class="section-heading">
        <div>
          <p class="overline">恢复看板</p>
          <h2>等待身体数据</h2>
        </div>
        <span class="status-chip neutral">待同步</span>
      </div>
      <div class="health-empty-gauge" aria-label="空健康恢复仪表">
        <strong>--</strong>
        <span aria-hidden="true"></span>
      </div>
      <div class="health-empty-grid">
        <span>
          <small>恢复概览</small>
          <b>待同步</b>
        </span>
        <span>
          <small>睡眠质量</small>
          <b>--</b>
        </span>
        <span>
          <small>压力水平</small>
          <b>--</b>
        </span>
        <span>
          <small>心率变异</small>
          <b>--</b>
        </span>
      </div>
      <p class="health-empty-note">设备同步后自动呈现睡眠、压力和心率变异趋势。</p>
    </section>

    <template v-else>
      <section class="health-rq-panel">
        <div class="section-heading">
          <div>
            <p class="overline">恢复看板</p>
            <h2>身体电量</h2>
          </div>
          <span class="status-chip">{{ recoveryScoreDisplay }}</span>
        </div>
        <div class="recovery-gauge" :style="recoveryGaugeStyle">
          <strong>{{ recoveryScoreDisplay }}</strong>
          <span aria-hidden="true"></span>
        </div>
        <div class="health-rq-grid">
          <span>
            <small>睡眠质量</small>
            <b>{{ sleepQualityText }}</b>
          </span>
          <span>
            <small>压力水平</small>
            <b>{{ stressText }}</b>
          </span>
          <span>
            <small>静息心率</small>
            <b>{{ summary.restingHeartRateBpm != null ? `${summary.restingHeartRateBpm} 次/分` : '--' }}</b>
          </span>
          <span>
            <small>心率变异</small>
            <b>{{ summary.avgHrv != null ? `${summary.avgHrv}` : '--' }}</b>
          </span>
        </div>
      </section>

      <div class="metric-grid">
        <MetricCard label="步数" :value="summary.steps != null ? `${summary.steps}` : '--'" />
        <MetricCard label="距离" :value="summary.distanceM != null ? `${(summary.distanceM / 1000).toFixed(2)} km` : '--'" />
        <MetricCard label="活跃卡路里" :value="summary.activeCalories != null ? `${summary.activeCalories}` : '--'" />
        <MetricCard label="强度分钟" :value="intensitySummary" />
        <MetricCard label="静息心率" :value="summary.restingHeartRateBpm != null ? `${summary.restingHeartRateBpm} 次/分` : '--'" />
        <MetricCard label="平均压力" :value="summary.avgStressLevel != null ? `${summary.avgStressLevel}` : '--'" />
        <MetricCard label="睡眠评分" :value="summary.sleepScore != null ? `${summary.sleepScore}/100` : '--'" />
        <MetricCard label="心率变异" :value="summary.avgHrv != null ? `${summary.avgHrv}` : '--'" />
        <MetricCard label="心率变异状态" :value="summary.hrvStatus || '--'" />
        <MetricCard label="睡眠心率" :value="summary.avgHeartRateDuringSleep != null ? `${summary.avgHeartRateDuringSleep} 次/分` : '--'" />
        <MetricCard label="训练状态" :value="summary.trainingStatus || trainingStatus?.trainingStatus || '--'" />
        <MetricCard label="骑行阈值功率" :value="summary.cyclingFtp != null ? `${summary.cyclingFtp} 瓦` : ftpText" />
      </div>

      <div class="detail-grid">
        <ChartPanel v-if="heartRateMonitorData.length" title="全天心率" eyebrow="监测心率" :option="lineOption(heartRateMonitorData, '次/分', '#33b5ff')" />
        <ChartPanel v-if="heartRateSleepData.length" title="睡眠心率" eyebrow="夜间心率" :option="lineOption(heartRateSleepData, '次/分', '#21d47b')" />
        <ChartPanel v-if="stressMonitorData.length" title="全天压力" eyebrow="监测压力" :option="lineOption(stressMonitorData, '压力', '#ff9d19', 0, 100)" />
        <ChartPanel v-if="stressSleepData.length" title="睡眠压力" eyebrow="夜间压力" :option="lineOption(stressSleepData, '压力', '#f97316', 0, 100)" />
        <ChartPanel v-if="stepData.length" title="步数分布" eyebrow="全天步数" :option="barOption(stepData, '步数', '#33b5ff')" />
        <ChartPanel v-if="intensityData.length" title="强度分钟" eyebrow="日内分布" :option="barOption(intensityData, '分钟', '#8b5cf6')" />
        <ChartPanel v-if="sleepStages.length" title="睡眠阶段" eyebrow="夜间睡眠" :option="sleepStageOption" />
        <ChartPanel v-if="hrvSampleData.length" title="心率变异采样" eyebrow="夜间心率变异" :option="lineOption(hrvSampleData, '毫秒', '#8b5cf6')" />
        <ChartPanel v-if="sleepMovementData.length" title="睡眠体动" eyebrow="夜间体动" :option="barOption(sleepMovementData, '体动', '#21d47b')" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'

import ChartPanel from '@/components/ChartPanel.vue'
import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import { getTodayHealth } from '@/services/dashboard'
import {
  getHealthSamples,
  getLatestCyclingFtp,
  getLatestRacePredictions,
  getLatestLactateThreshold,
  getLatestTrainingStatus,
} from '@/services/health'

const loading = ref(false)
const error = ref('')
const selectedDate = ref(new Date().toISOString().slice(0, 10))

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

const intensitySummary = computed(() => {
  const moderate = summary.value.moderateIntensityMinutes
  const vigorous = summary.value.vigorousIntensityMinutes
  if (moderate == null && vigorous == null) return '--'
  return `${moderate || 0}/${vigorous || 0} 分`
})

const ftpText = computed(() => (cyclingFtp.value?.ftpW != null ? `${cyclingFtp.value.ftpW} 瓦` : '--'))
const formattedSelectedDate = computed(() => {
  const [year, month, day] = String(selectedDate.value || '').split('-')
  if (!year || !month || !day) return selectedDate.value || '--'
  return `${year}/${month}/${day}`
})
const recoveryScore = computed(() => {
  const parts = []
  const sleepScore = Number(summary.value.sleepScore)
  if (Number.isFinite(sleepScore)) parts.push(Math.max(0, Math.min(100, sleepScore)))

  const stress = Number(summary.value.avgStressLevel)
  if (Number.isFinite(stress)) parts.push(Math.max(0, Math.min(100, 100 - stress)))

  const hrv = Number(summary.value.avgHrv)
  if (Number.isFinite(hrv)) parts.push(Math.max(0, Math.min(100, hrv * 1.25)))

  const restingHeartRate = Number(summary.value.restingHeartRateBpm)
  if (Number.isFinite(restingHeartRate)) parts.push(Math.max(0, Math.min(100, 115 - restingHeartRate)))

  if (!parts.length) return null
  return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length)
})
const recoveryScoreDisplay = computed(() => (recoveryScore.value == null ? '--' : `${recoveryScore.value}`))
const recoveryGaugeStyle = computed(() => ({
  '--recovery-position': `${recoveryScore.value ?? 0}%`,
}))
const sleepQualityText = computed(() => {
  const score = Number(summary.value.sleepScore)
  if (!Number.isFinite(score)) return '--'
  if (score >= 85) return `${score}/100 优秀`
  if (score >= 70) return `${score}/100 稳定`
  if (score >= 55) return `${score}/100 关注`
  return `${score}/100 偏低`
})
const stressText = computed(() => {
  const stress = Number(summary.value.avgStressLevel)
  if (!Number.isFinite(stress)) return '--'
  if (stress < 30) return `${Math.round(stress)} 低`
  if (stress < 60) return `${Math.round(stress)} 中`
  return `${Math.round(stress)} 高`
})
const hasHealthData = computed(() => (
  Object.values(summary.value || {}).some((value) => value !== null && value !== undefined && value !== '')
  || [heartRateMonitorData, heartRateSleepData, stressMonitorData, stressSleepData, stepData, intensityData, sleepStages, hrvSampleData, sleepMovementData]
    .some((rows) => rows.value.length > 0)
  || Boolean(trainingStatus.value || racePredictions.value || lactateThreshold.value || cyclingFtp.value)
))

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
  selectedDate.value = d.toISOString().slice(0, 10)
}

function nextDay() {
  const d = new Date(`${selectedDate.value}T00:00:00`)
  d.setDate(d.getDate() + 1)
  selectedDate.value = d.toISOString().slice(0, 10)
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
    ] = await Promise.all([
      getTodayHealth({ date }),
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载健康数据失败'
  } finally {
    loading.value = false
  }
}

watch(selectedDate, loadAll, { immediate: true })
</script>

<style scoped>
.health-date-selector {
  display: flex;
  flex: 1 1 190px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.health-date-step {
  background: var(--panel-strong);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.health-date-chip {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 42px;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--app-green) 20%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel-soft));
  color: var(--text);
  font-weight: 800;
}

.health-date-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-date-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  opacity: 0;
}

@container phone-frame (max-width: 374px) {
  .health-date-selector {
    flex-basis: 100%;
    justify-content: stretch;
  }
}

.health-date-step:hover,
.health-date-chip:hover {
  background: var(--panel);
}

.health-empty-rq-panel {
  display: grid;
  gap: 14px;
  padding: var(--space-5);
  border: 1px solid color-mix(in srgb, var(--app-green) 20%, var(--border));
  border-top: 4px solid var(--app-green);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.health-empty-gauge {
  position: relative;
  display: grid;
  min-height: 84px;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: linear-gradient(90deg, #d8f5e4 0%, #f1f8f4 48%, #e5f8ee 100%);
  color: var(--text);
}

.health-empty-gauge strong {
  position: relative;
  z-index: 1;
  font-size: 34px;
  line-height: 1;
}

.health-empty-gauge span {
  position: absolute;
  inset: auto 16px 18px;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #9be7b8, var(--app-green));
  opacity: 0.55;
}

.health-empty-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.health-empty-grid span {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-soft);
}

.health-empty-grid small,
.health-empty-grid b {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.health-empty-grid small {
  color: var(--muted);
  font-size: 12px;
}

.health-empty-grid b {
  margin-top: 4px;
  color: var(--text);
  font-size: 15px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 16px;
}

.health-empty-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
}
</style>
