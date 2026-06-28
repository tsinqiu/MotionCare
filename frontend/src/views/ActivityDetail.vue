<template>
  <div class="page-stack">
    <StateBlock
      v-if="loading"
      title="正在加载运动详情"
      message="正在读取活动摘要、轨迹点、心率、速度和分段数据。"
    />
    <StateBlock
      v-else-if="error"
      title="运动详情加载失败"
      :message="error"
      action-label="重试"
      tone="danger"
      @action="loadActivity(route.params.id)"
    />
    <StateBlock
      v-else-if="!activity"
      title="未找到该活动"
      message="当前活动不存在，或没有可查看的记录。"
      action-label="返回列表"
      @action="router.push('/activities')"
    />

    <template v-else>
      <section class="app-hero detail-hero" :style="{ '--sport-color': sportColor }">
        <div>
          <h2>{{ activity.activity_name || activity.activity_type }}</h2>
          <p>{{ formatDetailDateTime(activity.local_start_time) }} 开始</p>
        </div>
        <div class="hero-actions">
          <RouterLink class="secondary-link inverse" to="/activities">返回列表</RouterLink>
          <button v-if="canManageManual" class="secondary-link inverse" type="button" @click="modalOpen = true">编辑</button>
          <button v-if="canManageManual" class="danger-link" type="button" :disabled="isDeleting" @click="removeActivity">
            {{ isDeleting ? '删除中' : '删除' }}
          </button>
        </div>
      </section>

      <div class="metric-grid detail-metrics">
        <MetricCard label="距离" :value="formatDistance(activity.total_distance_m)" />
        <MetricCard label="总用时" :value="formatClockDuration(activity.total_timer_time_s)" />
        <MetricCard label="平均配速" :value="formatPace(activity.avg_speed_mps)" />
        <MetricCard label="累计爬升" :value="formatAscent(activity.total_ascent_m)" />
        <MetricCard label="平均心率" :value="`${activity.avg_heart_rate_bpm || '--'} bpm`" />
        <MetricCard label="训练负荷" :value="formatTrainingLoad(activity.activity_training_load)" />
      </div>

      <section v-if="canEditActivity" class="dark-panel">
        <div class="section-heading">
          <div><h2>编辑活动信息</h2></div>
        </div>
        <div class="edit-form">
          <label>
            <span>活动名称</span>
            <input v-model="editForm.activityName" type="text" placeholder="输入活动名称" />
          </label>
          <label>
            <span>体感程度 (1-10)</span>
            <input v-model.number="editForm.effort" type="number" min="1" max="10" placeholder="1-10" />
          </label>
          <div class="edit-form-actions">
            <button type="button" class="primary-link" :disabled="isSavingMeta" @click="saveMeta">
              {{ isSavingMeta ? '保存中' : '保存' }}
            </button>
          </div>
        </div>
        <div class="photo-section">
          <label class="photo-upload-label">
            <span>活动照片</span>
            <input type="file" accept="image/*" @change="uploadPhoto" :disabled="isUploadingPhoto" />
          </label>
          <span v-if="isUploadingPhoto" class="upload-status">上传中...</span>
          <img v-if="activity.photo_path" :src="photoUrl(activity.photo_path)" class="activity-photo" alt="活动照片" />
        </div>
      </section>

      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <h2>天气</h2>
          </div>
        </div>
        <div class="weather-grid">
          <span><small>天气</small><b>{{ activity.weather_condition || '--' }}</b></span>
          <span><small>温度</small><b>{{ activity.temperature_c != null ? activity.temperature_c + '°C' : '--' }}</b></span>
          <span><small>湿度</small><b>{{ activity.humidity_percent != null ? activity.humidity_percent + '%' : '--' }}</b></span>
          <span><small>体感</small><b>{{ activity.feels_like_c != null ? activity.feels_like_c + '°C' : '--' }}</b></span>
        </div>
        <p v-if="activity.weather_source" class="weather-source">来源：{{ activity.weather_source }}{{ activity.weather_updated_at ? ' · ' + new Date(activity.weather_updated_at).toLocaleString('zh-CN') : '' }}</p>
      </section>

      <section v-if="isRunningActivity" class="dark-panel">
        <div class="section-heading">
          <div>
            <h2>绑定跑鞋</h2>
          </div>
        </div>
        <div class="shoe-bind">
          <select v-model="selectedShoeId" @change="bindShoe">
            <option :value="null">不绑定</option>
            <option v-for="s in shoes" :key="s.id" :value="s.id" :disabled="s.isRetired">
              {{ s.name }} {{ s.isRetired ? '(已退役)' : '' }}
            </option>
          </select>
          <span v-if="activity.shoeName" class="shoe-bind-info">当前：{{ activity.shoeName }}</span>
        </div>
      </section>

      <div class="detail-grid">
        <ChartPanel title="心率曲线" eyebrow="运动详情" :option="heartRateOption" />
        <ChartPanel title="配速曲线" eyebrow="运动详情" :option="paceOption" />
        <ChartPanel title="步频曲线" eyebrow="运动详情" :option="cadenceOption" />
        <ChartPanel title="海拔曲线" eyebrow="运动详情" :option="altitudeOption" />
        <ChartPanel title="垂直振幅曲线" eyebrow="运动详情" :option="verticalOscillationOption" />
        <ChartPanel title="步幅曲线" eyebrow="运动详情" :option="strideLengthOption" />
        <ChartPanel title="功率曲线" eyebrow="运动详情" :option="powerOption" />
        <RoutePreview :points="trackPoints" />
        <ZoneDistribution :points="trackPoints" />
        <SessionDetails :activity="activity" />
        <LapTable :activity="activity" :laps="laps" />
      </div>

      <section class="dark-panel">
        <div class="section-heading">
          <div>
            <p class="overline">AI Analysis</p>
            <h2>运动智能分析</h2>
          </div>
          <button class="primary-link" type="button" :disabled="analysisLoading" @click="runAnalysis">
            {{ analysisLoading ? '分析中' : '运行分析' }}
          </button>
        </div>
        <StateBlock
          v-if="analysisError"
          title="智能分析失败"
          :message="analysisError"
          tone="danger"
        />
        <div v-if="analysis" class="prediction-grid ai-analysis-grid">
          <span
            v-for="insight in analysisInsights"
            :key="insight.label"
            :class="insight.tone"
          >
            <small>{{ insight.label }}</small>
            <b>{{ insight.value }}</b>
          </span>
          <p>{{ analysis.summary }}</p>
          <ul>
            <li v-for="suggestion in analysisSuggestions" :key="suggestion">{{ suggestion }}</li>
          </ul>
        </div>
        <p v-else class="muted-copy">点击后根据当前运动记录生成表现分析、恢复提示和下次训练建议。</p>
      </section>

      <ManualActivityModal
        v-if="modalOpen"
        :activity="activity"
        :save="(payload) => updateManualActivity(activity.id, payload)"
        @close="modalOpen = false"
        @saved="handleSaved"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChartPanel from '@/components/ChartPanel.vue'
import LapTable from '@/components/LapTable.vue'
import ManualActivityModal from '@/components/ManualActivityModal.vue'
import MetricCard from '@/components/MetricCard.vue'
import RoutePreview from '@/components/RoutePreview.vue'
import SessionDetails from '@/components/SessionDetails.vue'
import StateBlock from '@/components/StateBlock.vue'
import ZoneDistribution from '@/components/ZoneDistribution.vue'
import { analyzeActivity } from '@/services/ai'
import {
  deleteManualActivity,
  getActivity,
  getHeartRateSeries,
  getLaps,
  getSpeedSeries,
  getTrackPoints,
  updateActivityMeta,
  updateManualActivity,
  uploadActivityPhoto,
} from '@/services/activities'
import { authSession } from '@/stores/authStore'
import { formatClockDuration, formatDistance, formatPace, formatPaceSeconds } from '@/utils/formatters'
import { apiClient } from '@/services/http'

const route = useRoute()
const router = useRouter()
const activity = ref(null)
const error = ref('')
const loading = ref(false)
const modalOpen = ref(false)
const isDeleting = ref(false)
const analysis = ref(null)
const analysisError = ref('')
const analysisLoading = ref(false)
const trackPoints = ref([])
const heartRateSeries = ref([])
const speedSeries = ref([])
const laps = ref([])
const shoes = ref([])
const selectedShoeId = ref(null)
const editForm = ref({ activityName: '', effort: null })
const isSavingMeta = ref(false)
const isUploadingPhoto = ref(false)

const sportColor = computed(() => {
  if (activity.value?.activity_type === '骑行') return '#ff9d19'
  if (activity.value?.activity_type === '游泳') return '#33b5ff'
  if (activity.value?.activity_type === '力量训练') return '#8b5cf6'
  return '#21d47b'
})
const canManageManual = computed(() => authSession.user?.role === 'admin' && activity.value?.is_manual)
const isRunningActivity = computed(() => {
  const rawType = activity.value?.raw_activity_type
  return ['running', 'street_running', 'track_running', 'treadmill_running'].includes(rawType)
})
const canEditActivity = computed(() => {
  if (!authSession.user) return false
  if (authSession.user.role === 'admin') return true
  return authSession.user.id === activity.value?.ownerUserId
})
const analysisInsights = computed(() => analysis.value?.insights || [])
const analysisSuggestions = computed(() => analysis.value?.suggestions || [])

const heartRateOption = computed(() => createLineOption('心率', 'bpm', '#ef4444', heartRateSeries.value, 'heart_rate_bpm'))
const paceOption = computed(() => {
  const paceValues = speedSeries.value
    .map((point) => paceSecondsFromSpeed(point.speed_mps))
    .filter(Number.isFinite)
  const slowestPace = paceValues.length ? Math.max(...paceValues) : null

  return createLineOption('配速', 'min/km', '#33b5ff', speedSeries.value, 'speed_mps', {
    valueFormatter: (value) => formatPaceSeconds(paceFromDisplayValue(value, slowestPace)),
    valueMapper: (point) => {
      const paceSecPerKm = paceSecondsFromSpeed(point.speed_mps)
      if (!Number.isFinite(paceSecPerKm) || !Number.isFinite(slowestPace)) return null
      return slowestPace - paceSecPerKm
    },
    yAxis: {
      min: 0,
      axisLabel: {
        formatter: (value) => formatPaceSeconds(paceFromDisplayValue(value, slowestPace)).replace('/km', ''),
      },
    },
  })
})
const cadenceOption = computed(() => createLineOption('步频', 'spm', '#8b5cf6', trackPoints.value, 'cadence', {
  valueMapper: (point) => {
    const cadence = Number(point.cadence)
    return Number.isFinite(cadence) && cadence > 0 ? cadence * 2 : null
  },
}))
const altitudeOption = computed(() => createLineOption('海拔', 'm', '#22c55e', trackPoints.value, 'altitude_m'))
const verticalOscillationOption = computed(() => createLineOption('垂直振幅', 'mm', '#f59e0b', trackPoints.value, 'vertical_oscillation_mm'))
const strideLengthOption = computed(() => createLineOption('步幅', 'm', '#14b8a6', trackPoints.value, 'speed_mps', {
  valueMapper: (point) => {
    const speedMps = Number(point.speed_mps)
    const cadence = Number(point.cadence)
    if (!Number.isFinite(speedMps) || !Number.isFinite(cadence) || speedMps <= 0 || cadence <= 0) return null
    return Number((speedMps * 60 / (cadence * 2)).toFixed(2))
  },
}))
const powerOption = computed(() => createLineOption('功率', 'W', '#db2777', trackPoints.value, 'power_w'))

function toTimestamp(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatElapsed(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const rest = rounded % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatAscent(value) {
  const meters = Number(value)
  return Number.isFinite(meters) ? `${Math.round(meters)} m` : '--'
}

function formatTrainingLoad(value) {
  if (value === null || value === undefined || value === '') return '--'
  const load = Number(value)
  return Number.isFinite(load) ? load.toFixed(1) : '--'
}

function paceSecondsFromSpeed(speedMps) {
  const speed = Number(speedMps)
  if (!Number.isFinite(speed) || speed <= 0) return null
  const paceSecPerKm = 1000 / speed
  return paceSecPerKm <= 900 ? paceSecPerKm : null
}

function paceFromDisplayValue(value, slowestPace) {
  const displayValue = Number(value)
  if (!Number.isFinite(displayValue) || !Number.isFinite(slowestPace)) return null
  return slowestPace - displayValue
}

function formatDetailDateTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  const dateText = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date)
  const timeText = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

  return `${dateText}（${weekday}）${timeText}`
}

function elapsedLabels(source) {
  const firstTimestamp = source.map((point) => toTimestamp(point.sample_time_utc)).find(Number.isFinite)
  return source.map((point, index) => {
    const timestamp = toTimestamp(point.sample_time_utc)
    if (Number.isFinite(timestamp) && Number.isFinite(firstTimestamp)) {
      return formatElapsed((timestamp - firstTimestamp) / 1000)
    }
    return formatElapsed(index)
  })
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function niceAxisMin(values) {
  if (!values.length) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min >= 0) return 0

  const span = Math.max(max - min, Math.abs(min), 1)
  const step = niceStep(span / 5)
  return Math.floor(min / step) * step
}

function createLineOption(name, unit, color, source, field, options = {}) {
  const values = source.map((point) => (
    options.valueMapper ? options.valueMapper(point) : point[field]
  ))
  const numericValues = values
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite)
  const axisMin = options.yAxis?.min ?? niceAxisMin(numericValues)
  const areaOrigin = axisMin ?? 'auto'
  const yAxis = {
    type: 'value',
    name: unit,
    min: axisMin,
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: '#1f2937' } },
    ...options.yAxis,
    axisLabel: {
      color: '#9ca3af',
      ...(options.yAxis?.axisLabel || {}),
    },
  }

  return {
    color: [color],
    tooltip: {
      trigger: 'axis',
      formatter: (items) => {
        const item = Array.isArray(items) ? items[0] : items
        const value = item?.data
        const formattedValue = options.valueFormatter
          ? options.valueFormatter(value)
          : `${value ?? '--'} ${unit}`
        return `${item?.axisValue || ''}<br/>${item?.marker || ''}${name}: ${formattedValue}`
      },
    },
    grid: { left: 42, right: 20, top: 28, bottom: 28 },
    xAxis: {
      type: 'category',
      name: '运动时间',
      data: elapsedLabels(source),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#9ca3af' },
    },
    yAxis,
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: values,
        areaStyle: options.showArea === false ? undefined : { opacity: 0.12, origin: areaOrigin },
      },
    ],
  }
}

async function loadActivity(id) {
  loading.value = true
  error.value = ''
  analysis.value = null
  analysisError.value = ''

  try {
    const nextActivity = await getActivity(id)
    activity.value = nextActivity || null

    if (!nextActivity) {
      trackPoints.value = []
      heartRateSeries.value = []
      speedSeries.value = []
      laps.value = []
      return
    }

    editForm.value.activityName = nextActivity.activity_name || ''
    editForm.value.effort = nextActivity.perceived_effort || null

    selectedShoeId.value = nextActivity.shoeId || null
    try { const { data } = await apiClient.get('/shoes'); shoes.value = data || [] } catch (_) {}

    const [points, heartRate, speed, lapRows] = await Promise.all([
      getTrackPoints(id),
      getHeartRateSeries(id),
      getSpeedSeries(id),
      getLaps(id),
    ])

    trackPoints.value = points
    heartRateSeries.value = heartRate
    speedSeries.value = speed
    laps.value = lapRows
  } catch (err) {
    error.value = err instanceof Error ? err.message : '详情加载失败'
  } finally {
    loading.value = false
  }
}

async function runAnalysis() {
  analysisError.value = ''
  analysisLoading.value = true
  try {
    const envelope = await analyzeActivity(activity.value.id)
    analysis.value = envelope.data
  } catch (err) {
    analysisError.value = err instanceof Error ? err.message : '智能分析失败'
  } finally {
    analysisLoading.value = false
  }
}

async function saveMeta() {
  isSavingMeta.value = true
  try {
    const updated = await updateActivityMeta(activity.value.id, {
      activityName: editForm.value.activityName || undefined,
      perceivedEffort: editForm.value.effort || null,
    })
    activity.value = updated
    editForm.value.activityName = updated.activity_name || ''
    editForm.value.effort = updated.perceived_effort || null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    isSavingMeta.value = false
  }
}

function photoUrl(path) {
  if (!path) return ''
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
  return base.replace(/\/api$/, '') + path
}

async function uploadPhoto(e) {
  const file = e.target.files?.[0]
  if (!file) return
  isUploadingPhoto.value = true
  try {
    const updated = await uploadActivityPhoto(activity.value.id, file)
    activity.value = updated
    editForm.value.activityName = updated.activity_name || ''
    editForm.value.effort = updated.perceived_effort || null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '照片上传失败'
  } finally {
    isUploadingPhoto.value = false
    e.target.value = ''
  }
}

async function removeActivity() {
  if (!canManageManual.value) {
    error.value = '只有管理员可以删除手动运动记录'
    return
  }
  if (!window.confirm('确定删除这条手动运动记录吗？')) return
  isDeleting.value = true
  try {
    await deleteManualActivity(activity.value.id)
    router.push('/activities')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    isDeleting.value = false
  }
}

async function handleSaved(nextActivity) {
  modalOpen.value = false
  activity.value = nextActivity
  await loadActivity(nextActivity.id)
}

async function bindShoe() {
  await apiClient.post(`/activities/${activity.value.id}/shoe`, { shoeId: selectedShoeId.value })
  const s = shoes.value.find(s => s.id === selectedShoeId.value)
  activity.value.shoeName = s?.name || null
}

watch(() => route.params.id, loadActivity, { immediate: true })
</script>

<style scoped>
.shoe-bind { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.shoe-bind select { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-elevated, #1a1a2e); color: inherit; }
.shoe-bind-info { font-size: 13px; color: var(--text-muted, #888); }
.edit-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 8px 0; }
.edit-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted, #888); }
.edit-form input { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-elevated, #1a1a2e); color: inherit; }
.edit-form-actions { display: flex; align-items: flex-end; }
.photo-section { padding: 8px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.photo-upload-label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted, #888); }
.upload-status { font-size: 12px; color: var(--text-muted, #888); }
.activity-photo { max-width: 240px; max-height: 180px; border-radius: 8px; object-fit: cover; margin-top: 8px; }
.weather-grid { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 0; }
.weather-grid span { display: flex; flex-direction: column; gap: 2px; }
.weather-grid small { font-size: 12px; color: var(--text-muted, #888); }
.weather-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding: 8px 0; }
.weather-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-muted, #888); }
.weather-form input { width: 100px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border, #333); background: var(--bg-elevated, #1a1a2e); color: inherit; }
.weather-source { font-size: 11px; color: var(--text-muted, #888); margin: 4px 0 0; }
</style>
