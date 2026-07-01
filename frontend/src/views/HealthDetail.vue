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
    <StateBlock
      v-else-if="!hasHealthData"
      title="当天没有健康数据"
      message="同步 Garmin 后再回来查看这一天的身体状态。"
      action-label="前往同步"
      @action="router.push('/me/sync')"
    />

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
import { useRouter } from 'vue-router'

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
const router = useRouter()
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

const ftpText = computed(() => (cyclingFtp.value?.ftpW != null ? `${cyclingFtp.value.ftpW} W` : '--'))
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

@media (max-width: 800px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
