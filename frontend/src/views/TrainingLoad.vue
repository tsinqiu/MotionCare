<template>
  <div class="page-stack">
    <section class="training-index-panel" :class="{ 'training-index-panel--empty': !isCurrentLoadAvailable }">
      <div class="section-heading">
        <div>
          <p class="overline">训练指数</p>
          <h2>{{ currentLoadDisplay }}</h2>
        </div>
        <strong class="status-chip" :class="statusTone">{{ statusLabel }}</strong>
      </div>
      <div class="load-score-band" :style="loadMarkerStyle" aria-label="训练指数区间">
        <span>恢复</span>
        <span>建设</span>
        <span>最佳</span>
        <span>风险</span>
        <i aria-hidden="true"></i>
      </div>
      <div class="range-row">
        <button v-for="range in ranges" :key="range.value" type="button" :class="{ active: filters.range === range.value }" @click="filters.range = range.value">
          {{ range.label }}
        </button>
      </div>
    </section>

    <div v-if="healthExtras.length" class="metric-grid">
      <MetricCard v-for="item in healthExtras" :key="item.label" :label="item.label" :value="item.value" />
    </div>

    <StateBlock
      v-if="healthError"
      title="部分健康指标暂时不可用"
      :message="healthError"
      action-label="重试"
      tone="danger"
      @action="loadHealthExtras"
    />

    <StateBlock v-if="loading" title="正在加载训练负荷" message="正在读取体能、疲劳和状态曲线。" />
    <StateBlock v-else-if="error" title="训练负荷加载失败" :message="error" action-label="重试" tone="danger" @action="load" />
    <StateBlock
      v-else-if="loadRows.length === 0"
      title="还没有训练负荷"
      message="同步带有训练负荷的运动后，这里会显示体能、疲劳和状态趋势。"
    />

    <template v-else>
      <ChartPanel title="训练负荷趋势" eyebrow="体能储备 · 疲劳负荷 · 状态余量" :option="loadOption" />
      <section class="pace-zone-panel">
        <div class="section-heading">
          <div>
            <p class="overline">配速区间</p>
            <h2>今日训练建议</h2>
          </div>
        </div>
        <div class="pace-zone-list">
          <span v-for="zone in paceZoneRows" :key="zone.label">
            <small>{{ zone.label }}</small>
            <b>{{ zone.value }}</b>
            <em>{{ zone.note }}</em>
          </span>
        </div>
      </section>
      <div class="load-dashboard">
        <section class="dark-panel today-state">
          <h2>今日状态</h2>
          <div class="state-metrics">
            <span><small>体能储备</small><b class="blue">{{ current.ctl }}</b></span>
            <span><small>疲劳负荷</small><b class="purple">{{ current.atl }}</b></span>
            <span><small>状态余量</small><b>{{ current.tsb }}</b></span>
          </div>
          <p>{{ suggestion }}</p>
        </section>
        <section class="dark-panel risk-panel">
          <h2>状态区间</h2>
          <div class="risk-list">
            <span>过渡期</span>
            <span>精力充沛</span>
            <span>灰色地带</span>
            <span>最佳</span>
            <span>高风险</span>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'

import ChartPanel from '@/components/ChartPanel.vue'
import MetricCard from '@/components/MetricCard.vue'
import StateBlock from '@/components/StateBlock.vue'
import {
  getLatestCyclingFtp,
  getLatestRacePredictions,
  getLatestLactateThreshold,
  getLatestTrainingStatus,
} from '@/services/health'
import { getLoadBalance } from '@/services/training'

const ranges = [
  { label: '42天', value: '42d' },
  { label: '3个月', value: '3m' },
  { label: '6个月', value: '6m' },
  { label: '1年', value: '1y' },
  { label: '2年', value: '2y' },
]

const filters = reactive({ range: '3m' })
const loadRows = ref([])
const error = ref('')
const loading = ref(false)
const trainingStatus = ref(null)
const racePredictions = ref(null)
const lactateThreshold = ref(null)
const cyclingFtp = ref(null)
const healthError = ref('')

const current = computed(() => loadRows.value.at(-1) || { ctl: '--', atl: '--', tsb: '--', dailyTrainingLoad: 0 })
const currentLoadNumber = computed(() => {
  const candidates = [current.value.dailyTrainingLoad, current.value.daily_training_load, current.value.ctl]
  const number = candidates.map((value) => Number(value)).find(Number.isFinite)
  return number ?? null
})
const isCurrentLoadAvailable = computed(() => currentLoadNumber.value !== null && loadRows.value.length > 0)
const currentLoad = computed(() => (currentLoadNumber.value === null ? 0 : Math.round(currentLoadNumber.value)))
const currentLoadDisplay = computed(() => (isCurrentLoadAvailable.value ? currentLoad.value : '--'))
const loadMarkerStyle = computed(() => ({
  '--load-position': `${Math.max(0, Math.min(100, Number(currentLoad.value || 0)))}%`,
}))
const statusLabel = computed(() => {
  if (!isCurrentLoadAvailable.value) return '等待数据'
  const tsb = Number(current.value.tsb || 0)
  if (tsb < -25) return '高风险'
  if (tsb < -8) return '灰色地带'
  if (tsb <= 5) return '最佳'
  if (tsb <= 20) return '精力充沛'
  return '过渡期'
})
const statusTone = computed(() => {
  if (!isCurrentLoadAvailable.value) return 'neutral'
  return statusLabel.value === '高风险' ? 'danger' : statusLabel.value === '最佳' ? 'good' : 'neutral'
})
const suggestion = computed(() => {
  if (statusLabel.value === '高风险') return '疲劳显著高于体能，建议安排恢复日，降低训练强度。'
  if (statusLabel.value === '灰色地带') return '处于训练刺激窗口，建议关注睡眠与静息心率，避免连续高强度。'
  if (statusLabel.value === '最佳') return '训练负荷平衡良好，可以按照计划继续推进。'
  return '当前状态较轻松，可以安排一次有氧或技术训练。'
})
const paceZoneRows = computed(() => {
  const status = statusLabel.value
  const easy = status === '高风险' ? '体感强度 2-3' : status === '灰色地带' ? '体感强度 3-4' : '体感强度 4-5'
  const tempo = status === '高风险' ? '暂停' : status === '灰色地带' ? '短组' : '体感强度 6-7'
  const interval = status === '最佳' ? '可安排' : status === '精力充沛' ? '少量' : '不建议'
  return [
    { label: '恢复跑', value: easy, note: '可对话强度' },
    { label: '有氧跑', value: '体感强度 4-6', note: '稳定堆量' },
    { label: '节奏跑', value: tempo, note: '控制时长' },
    { label: '间歇', value: interval, note: '看疲劳决定' },
  ]
})

const healthExtras = computed(() => {
  const items = []
  if (trainingStatus.value?.trainingStatus) items.push({ label: 'Garmin 训练状态', value: trainingStatus.value.trainingStatus })
  if (trainingStatus.value?.vo2max != null) items.push({ label: '最大摄氧量', value: `${trainingStatus.value.vo2max}` })
  if (lactateThreshold.value?.heartRateBpm != null) items.push({ label: '乳酸阈值心率', value: `${lactateThreshold.value.heartRateBpm} 次/分` })
  if (lactateThreshold.value?.powerW != null) items.push({ label: '乳酸阈值功率', value: `${lactateThreshold.value.powerW} 瓦` })
  if (cyclingFtp.value?.ftpW != null) items.push({ label: '骑行阈值功率', value: `${cyclingFtp.value.ftpW} 瓦` })
  if (racePredictions.value?.time5kS != null) items.push({ label: '5K 预测', value: formatRaceTime(racePredictions.value.time5kS) })
  if (racePredictions.value?.time10kS != null) items.push({ label: '10K 预测', value: formatRaceTime(racePredictions.value.time10kS) })
  return items
})
const loadOption = computed(() => ({
  color: ['#33b5ff', '#8b5cf6', '#ef4444'],
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 8, textStyle: { color: '#9ca3af' } },
  grid: { left: 10, right: 12, top: 48, bottom: 24, containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: true,
    data: loadRows.value.map((row) => row.date),
    axisLine: { lineStyle: { color: '#334155' } },
    axisTick: { alignWithLabel: true },
    axisLabel: {
      color: '#9ca3af',
      fontSize: 10,
      formatter: formatLoadDateLabel,
      hideOverlap: true,
      margin: 10,
      showMinLabel: false,
      showMaxLabel: false,
    },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: '#1f2937' } },
  },
  series: [
    { name: '体能储备', type: 'line', smooth: true, data: loadRows.value.map((row) => row.ctl) },
    { name: '疲劳负荷', type: 'line', smooth: true, data: loadRows.value.map((row) => row.atl) },
    { name: '状态余量', type: 'line', smooth: true, data: loadRows.value.map((row) => row.tsb), areaStyle: { opacity: 0.08 } },
  ],
}))

function formatLoadDateLabel(value) {
  const text = String(value || '')
  const parts = text.split('-')
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}`

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    loadRows.value = await getLoadBalance(filters)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '训练负荷加载失败'
  } finally {
    loading.value = false
  }
}

function formatRaceTime(seconds) {
  const total = Number(seconds || 0)
  if (!total) return '--'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

async function loadHealthExtras() {
  healthError.value = ''
  const results = await Promise.allSettled([
    getLatestTrainingStatus(),
    getLatestRacePredictions(),
    getLatestLactateThreshold(),
    getLatestCyclingFtp(),
  ])

  const targets = [trainingStatus, racePredictions, lactateThreshold, cyclingFtp]
  results.forEach((result, index) => {
    targets[index].value = result.status === 'fulfilled' ? result.value : null
  })

  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length) {
    healthError.value = failed.length === results.length
      ? '健康指标加载失败，请稍后重试。'
      : '部分健康指标加载失败，其余训练数据仍可正常查看。'
  }
}

watch(() => ({ ...filters }), () => {
  void load()
  void loadHealthExtras()
}, { immediate: true })
</script>
