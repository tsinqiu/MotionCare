<template>
  <div class="record-workout-page" :style="{ '--sport-color': selectedSport.color }">
    <section ref="recordingPanelRef" class="record-dashboard">
      <header class="record-dashboard__top">
        <button class="record-icon-button" type="button" aria-label="定位功能" @click="showLocationPlaceholder">
          <MapPin :size="24" aria-hidden="true" />
        </button>

        <div class="sport-select" :class="{ disabled: sportLocked, open: sportMenuOpen }">
          <button type="button" :disabled="sportLocked" aria-label="选择运动类型" @click="toggleSportMenu('main')">
            <span>{{ selectedSport.label }}</span>
            <ChevronDown :size="18" aria-hidden="true" />
          </button>
          <div v-if="sportMenuOpen" class="sport-menu" role="listbox">
            <button
              v-for="sport in sportOptions"
              :key="sport.key"
              type="button"
              :class="{ active: selectedSportKey === sport.key }"
              role="option"
              :aria-selected="selectedSportKey === sport.key"
              @click="chooseSport(sport.key)"
            >
              {{ sport.label }}
            </button>
          </div>
        </div>

        <span class="record-status" :class="{ active: workout }">{{ workout ? '记录中' : '待开始' }}</span>
      </header>

      <div class="distance-stage" aria-label="实时运动数据">
        <strong>{{ mainDistanceValue }}</strong>
        <span>{{ mainDistanceUnit }}</span>
      </div>

      <div class="target-progress" :class="{ complete: targetProgress >= 100 }">
        <div class="target-progress__meta">
          <span>目标</span>
          <b>{{ targetSummary }}</b>
        </div>
        <div class="target-progress__bar" aria-hidden="true">
          <i :style="{ width: `${targetProgress}%` }"></i>
        </div>
      </div>

      <div class="record-metric-grid">
        <span>
          <small>总时长</small>
          <b>{{ formatClockDuration(elapsed) }}</b>
        </span>
        <span>
          <small>{{ paceMetricLabel }}</small>
          <b>{{ paceText }}</b>
        </span>
        <span>
          <small>定位状态</small>
          <b>{{ locationStatus }}</b>
        </span>
        <span>
          <small>已采样</small>
          <b>{{ sampleCountText }}</b>
        </span>
      </div>

      <div class="record-main-actions">
        <button class="round-side-action" type="button" aria-label="绑定跑鞋" @click="openShoePanel">
          <Footprints :size="24" aria-hidden="true" />
          <small v-if="selectedShoeName">{{ selectedShoeName }}</small>
        </button>
        <button class="start-action" type="button" :disabled="busy || saved" @click="toggleRecording">
          {{ startButtonText }}
        </button>
        <button class="round-side-action" type="button" :disabled="targetControlsLocked" aria-label="选择目标" @click="openTargetPanel">
          <Target :size="24" aria-hidden="true" />
        </button>
      </div>

      <div class="record-save-actions">
        <button class="secondary-link" type="button" :disabled="busy || !workout || elapsed < 1 || trackPoints.length === 0" @click="finish">
          结束并保存
        </button>
        <button class="danger-link" type="button" :disabled="busy || !workout" @click="cancel">
          取消
        </button>
      </div>

      <p v-if="targetCompleteText" class="target-complete-copy">{{ targetCompleteText }}</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="saved" class="success-copy">运动已保存，可在“运动记录”查看。</p>
    </section>

    <section v-if="targetPanelOpen" class="target-panel" aria-label="目标选择">
      <header class="target-panel__top">
        <button class="target-back" type="button" aria-label="返回记录页" @click="closeTargetPanel">
          <ChevronLeft :size="28" aria-hidden="true" />
        </button>
        <div class="sport-select sport-select--panel" :class="{ disabled: sportLocked, open: panelSportMenuOpen }">
          <button type="button" :disabled="sportLocked" aria-label="选择运动类型" @click="toggleSportMenu('panel')">
            <span>{{ selectedSport.label }}</span>
            <ChevronDown :size="18" aria-hidden="true" />
          </button>
          <div v-if="panelSportMenuOpen" class="sport-menu" role="listbox">
            <button
              v-for="sport in sportOptions"
              :key="sport.key"
              type="button"
              :class="{ active: selectedSportKey === sport.key }"
              role="option"
              :aria-selected="selectedSportKey === sport.key"
              @click="chooseSport(sport.key)"
            >
              {{ sport.label }}
            </button>
          </div>
        </div>
      </header>

      <div class="target-tabs" :class="{ single: availableGoalModes.length === 1 }">
        <button
          v-for="mode in availableGoalModes"
          :key="mode"
          type="button"
          :class="{ active: draftTargetMode === mode }"
          @click="draftTargetMode = mode"
        >
          {{ goalModeLabel(mode) }}
        </button>
      </div>

      <div class="target-option-list">
        <button
          v-for="option in draftTargetOptions"
          :key="option.key"
          type="button"
          :class="{ active: draftTargetKey === option.key }"
          @click="selectDraftTarget(option)"
        >
          <span>{{ option.label }}</span>
          <b>{{ targetValueText(option) }}</b>
        </button>

        <label class="target-custom-row" :class="{ active: draftTargetKey === 'custom' }">
          <span>自定义</span>
          <input
            v-model="customTargetInput"
            type="number"
            min="0"
            inputmode="decimal"
            :placeholder="customPlaceholder"
            @focus="draftTargetKey = 'custom'"
          />
          <b>{{ draftTargetMode === 'distance' ? customDistanceUnit : '分钟' }}</b>
        </label>
      </div>

      <footer class="target-panel__footer">
        <button type="button" @click="confirmTarget">确认修改</button>
      </footer>
    </section>

    <section v-if="shoePanelOpen" class="shoe-panel" aria-label="绑定跑鞋">
      <div class="shoe-panel__sheet">
        <header>
          <div>
            <h2>选择本次运动跑鞋</h2>
          </div>
          <button type="button" aria-label="关闭跑鞋绑定" @click="shoePanelOpen = false">
            <ChevronLeft :size="24" aria-hidden="true" />
          </button>
        </header>
        <div class="shoe-option-list">
          <button type="button" :class="{ active: selectedShoeId === null }" @click="selectShoe(null)">
            <span>不绑定跑鞋</span>
            <b>默认</b>
          </button>
          <button
            v-for="shoe in shoes"
            :key="shoe.id"
            type="button"
            :class="{ active: Number(selectedShoeId) === Number(shoe.id) }"
            :disabled="shoe.isRetired"
            @click="selectShoe(shoe)"
          >
            <span>{{ shoe.name }}</span>
            <b>{{ shoe.isRetired ? '已退役' : shoeDistanceText(shoe) }}</b>
          </button>
        </div>
        <p v-if="shoeLoading" class="shoe-panel__hint">正在加载跑鞋...</p>
        <p v-else-if="shoeError" class="form-error">{{ shoeError }}</p>
        <p v-else-if="!shoes.length" class="shoe-panel__hint">还没有可绑定的跑鞋，可稍后到“我的-跑鞋”添加。</p>
        <footer>
          <button type="button" @click="shoePanelOpen = false">确认</button>
        </footer>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { showToast } from 'vant'
import { ChevronDown, ChevronLeft, Footprints, MapPin, Target } from '@lucide/vue'

import { startSportTypes } from '@/constants/sports'
import {
  appendWorkoutTrackPoints,
  cancelWorkout,
  createWorkout,
  finishWorkout,
  pauseWorkout,
  resumeWorkout,
} from '@/services/workouts'
import { apiClient } from '@/services/http'
import { startNativeMotionLocation } from '@/services/nativeMotionLocation'
import { formatClockDuration, formatDistance, formatPaceSeconds, formatSpeed } from '@/utils/formatters'

const emit = defineEmits(['recording-state-change'])

const SPORT_TARGETS = {
  running: {
    distanceUnit: 'km',
    distance: [
      { key: 'marathon', label: '全马', value: 42190 },
      { key: 'half-marathon', label: '半马', value: 21090 },
      { key: '15k', label: '15公里', value: 15000 },
      { key: '10k', label: '10公里', value: 10000 },
      { key: '5k', label: '5公里', value: 5000 },
    ],
    duration: [120, 90, 60, 30, 15],
  },
  walking: {
    distanceUnit: 'km',
    distance: [
      { key: 'half-marathon', label: '半马', value: 21090 },
      { key: '15k', label: '15公里', value: 15000 },
      { key: '10k', label: '10公里', value: 10000 },
      { key: '5k', label: '5公里', value: 5000 },
      { key: '3k', label: '3公里', value: 3000 },
    ],
    duration: [120, 90, 60, 30, 15],
  },
  cycling: {
    distanceUnit: 'km',
    distance: [
      { key: '100k', label: '100公里', value: 100000 },
      { key: '50k', label: '50公里', value: 50000 },
      { key: '30k', label: '30公里', value: 30000 },
      { key: '20k', label: '20公里', value: 20000 },
      { key: '10k', label: '10公里', value: 10000 },
    ],
    duration: [180, 120, 90, 60, 30],
  },
  swimming: {
    distanceUnit: 'm',
    distance: [
      { key: '3000m', label: '3000米', value: 3000 },
      { key: '1500m', label: '1500米', value: 1500 },
      { key: '1000m', label: '1000米', value: 1000 },
      { key: '500m', label: '500米', value: 500 },
      { key: '200m', label: '200米', value: 200 },
    ],
    duration: [60, 45, 30, 20, 15],
  },
  strength_training: {
    duration: [90, 60, 45, 30, 15],
  },
  other: {
    duration: [60, 45, 30, 20, 15],
  },
}

const sportOptions = startSportTypes.map((sport, index) => ({
  ...sport,
  key: `${sport.type}-${index}`,
}))

const selectedSportKey = ref(sportOptions[0]?.key || '')
const sportMenuOpen = ref(false)
const panelSportMenuOpen = ref(false)
const elapsed = ref(0)
const running = ref(false)
const saved = ref(false)
const busy = ref(false)
const error = ref('')
const workout = ref(null)
const recordingPanelRef = ref(null)
const startedAt = ref('')
const distanceM = ref(0)
const trackPoints = ref([])
const accuracyM = ref(null)
const rollingSpeedMps = ref(null)
const locationStatus = ref('等待定位')
const targetPanelOpen = ref(false)
const target = ref(null)
const draftTargetMode = ref('distance')
const draftTargetKey = ref('')
const draftTargetValue = ref(null)
const customTargetInput = ref('')
const shoePanelOpen = ref(false)
const shoes = ref([])
const shoeLoading = ref(false)
const shoeError = ref('')
const selectedShoeId = ref(null)

let timer = null
let watchId = null
let nativeLocationSession = null
let lastPosition = null
let acceptedSamples = []
let pendingTrackPoints = []
let flushInFlight = false

const selectedSport = computed(() =>
  sportOptions.find((sport) => sport.key === selectedSportKey.value) || sportOptions[0]
)
const selectedShoeName = computed(() => {
  const shoe = shoes.value.find((item) => Number(item.id) === Number(selectedShoeId.value))
  return shoe?.name || ''
})
const distanceText = computed(() => formatDistance(distanceM.value))
const mainDistanceValue = computed(() => {
  if (selectedSport.value.type === 'swimming') return String(Math.round(distanceM.value))
  return (distanceM.value / 1000).toFixed(2)
})
const mainDistanceUnit = computed(() => (selectedSport.value.type === 'swimming' ? '米' : '公里'))
const acceptedPointCount = computed(() => trackPoints.value.filter((point) => point.isAccepted !== false).length)
const sampleCountText = computed(() => `${acceptedPointCount.value}/${trackPoints.value.length} 点`)
const accuracyText = computed(() => (accuracyM.value == null ? '--' : `${Math.round(accuracyM.value)} m`))
const paceText = computed(() => {
  const seconds = Math.max(elapsed.value, 1)
  if (distanceM.value <= 0) return '--'
  const speedMps = rollingSpeedMps.value || distanceM.value / seconds
  if (selectedSport.value.type === 'cycling') return formatSpeed(speedMps)
  return formatPaceSeconds(1000 / speedMps)
})
const paceMetricLabel = computed(() => (selectedSport.value.type === 'cycling' ? '速度' : '配速'))
const sportLocked = computed(() => Boolean(workout.value))
const targetControlsLocked = computed(() => Boolean(workout.value) || busy.value)
const startButtonText = computed(() => {
  if (running.value) return '暂停'
  if (elapsed.value) return '继续'
  return '开始'
})
const targetConfig = computed(() => SPORT_TARGETS[selectedSport.value.type] || SPORT_TARGETS.other)
const availableGoalModes = computed(() => {
  const modes = []
  if (targetConfig.value.distance?.length) modes.push('distance')
  if (targetConfig.value.duration?.length) modes.push('duration')
  return modes
})
const draftTargetOptions = computed(() => {
  if (draftTargetMode.value === 'distance') return targetConfig.value.distance || []
  return (targetConfig.value.duration || []).map((minutes) => ({
    key: `${minutes}m`,
    label: formatDurationHoursLabel(minutes),
    value: minutes * 60,
  }))
})
const customDistanceUnit = computed(() => targetConfig.value.distanceUnit === 'm' ? '米' : '公里')
const customPlaceholder = computed(() => draftTargetMode.value === 'distance' ? '输入目标里程' : '输入目标时间')
const targetSummary = computed(() => {
  if (!target.value) return '未设置'
  if (target.value.mode === 'distance') return formatTargetDistance(target.value.value)
  return formatTargetDuration(target.value.value)
})
const targetProgress = computed(() => {
  if (!target.value) return 0
  const current = target.value.mode === 'distance' ? distanceM.value : elapsed.value
  const total = target.value.value
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, (current / total) * 100))
})
const targetCompleteText = computed(() => {
  if (!target.value || targetProgress.value < 100) return ''
  return target.value.mode === 'distance' ? '已达到距离目标，可根据状态结束保存。' : '已达到时长目标，可根据状态结束保存。'
})

function sqlDate(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
}

function toRad(value) {
  return (value * Math.PI) / 180
}

function haversineM(a, b) {
  const radiusM = 6371000
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radiusM * Math.asin(Math.sqrt(h))
}

function roundedNumber(value, digits = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Number(number.toFixed(digits))
}

function maxAcceptedSpeedMps() {
  return selectedSport.value.type === 'cycling' ? 25 : 12
}

function toggleSportMenu(surface) {
  if (sportLocked.value) return
  if (surface === 'panel') {
    panelSportMenuOpen.value = !panelSportMenuOpen.value
    sportMenuOpen.value = false
    return
  }
  sportMenuOpen.value = !sportMenuOpen.value
  panelSportMenuOpen.value = false
}

function chooseSport(key) {
  selectedSportKey.value = key
  sportMenuOpen.value = false
  panelSportMenuOpen.value = false
}

function goalModeLabel(mode) {
  return mode === 'distance' ? '距离' : '时长'
}

function formatTargetDistance(valueM) {
  if (targetConfig.value.distanceUnit === 'm') return `${Math.round(valueM)} 米`
  const km = valueM / 1000
  return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(2)} 公里`
}

function formatTargetDuration(valueS) {
  const minutes = Math.round(valueS / 60)
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

function targetValueText(option) {
  if (draftTargetMode.value === 'distance') {
    if (option.key === 'marathon' || option.key === 'half-marathon') return formatTargetDistance(option.value)
    return `${Math.round(option.value)} 米`
  }
  return `${Math.round(option.value / 60)} 分钟`
}

function formatDurationHoursLabel(minutes) {
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours.toFixed(0) : Number(hours.toFixed(2))}小时`
}

function openTargetPanel() {
  if (targetControlsLocked.value) return
  if (!availableGoalModes.value.includes(draftTargetMode.value)) {
    draftTargetMode.value = availableGoalModes.value[0] || 'duration'
  }
  if (target.value && availableGoalModes.value.includes(target.value.mode)) {
    draftTargetMode.value = target.value.mode
    draftTargetKey.value = target.value.key
    draftTargetValue.value = target.value.value
    customTargetInput.value = target.value.key === 'custom'
      ? String(target.value.mode === 'distance'
        ? target.value.value / (targetConfig.value.distanceUnit === 'm' ? 1 : 1000)
        : target.value.value / 60)
      : ''
  } else {
    const first = draftTargetOptions.value[0]
    draftTargetKey.value = first?.key || ''
    draftTargetValue.value = first?.value || null
    customTargetInput.value = ''
  }
  targetPanelOpen.value = true
}

function closeTargetPanel() {
  targetPanelOpen.value = false
}

function selectDraftTarget(option) {
  draftTargetKey.value = option.key
  draftTargetValue.value = option.value
  customTargetInput.value = ''
}

function showLocationPlaceholder() {
  showToast('定位功能后续接入')
}

function confirmTarget() {
  if (draftTargetKey.value === 'custom') {
    const numeric = Number(customTargetInput.value)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      showToast('请输入有效目标')
      return
    }
    draftTargetValue.value = draftTargetMode.value === 'distance'
      ? numeric * (targetConfig.value.distanceUnit === 'm' ? 1 : 1000)
      : numeric * 60
  }

  const value = Number(draftTargetValue.value)
  if (!Number.isFinite(value) || value <= 0) {
    showToast('请选择目标')
    return
  }

  target.value = {
    mode: draftTargetMode.value,
    key: draftTargetKey.value || 'custom',
    value,
  }
  targetPanelOpen.value = false
}

async function openShoePanel() {
  shoePanelOpen.value = true
  if (shoes.value.length || shoeLoading.value) return
  shoeLoading.value = true
  shoeError.value = ''
  try {
    const { data } = await apiClient.get('/shoes')
    shoes.value = Array.isArray(data) ? data : []
  } catch (err) {
    shoes.value = []
    shoeError.value = err instanceof Error ? err.message : '跑鞋加载失败'
  } finally {
    shoeLoading.value = false
  }
}

function selectShoe(shoe) {
  selectedShoeId.value = shoe?.id ?? null
}

function shoeDistanceText(shoe) {
  const distance = Number(shoe.boundDistanceKm ?? shoe.distanceKm ?? 0)
  return Number.isFinite(distance) && distance > 0 ? `${Math.round(distance)} km` : '未使用'
}

async function bindSelectedShoe(activityId) {
  if (!activityId || !selectedShoeId.value) return
  await apiClient.post(`/activities/${activityId}/shoe`, { shoeId: selectedShoeId.value })
}

function updateRollingSpeed(timestamp) {
  const latest = acceptedSamples.at(-1)
  if (!latest) {
    rollingSpeedMps.value = null
    return
  }

  acceptedSamples = acceptedSamples.filter((sample) =>
    timestamp - sample.timestamp <= 15000 || latest.distanceM - sample.distanceM <= 100
  )
  const earliest = acceptedSamples[0]
  const seconds = earliest ? (latest.timestamp - earliest.timestamp) / 1000 : 0
  const meters = earliest ? latest.distanceM - earliest.distanceM : 0
  rollingSpeedMps.value = seconds >= 5 && meters > 1 ? meters / seconds : null
}

function rejectTrackPoint(basePoint, reason, speedMps) {
  return {
    ...basePoint,
    distanceM: Math.round(distanceM.value),
    speedMps: roundedNumber(speedMps, 2),
    isAccepted: false,
    rejectReason: reason,
  }
}

function createTrackPoint(position) {
  const coords = position.coords || {}
  const latitude = roundedNumber(coords.latitude, 7)
  const longitude = roundedNumber(coords.longitude, 7)
  if (latitude == null || longitude == null) return null

  const timestamp = Number(position.timestamp) || Date.now()
  const measuredSpeed = Number(coords.speed)
  const accuracy = Number(coords.accuracy)
  const bearing = Number(coords.heading ?? coords.bearing)
  const current = { latitude, longitude, timestamp }
  const previous = lastPosition
  const deltaSeconds = previous ? (timestamp - previous.timestamp) / 1000 : 1
  const deltaDistanceM = previous ? haversineM(previous, current) : 0
  const derivedSpeedMps = deltaSeconds > 0 ? deltaDistanceM / deltaSeconds : null
  const speedMps = Number.isFinite(measuredSpeed) && measuredSpeed >= 0
    ? measuredSpeed
    : derivedSpeedMps
  const basePoint = {
    sampleTimeUtc: sqlDate(new Date(timestamp)),
    latitude,
    longitude,
    altitudeM: roundedNumber(coords.altitude, 1),
    distanceM: Math.round(distanceM.value),
    speedMps: roundedNumber(speedMps, 2),
    accuracyM: Number.isFinite(accuracy) ? roundedNumber(accuracy, 1) : null,
    bearingDeg: Number.isFinite(bearing) ? roundedNumber(bearing, 1) : null,
    provider: position.provider || coords.provider || 'web-geolocation',
    heartRateBpm: null,
    cadence: null,
    powerW: null,
  }

  accuracyM.value = basePoint.accuracyM
  if (basePoint.accuracyM != null && basePoint.accuracyM > 80) {
    return rejectTrackPoint(basePoint, 'low_accuracy', speedMps)
  }
  if (previous && deltaSeconds <= 0) {
    return rejectTrackPoint(basePoint, 'non_increasing_time', speedMps)
  }
  if (previous && derivedSpeedMps != null && derivedSpeedMps > maxAcceptedSpeedMps()) {
    return rejectTrackPoint(basePoint, 'gps_jump', speedMps)
  }
  if (speedMps != null && speedMps > maxAcceptedSpeedMps()) {
    return rejectTrackPoint(basePoint, 'speed_outlier', speedMps)
  }
  if (previous && deltaDistanceM < 1) {
    return rejectTrackPoint(basePoint, 'stationary_drift', speedMps)
  }

  distanceM.value = Math.max(0, distanceM.value + deltaDistanceM)
  lastPosition = current
  return {
    ...basePoint,
    distanceM: Math.round(distanceM.value),
    isAccepted: true,
    rejectReason: null,
  }
}

function handleLocation(position) {
  if (!running.value || !workout.value) return
  const point = createTrackPoint(position)
  if (!point) return

  trackPoints.value.push(point)
  pendingTrackPoints.push(point)
  if (point.isAccepted === false) {
    locationStatus.value = point.rejectReason === 'low_accuracy' ? '精度偏低' : '已过滤漂移'
  } else {
    acceptedSamples.push({ timestamp: Number(position.timestamp) || Date.now(), distanceM: distanceM.value })
    updateRollingSpeed(Number(position.timestamp) || Date.now())
    locationStatus.value = point.provider?.startsWith('native') ? '原生定位正常' : '定位正常'
  }
  error.value = ''

  if (pendingTrackPoints.length >= 5) {
    void flushTrackPoints().catch((err) => {
      error.value = err instanceof Error ? err.message : '定位点同步失败，结束时会重试。'
    })
  }
}

function handleLocationError(err) {
  const denied = err?.code === 1
  if (!denied && trackPoints.value.length > 0) {
    locationStatus.value = '定位不稳定'
    return
  }
  locationStatus.value = denied ? '定位被拒绝' : '定位不可用'
  error.value = denied ? '请允许定位权限后再开始实时记录。' : '暂时无法获取定位，请保持网络和定位服务可用。'
}

function scrollActiveRecorderIntoView() {
  void nextTick(() => {
    recordingPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function positionFromNativeSample(sample) {
  return {
    timestamp: Number(sample.timestamp) || Date.now(),
    provider: sample.provider || 'native-location',
    coords: {
      latitude: sample.latitude,
      longitude: sample.longitude,
      altitude: sample.altitudeM,
      accuracy: sample.accuracyM,
      heading: sample.bearingDeg,
      speed: sample.speedMps,
      provider: sample.provider || 'native-location',
    },
  }
}

function handleNativeStatus(status = {}) {
  if (status.status === 'provider_disabled') {
    locationStatus.value = '定位服务关闭'
  } else if (status.status === 'permission_missing') {
    locationStatus.value = '定位被拒绝'
  } else if (status.status === 'running') {
    locationStatus.value = status.backgroundGranted === false ? '原生前台定位' : '原生后台定位'
  } else if (status.status === 'stopped') {
    locationStatus.value = '已暂停'
  }
}

async function startLocationWatch() {
  if (watchId != null || nativeLocationSession) return
  locationStatus.value = '定位中'
  try {
    nativeLocationSession = await startNativeMotionLocation({
      onLocation: (sample) => handleLocation(positionFromNativeSample(sample)),
      onStatus: handleNativeStatus,
    })
    if (nativeLocationSession) {
      locationStatus.value = nativeLocationSession.status?.backgroundGranted === false
        ? '原生前台定位'
        : '原生后台定位'
      return
    }
  } catch (err) {
    nativeLocationSession = null
    locationStatus.value = '定位兜底中'
  }

  if (!('geolocation' in navigator)) {
    throw new Error('当前设备不支持定位，无法实时记录轨迹。')
  }
  watchId = navigator.geolocation.watchPosition(handleLocation, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  })
}

async function stopLocationWatch() {
  if (nativeLocationSession) {
    const session = nativeLocationSession
    nativeLocationSession = null
    await session.stop()
  }
  if (watchId != null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
}

async function flushTrackPoints() {
  if (!workout.value || pendingTrackPoints.length === 0 || flushInFlight) return
  flushInFlight = true
  const batch = pendingTrackPoints.splice(0)
  try {
    await appendWorkoutTrackPoints(workout.value.id, batch)
  } catch (err) {
    pendingTrackPoints = [...batch, ...pendingTrackPoints]
    throw err
  } finally {
    flushInFlight = false
  }
}

async function ensureWorkout() {
  if (workout.value) return workout.value
  startedAt.value = sqlDate(new Date())
  workout.value = await createWorkout({
    activityType: selectedSport.value.type,
    startedAt: startedAt.value,
  })
  return workout.value
}

async function toggleRecording() {
  busy.value = true
  error.value = ''
  saved.value = false
  try {
    const current = await ensureWorkout()
    if (running.value) {
      await stopLocationWatch()
      await flushTrackPoints()
      await pauseWorkout(current.id)
      running.value = false
      locationStatus.value = '已暂停'
    } else {
      if (elapsed.value > 0) await resumeWorkout(current.id)
      running.value = true
      await startLocationWatch()
      scrollActiveRecorderIntoView()
    }
  } catch (err) {
    running.value = false
    await stopLocationWatch()
    error.value = err instanceof Error ? err.message : '开始运动失败'
  } finally {
    busy.value = false
  }
}

async function finish() {
  if (!workout.value) return
  busy.value = true
  running.value = false
  await stopLocationWatch()
  error.value = ''
  try {
    await flushTrackPoints()
    const result = await finishWorkout(workout.value.id, {
      activityName: selectedSport.value.label,
      locationName: '手机定位记录',
      distanceM: Math.round(distanceM.value),
      durationS: Math.max(1, elapsed.value),
      calories: null,
    })
    const activityId = result?.activity?.id || result?.activityId
    try {
      await bindSelectedShoe(activityId)
    } catch (err) {
      showToast('运动已保存，跑鞋绑定失败')
    }
    saved.value = true
    resetWorkoutState()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存运动失败'
  } finally {
    busy.value = false
  }
}

async function cancel() {
  if (!workout.value) return
  busy.value = true
  running.value = false
  await stopLocationWatch()
  error.value = ''
  try {
    await cancelWorkout(workout.value.id)
    resetWorkoutState()
    locationStatus.value = '已取消'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '取消运动失败'
  } finally {
    busy.value = false
  }
}

function resetWorkoutState() {
  workout.value = null
  elapsed.value = 0
  distanceM.value = 0
  trackPoints.value = []
  pendingTrackPoints = []
  lastPosition = null
  acceptedSamples = []
  accuracyM.value = null
  rollingSpeedMps.value = null
}

watch(running, (active) => {
  window.clearInterval(timer)
  if (active) {
    timer = window.setInterval(() => {
      elapsed.value += 1
    }, 1000)
  }
})

watch(workout, (current) => {
  emit('recording-state-change', Boolean(current))
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  void stopLocationWatch()
})

watch(selectedSportKey, () => {
  sportMenuOpen.value = false
  panelSportMenuOpen.value = false
  if (!availableGoalModes.value.includes(draftTargetMode.value)) {
    draftTargetMode.value = availableGoalModes.value[0] || 'duration'
  }
  target.value = null
  draftTargetKey.value = ''
  draftTargetValue.value = null
  customTargetInput.value = ''
})

watch(draftTargetMode, () => {
  const first = draftTargetOptions.value[0]
  draftTargetKey.value = first?.key || ''
  draftTargetValue.value = first?.value || null
  customTargetInput.value = ''
})
</script>

<style scoped>
.record-workout-page {
  position: relative;
  min-height: min(660px, calc(100dvh - var(--navbar-h) - var(--tabbar-h) - 48px));
  display: grid;
  color: var(--text);
}

.record-dashboard {
  display: grid;
  grid-template-rows: auto minmax(108px, 1fr) auto auto auto auto;
  gap: 16px;
  min-height: 100%;
  padding: 20px 4px 8px;
}

.record-dashboard__top,
.target-panel__top {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 72px;
  align-items: center;
  gap: 10px;
}

.record-icon-button,
.target-back,
.round-side-action {
  border: 1px solid color-mix(in srgb, var(--app-green) 18%, var(--border));
  background: color-mix(in srgb, var(--app-green) 8%, var(--panel));
  color: var(--app-green-dark);
  box-shadow: var(--shadow-sm);
}

.record-icon-button,
.target-back {
  width: 44px;
  height: 44px;
  display: inline-grid;
  place-items: center;
  border-radius: 16px;
}

.sport-select {
  position: relative;
  justify-self: center;
  max-width: 210px;
  width: 100%;
  z-index: 6;
}

.sport-select > button {
  width: 100%;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, var(--sport-color) 28%, var(--border));
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: var(--text);
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}

.sport-select > button svg {
  color: var(--app-green-dark);
  transition: transform 140ms ease;
}

.sport-select.open > button {
  border-color: var(--app-amber);
  box-shadow: 0 10px 24px rgb(15 109 74 / 0.12);
}

.sport-select.open > button svg {
  transform: rotate(180deg);
}

.sport-menu {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  z-index: 12;
  overflow: hidden;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--sport-color) 24%, var(--border));
  border-radius: 18px;
  background: rgb(255 255 255 / 0.98);
  box-shadow: 0 18px 42px rgb(15 109 74 / 0.18);
}

.sport-menu button {
  width: 100%;
  min-height: 38px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font-weight: 700;
}

.sport-menu button.active {
  background: color-mix(in srgb, var(--sport-color) 13%, var(--panel-soft));
  color: var(--app-green-dark);
}

.sport-select.disabled {
  opacity: 0.68;
}

.record-status {
  justify-self: end;
  min-width: 64px;
  padding: 7px 10px;
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: #95b8ea;
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.record-status.active {
  background: color-mix(in srgb, var(--app-green) 14%, var(--panel));
  color: var(--app-green-dark);
}

.distance-stage {
  align-self: center;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 12px 0 2px;
}

.distance-stage strong {
  color: var(--sport-color);
  font-size: clamp(68px, 19vw, 96px);
  font-weight: 900;
  line-height: 1.18;
  letter-spacing: 0;
}

.distance-stage span {
  color: var(--muted);
  font-size: 22px;
  font-weight: 700;
}

.target-progress {
  display: grid;
  gap: 10px;
  padding: 0 12px;
}

.target-progress__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 15px;
}

.target-progress__meta span {
  font-weight: 600;
}

.target-progress__meta b {
  color: rgb(100 116 139);
  font-size: 15px;
  font-weight: 600;
  text-align: right;
}

.target-progress__bar {
  height: 10px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.target-progress__bar i {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--app-green), var(--app-lime));
  transition: width 180ms ease;
}

.target-progress.complete .target-progress__bar i {
  background: linear-gradient(90deg, var(--app-amber), var(--app-green));
}

.record-metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.record-metric-grid span {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--sport-color) 12%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.record-metric-grid small {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.record-metric-grid b {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 18px;
  line-height: 1.15;
}

.record-main-actions {
  display: grid;
  grid-template-columns: 62px minmax(108px, 132px) 62px;
  justify-content: center;
  align-items: center;
  gap: 22px;
  padding: 4px 0;
}

.round-side-action {
  width: 58px;
  height: 58px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  position: relative;
}

.round-side-action small {
  position: absolute;
  left: 50%;
  top: calc(100% + 3px);
  max-width: 76px;
  overflow: hidden;
  color: var(--app-green-dark);
  font-size: 10px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(-50%);
}

.start-action {
  width: min(32vw, 128px);
  aspect-ratio: 1;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: var(--app-green-dark);
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 18px 38px rgb(15 109 74 / 0.14);
}

.record-save-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.record-save-actions button {
  min-height: 44px;
}

.record-save-actions .danger-link {
  border-color: color-mix(in srgb, #ec1818 32%, var(--border));
  background: #f2e3e3;
  color: #ec1818 !important;
}

.target-complete-copy,
.success-copy,
.form-error {
  margin: 0;
  text-align: center;
  line-height: 1.5;
}

.target-complete-copy {
  color: var(--app-green-dark);
}

.record-workout-page .form-error {
  color: #ee6363;
}

.target-panel {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 22px;
  padding: 16px 16px calc(16px + var(--safe-bottom));
  background: var(--bg);
}

.target-panel__top {
  grid-template-columns: 48px minmax(0, 1fr) 48px;
}

.sport-select--panel {
  max-width: 230px;
}

.target-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding: 0 32px;
}

.target-tabs.single {
  grid-template-columns: 1fr;
}

.target-tabs button {
  position: relative;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 22px;
  font-weight: 800;
}

.target-tabs button.active {
  color: var(--text);
}

.target-tabs button.active::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 52px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--app-lime);
  transform: translateX(-50%);
}

.target-option-list {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  overflow-y: auto;
  padding: 2px 0 8px;
}

.target-option-list button,
.target-custom-row {
  min-height: 70px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border: 1px solid color-mix(in srgb, var(--app-green) 12%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.target-option-list button.active,
.target-custom-row.active {
  border-color: var(--app-lime);
  box-shadow: inset 0 0 0 1px var(--app-lime), var(--shadow-sm);
}

.target-option-list span,
.target-custom-row span {
  font-size: 20px;
  font-weight: 800;
}

.target-option-list b,
.target-custom-row b {
  color: var(--app-green-dark);
  font-size: 22px;
  font-weight: 900;
}

.target-custom-row {
  grid-template-columns: auto minmax(150px, 1fr) auto;
}

.target-custom-row input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 18px;
  text-align: right;
}

.target-custom-row input::placeholder {
  color: #697386;
  opacity: 1;
}

.target-custom-row input::-webkit-outer-spin-button,
.target-custom-row input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.target-custom-row input[type="number"] {
  appearance: textfield;
}

.shoe-panel {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  align-items: end;
  background: rgb(16 37 26 / 0.18);
}

.shoe-panel__sheet {
  display: grid;
  gap: 14px;
  max-height: min(620px, calc(100% - 72px));
  padding: 18px 16px calc(18px + var(--safe-bottom));
  border-radius: 24px 24px 0 0;
  background: var(--bg);
  box-shadow: 0 -18px 44px rgb(15 109 74 / 0.16);
}

.shoe-panel__sheet header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  gap: 12px;
}

.shoe-panel__sheet h2,
.shoe-panel__sheet p {
  margin: 0;
}

.shoe-panel__sheet header button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel);
  color: var(--app-green-dark);
  transform: rotate(-90deg);
}

.shoe-option-list {
  min-height: 0;
  display: grid;
  gap: 10px;
  overflow-y: auto;
}

.shoe-option-list button {
  min-height: 58px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-green) 14%, var(--border));
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.shoe-option-list button.active {
  border-color: var(--app-green);
  background: color-mix(in srgb, var(--app-green) 9%, var(--panel));
}

.shoe-option-list button:disabled {
  opacity: 0.55;
}

.shoe-option-list span {
  min-width: 0;
  overflow: hidden;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shoe-option-list b {
  color: var(--app-green-dark);
}

.shoe-panel__hint {
  margin: 0;
  color: var(--muted);
  text-align: center;
}

.shoe-panel__sheet footer {
  display: grid;
}

.shoe-panel__sheet footer button {
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  background: var(--app-green-dark);
  color: #fff;
  font-weight: 900;
}

.target-panel__footer {
  display: grid;
}

.target-panel__footer button {
  min-height: 54px;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--app-green-dark);
  color: #fff;
  font-size: 19px;
  font-weight: 900;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@container phone-frame (max-width: 374px) {
  .record-dashboard {
    gap: 18px;
    padding-top: 4px;
  }

  .record-dashboard__top {
    grid-template-columns: 42px minmax(0, 1fr) 62px;
  }

  .record-icon-button,
  .target-back {
    width: 40px;
    height: 40px;
    border-radius: 14px;
  }

  .sport-select > button {
    height: 40px;
    padding-left: 12px;
    font-size: 14px;
  }

  .record-main-actions {
    grid-template-columns: 58px minmax(104px, 128px) 58px;
    gap: 16px;
  }

  .round-side-action {
    width: 54px;
    height: 54px;
  }

  .start-action {
    font-size: 24px;
  }

  .target-tabs {
    padding: 0 18px;
  }

  .target-option-list button,
  .target-custom-row {
    min-height: 62px;
    padding: 0 14px;
    grid-template-columns: auto minmax(112px, 1fr) auto;
  }

  .target-option-list span,
  .target-custom-row span {
    font-size: 18px;
  }

  .target-option-list b,
  .target-custom-row b {
    font-size: 19px;
  }
}
</style>
