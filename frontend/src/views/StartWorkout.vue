<template>
  <div class="page-stack">
    <section class="workout-rq-panel" v-if="!workout">
      <div>
        <p class="overline">实时训练</p>
        <h2>{{ selectedSport.label }}</h2>
        <p>允许定位后按 GPS 采样记录轨迹，结束后保存为一条运动记录。</p>
      </div>
      <div class="workout-telemetry-grid">
        <span><small>当前配速</small><b>{{ paceText }}</b></span>
        <span><small>训练采样</small><b>{{ sampleCountText }}</b></span>
        <span><small>GPS 精度</small><b>{{ accuracyText }}</b></span>
      </div>
    </section>

    <section class="sport-start-grid" v-if="!workout">
      <button
        v-for="sport in startSportTypes"
        :key="sport.label"
        type="button"
        :class="{ active: selectedSport.label === sport.label }"
        :disabled="Boolean(workout)"
        :style="{ '--sport-color': sport.color }"
        @click="selectedSport = sport"
      >
        <component :is="sport.icon" :size="22" />
        {{ sport.label }}
      </button>
    </section>

    <section ref="recordingPanelRef" class="recording-panel dark-panel">
      <span class="status-chip" :class="workout ? 'good' : 'neutral'">{{ workout ? '记录中' : '未开始' }}</span>
      <div class="recording-time">{{ formatClockDuration(elapsed) }}</div>
      <div class="recording-metrics">
        <span><small>距离</small><b>{{ distanceText }}</b></span>
        <span><small>配速/速度</small><b>{{ paceText }}</b></span>
        <span><small>定位状态</small><b>{{ locationStatus }}</b></span>
        <span><small>已采样</small><b>{{ sampleCountText }}</b></span>
      </div>
      <div class="recording-actions">
        <button class="primary-link" type="button" :disabled="busy || saved" @click="toggleRecording">
          {{ running ? '暂停' : elapsed ? '继续' : '开始' }}
        </button>
        <button class="secondary-link" type="button" :disabled="busy || !workout || elapsed < 1 || trackPoints.length === 0" @click="finish">
          结束并保存
        </button>
        <button class="danger-link" type="button" :disabled="busy || !workout" @click="cancel">
          取消
        </button>
      </div>
      <p class="muted-copy">APK 会优先使用原生定位服务持续记录；浏览器环境会退回前台 GPS 采样。</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="saved" class="success-copy">运动已保存，可在“运动记录”查看。</p>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { startSportTypes } from '@/constants/sports'
import {
  appendWorkoutTrackPoints,
  cancelWorkout,
  createWorkout,
  finishWorkout,
  pauseWorkout,
  resumeWorkout,
} from '@/services/workouts'
import { startNativeMotionLocation } from '@/services/nativeMotionLocation'
import { formatClockDuration, formatDistance, formatPaceSeconds, formatSpeed } from '@/utils/formatters'

const emit = defineEmits(['recording-state-change'])

const selectedSport = ref(startSportTypes[0])
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

let timer = null
let watchId = null
let nativeLocationSession = null
let lastPosition = null
let acceptedSamples = []
let pendingTrackPoints = []
let flushInFlight = false

const distanceText = computed(() => formatDistance(distanceM.value))
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
    await finishWorkout(workout.value.id, {
      activityName: selectedSport.value.label,
      locationName: '手机定位记录',
      distanceM: Math.round(distanceM.value),
      durationS: Math.max(1, elapsed.value),
      calories: null,
    })
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
</script>
