<template>
  <div class="page-stack">
    <section class="workout-rq-panel">
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

    <section class="sport-start-grid">
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

    <section class="recording-panel dark-panel">
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
      <p class="muted-copy">请保持 MotionCare 在前台，并允许手机定位权限。没有定位点时不会生成运动轨迹。</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="saved" class="success-copy">运动已保存，可在“运动记录”查看。</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { startSportTypes } from '@/constants/sports'
import {
  appendWorkoutTrackPoints,
  cancelWorkout,
  createWorkout,
  finishWorkout,
  pauseWorkout,
  resumeWorkout,
} from '@/services/workouts'
import { formatClockDuration, formatDistance, formatPaceSeconds, formatSpeed } from '@/utils/formatters'

const selectedSport = ref(startSportTypes[0])
const elapsed = ref(0)
const running = ref(false)
const saved = ref(false)
const busy = ref(false)
const error = ref('')
const workout = ref(null)
const startedAt = ref('')
const distanceM = ref(0)
const trackPoints = ref([])
const accuracyM = ref(null)
const locationStatus = ref('等待定位')

let timer = null
let watchId = null
let lastPosition = null
let pendingTrackPoints = []
let flushInFlight = false

const distanceText = computed(() => formatDistance(distanceM.value))
const sampleCountText = computed(() => `${trackPoints.value.length} 点`)
const accuracyText = computed(() => (accuracyM.value == null ? '--' : `${Math.round(accuracyM.value)} m`))
const paceText = computed(() => {
  const seconds = Math.max(elapsed.value, 1)
  if (distanceM.value <= 0) return '--'
  const speedMps = distanceM.value / seconds
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

function createTrackPoint(position) {
  const coords = position.coords || {}
  const latitude = roundedNumber(coords.latitude, 7)
  const longitude = roundedNumber(coords.longitude, 7)
  if (latitude == null || longitude == null) return null

  const timestamp = Number(position.timestamp) || Date.now()
  const current = { latitude, longitude, timestamp }
  const previous = lastPosition
  const deltaSeconds = previous ? Math.max((timestamp - previous.timestamp) / 1000, 1) : 1
  const deltaDistanceM = previous ? haversineM(previous, current) : 0
  const safeDeltaM = deltaDistanceM > 0.5 ? deltaDistanceM : 0
  const measuredSpeed = Number(coords.speed)
  const speedMps = Number.isFinite(measuredSpeed) && measuredSpeed >= 0
    ? Math.min(measuredSpeed, 30)
    : Math.min(safeDeltaM / deltaSeconds, 30)

  distanceM.value = Math.max(0, distanceM.value + safeDeltaM)
  lastPosition = current
  accuracyM.value = Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null

  return {
    sampleTimeUtc: sqlDate(new Date(timestamp)),
    latitude,
    longitude,
    altitudeM: roundedNumber(coords.altitude, 1),
    distanceM: Math.round(distanceM.value),
    speedMps: roundedNumber(speedMps, 2),
    heartRateBpm: null,
    cadence: null,
    powerW: null,
  }
}

function handleLocation(position) {
  if (!running.value || !workout.value) return
  const point = createTrackPoint(position)
  if (!point) return

  trackPoints.value.push(point)
  pendingTrackPoints.push(point)
  locationStatus.value = accuracyM.value != null && accuracyM.value > 80 ? '精度偏低' : '定位正常'

  if (pendingTrackPoints.length >= 5) {
    void flushTrackPoints().catch((err) => {
      error.value = err instanceof Error ? err.message : '定位点同步失败，结束时会重试。'
    })
  }
}

function handleLocationError(err) {
  const denied = err?.code === 1
  locationStatus.value = denied ? '定位被拒绝' : '定位不可用'
  error.value = denied ? '请允许定位权限后再开始实时记录。' : '暂时无法获取定位，请保持网络和定位服务可用。'
}

function startLocationWatch() {
  if (watchId != null) return
  if (!('geolocation' in navigator)) {
    throw new Error('当前设备不支持定位，无法实时记录轨迹。')
  }
  locationStatus.value = '定位中'
  watchId = navigator.geolocation.watchPosition(handleLocation, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  })
}

function stopLocationWatch() {
  if (watchId == null || !('geolocation' in navigator)) return
  navigator.geolocation.clearWatch(watchId)
  watchId = null
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
      stopLocationWatch()
      await flushTrackPoints()
      await pauseWorkout(current.id)
      running.value = false
      locationStatus.value = '已暂停'
    } else {
      if (elapsed.value > 0) await resumeWorkout(current.id)
      running.value = true
      startLocationWatch()
    }
  } catch (err) {
    running.value = false
    stopLocationWatch()
    error.value = err instanceof Error ? err.message : '开始运动失败'
  } finally {
    busy.value = false
  }
}

async function finish() {
  if (!workout.value) return
  busy.value = true
  running.value = false
  stopLocationWatch()
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
  stopLocationWatch()
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
  accuracyM.value = null
}

watch(running, (active) => {
  window.clearInterval(timer)
  if (active) {
    timer = window.setInterval(() => {
      elapsed.value += 1
    }, 1000)
  }
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  stopLocationWatch()
})
</script>
