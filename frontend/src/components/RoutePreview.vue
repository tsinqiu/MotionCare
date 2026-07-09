<template>
  <section class="panel route-panel">
    <div class="panel-heading">
      <div>
        <p class="overline">TrackPoints</p>
        <h2>地图轨迹预览</h2>
      </div>
      <span>{{ validPoints.length }} 点</span>
    </div>

    <div v-if="validPoints.length && !mapError" ref="mapRef" class="route-map" aria-label="轨迹地图预览"></div>
    <div v-else-if="validPoints.length && mapError" class="route-map route-map-empty route-map-error" aria-label="轨迹地图加载失败">
      <strong>地图加载失败</strong>
      <span>{{ mapError }}</span>
    </div>
    <div v-else class="route-map route-map-empty" aria-label="轨迹地图预览为空">
      <strong>暂无可用地图轨迹</strong>
      <span>当前运动没有有效经纬度采样点。</span>
    </div>
  </section>
</template>

<script setup>
import AMapLoader from '@amap/amap-jsapi-loader'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { getPublicConfig } from '@/services/system'

const props = defineProps({
  points: {
    type: Array,
    default: () => [],
  },
})

const mapRef = ref(null)
const mapError = ref('')
let AMapApi = null
let map = null
let routeOverlays = []
let markerOverlays = []
let refreshToken = 0

const EARTH_RADIUS_M = 6371000
const FALLBACK_ROUTE_COLOR = '#21d47b'
const SPEED_COLOR_STOPS = [
  { at: 0, color: [37, 99, 235] },
  { at: 0.25, color: [6, 182, 212] },
  { at: 0.5, color: [34, 197, 94] },
  { at: 0.75, color: [245, 158, 11] },
  { at: 1, color: [239, 68, 68] },
]
let publicConfigPromise = null

function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toDistance(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null
}

function toPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

function toTimestamp(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function toBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return null
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function interpolateColor(from, to, ratio) {
  const safeRatio = clamp(ratio, 0, 1)
  const [r, g, b] = from.map((value, index) =>
    Math.round(value + (to[index] - value) * safeRatio),
  )
  return `rgb(${r}, ${g}, ${b})`
}

function colorFromStops(ratio) {
  const safeRatio = clamp(ratio, 0, 1)
  const upperIndex = SPEED_COLOR_STOPS.findIndex((stop) => stop.at >= safeRatio)
  if (upperIndex <= 0) {
    return interpolateColor(SPEED_COLOR_STOPS[0].color, SPEED_COLOR_STOPS[0].color, 0)
  }

  const lower = SPEED_COLOR_STOPS[upperIndex - 1]
  const upper = SPEED_COLOR_STOPS[upperIndex]
  const span = upper.at - lower.at
  const localRatio = span > 0 ? (safeRatio - lower.at) / span : 0
  return interpolateColor(lower.color, upper.color, localRatio)
}

function quantile(values, ratio) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * clamp(ratio, 0, 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function colorForSpeed(speedMps, minSpeedMps, maxSpeedMps) {
  if (!Number.isFinite(speedMps) || speedMps <= 0) return FALLBACK_ROUTE_COLOR
  if (!Number.isFinite(minSpeedMps) || !Number.isFinite(maxSpeedMps)) return FALLBACK_ROUTE_COLOR

  const span = maxSpeedMps - minSpeedMps
  const ratio = span > 0 ? (speedMps - minSpeedMps) / span : 0.5
  const bucketedRatio = Math.round(clamp(ratio, 0, 1) * 18) / 18
  return colorFromStops(bucketedRatio)
}

function distanceBetween(a, b) {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function interpolatePoint(before, after, targetDistanceM) {
  const span = after.distanceM - before.distanceM
  if (span <= 0) {
    return { latitude: after.displayLatitude, longitude: after.displayLongitude }
  }

  const ratio = Math.min(Math.max((targetDistanceM - before.distanceM) / span, 0), 1)
  return {
    latitude: before.displayLatitude + (after.displayLatitude - before.displayLatitude) * ratio,
    longitude: before.displayLongitude + (after.displayLongitude - before.displayLongitude) * ratio,
  }
}

function isInChina(latitude, longitude) {
  return longitude >= 72.004 && longitude <= 137.8347 && latitude >= 0.8293 && latitude <= 55.8271
}

function transformLat(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  value += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  value += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return value
}

function transformLon(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  value += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  value += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return value
}

function toDisplayCoordinate(latitude, longitude) {
  if (!isInChina(latitude, longitude)) {
    return { latitude, longitude }
  }

  const axis = 6378245
  const offset = 0.006693421622965943
  let dLat = transformLat(longitude - 105, latitude - 35)
  let dLon = transformLon(longitude - 105, latitude - 35)
  const radLat = (latitude / 180) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - offset * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((axis * (1 - offset)) / (magic * sqrtMagic)) * Math.PI)
  dLon = (dLon * 180) / ((axis / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return { latitude: latitude + dLat, longitude: longitude + dLon }
}

function toAmapPath(points) {
  return points.map((point) => [point.displayLongitude, point.displayLatitude])
}

async function getAmapConfig() {
  if (!publicConfigPromise) {
    publicConfigPromise = getPublicConfig()
  }
  const publicConfig = await publicConfigPromise
  return publicConfig?.maps?.amap || {}
}

function configureAmapSecurity(securityCode) {
  if (!securityCode || typeof window === 'undefined') return
  window._AMapSecurityConfig = {
    ...(window._AMapSecurityConfig || {}),
    securityJsCode: securityCode,
  }
}

async function loadAmap() {
  if (typeof window === 'undefined') {
    throw new Error('当前运行环境不支持地图渲染。')
  }
  const amapConfig = await getAmapConfig()
  const key = amapConfig.key || ''
  if (!key) {
    throw new Error('缺少 AMAP_JS_API_KEY，请在 backend/.env 中配置高德 JS API Key。')
  }

  configureAmapSecurity(amapConfig.securityCode)
  if (window.AMap?.Map) return window.AMap

  if (!window.__motioncareAmapLoadPromise) {
    window.__motioncareAmapLoadPromise = AMapLoader.load({
      key,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar'],
    })
  }

  return window.__motioncareAmapLoadPromise
}

const validPoints = computed(() =>
  props.points
    .map((point) => {
      const latitude = toCoordinate(point.latitude)
      const longitude = toCoordinate(point.longitude)
      const sourceDistanceM = toDistance(point.distance_m ?? point.distanceM)
      const speedMps = toPositiveNumber(point.speed_mps ?? point.speedMps)
      const timestampMs = toTimestamp(point.sample_time_utc ?? point.sampleTimeUtc)
      const isAccepted = toBoolean(point.is_accepted ?? point.isAccepted)
      return { latitude, longitude, sourceDistanceM, speedMps, timestampMs, isAccepted }
    })
    .filter((point) =>
      point.latitude !== null
      && point.longitude !== null
      && point.latitude >= -90
      && point.latitude <= 90
      && point.longitude >= -180
      && point.longitude <= 180
      && point.isAccepted !== false
    )
    .reduce((points, point, index) => {
      const previous = points.at(-1)
      const segmentDistanceM = previous
        ? distanceBetween(previous, point)
        : 0
      const fallbackDistanceM = previous
        ? previous.distanceM + segmentDistanceM
        : 0
      const previousDistanceM = previous?.distanceM ?? 0
      const distanceM = point.sourceDistanceM !== null && point.sourceDistanceM >= previousDistanceM
        ? point.sourceDistanceM
        : fallbackDistanceM

      const display = toDisplayCoordinate(point.latitude, point.longitude)
      points.push({
        latitude: point.latitude,
        longitude: point.longitude,
        displayLatitude: display.latitude,
        displayLongitude: display.longitude,
        distanceM: index === 0 ? 0 : distanceM,
        speedMps: point.speedMps,
        timestampMs: point.timestampMs,
      })
      return points
    }, []),
)

const amapPath = computed(() => toAmapPath(validPoints.value))

const routeSegments = computed(() => {
  if (validPoints.value.length < 2) return []

  const segments = validPoints.value.slice(1).map((point, index) => {
    const previous = validPoints.value[index]
    const segmentDistanceM = Math.max(point.distanceM - previous.distanceM, 0)
    const segmentDurationS = point.timestampMs && previous.timestampMs
      ? (point.timestampMs - previous.timestampMs) / 1000
      : null
    const fallbackSpeedMps = segmentDurationS && segmentDurationS > 0
      ? segmentDistanceM / segmentDurationS
      : null
    const speedMps = point.speedMps ?? previous.speedMps ?? fallbackSpeedMps

    return {
      path: [
        [previous.displayLongitude, previous.displayLatitude],
        [point.displayLongitude, point.displayLatitude],
      ],
      speedMps,
    }
  })

  const speeds = segments.map((segment) => segment.speedMps).filter((speed) =>
    Number.isFinite(speed) && speed > 0
  )
  const minSpeedMps = quantile(speeds, 0.05)
  const maxSpeedMps = quantile(speeds, 0.95)

  return segments.map((segment) => ({
    ...segment,
    color: colorForSpeed(segment.speedMps, minSpeedMps, maxSpeedMps),
  }))
})

const groupedRouteSegments = computed(() =>
  routeSegments.value.reduce((groups, segment) => {
    const previous = groups.at(-1)
    if (previous && previous.color === segment.color) {
      previous.path.push(segment.path[1])
    } else {
      groups.push({ color: segment.color, path: [...segment.path] })
    }
    return groups
  }, []),
)

const kilometerMarkers = computed(() => {
  if (validPoints.value.length < 2) return []

  const firstDistanceM = validPoints.value[0].distanceM
  const lastDistanceM = validPoints.value.at(-1).distanceM
  const totalDistanceM = lastDistanceM - firstDistanceM
  const markerCount = Math.floor(totalDistanceM / 1000)
  if (markerCount < 1) return []

  const markers = []
  let segmentIndex = 1

  for (let kilometer = 1; kilometer <= markerCount; kilometer += 1) {
    const targetDistanceM = firstDistanceM + kilometer * 1000
    while (
      segmentIndex < validPoints.value.length - 1
      && validPoints.value[segmentIndex].distanceM < targetDistanceM
    ) {
      segmentIndex += 1
    }

    const before = validPoints.value[Math.max(segmentIndex - 1, 0)]
    const after = validPoints.value[segmentIndex]
    if (!before || !after || after.distanceM < targetDistanceM) continue

    markers.push({
      kilometer,
      ...interpolatePoint(before, after, targetDistanceM),
    })
  }

  return markers
})

function createEndpointMarker(label, tone, position) {
  return new AMapApi.Marker({
    position,
    content: `<div class="route-endpoint route-endpoint-${tone}"><span>${label}</span></div>`,
    offset: new AMapApi.Pixel(-14, -14),
    zIndex: 120,
  })
}

function createKilometerMarker(marker) {
  const label = String(marker.kilometer)
  const size = label.length >= 3 ? 18 : 14
  return new AMapApi.Marker({
    position: [marker.longitude, marker.latitude],
    content: `<div class="route-km-marker" style="width:${size}px;height:${size}px"><span>${label}</span></div>`,
    offset: new AMapApi.Pixel(-size / 2, -size / 2),
    title: `${label} km`,
    zIndex: 140,
  })
}

function ensureMap() {
  if (!mapRef.value || map || !AMapApi) return

  map = new AMapApi.Map(mapRef.value, {
    viewMode: '2D',
    zoom: 13,
    resizeEnable: true,
    dragEnable: true,
    zoomEnable: true,
    mapStyle: 'amap://styles/normal',
  })
  map.addControl(new AMapApi.Scale())
  map.addControl(new AMapApi.ToolBar({ position: 'LT' }))
}

function waitForMapComplete() {
  if (!map || !AMapApi) return Promise.resolve()
  return new Promise((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    map.on('complete', finish)
    window.setTimeout(finish, 1200)
  })
}

function clearLayers() {
  const overlays = [...routeOverlays, ...markerOverlays]
  if (map && overlays.length) {
    map.remove(overlays)
  }
  routeOverlays = []
  markerOverlays = []
}

function destroyMap() {
  clearLayers()
  map?.destroy()
  map = null
}

function renderRoute() {
  if (!map || !AMapApi || !amapPath.value.length) return

  clearLayers()

  routeOverlays = groupedRouteSegments.value.map((segment) =>
    new AMapApi.Polyline({
      path: segment.path,
      strokeColor: segment.color,
      strokeWeight: 5,
      strokeOpacity: 0.95,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 80,
    }),
  )

  const markers = []
  const start = amapPath.value[0]
  const end = amapPath.value.at(-1)
  markers.push(createEndpointMarker('起', 'start', start))
  for (const marker of kilometerMarkers.value) {
    markers.push(createKilometerMarker(marker))
  }
  if (end && (end[0] !== start[0] || end[1] !== start[1])) {
    markers.push(createEndpointMarker('终', 'finish', end))
  }
  markerOverlays = markers

  const overlays = [...routeOverlays, ...markerOverlays]
  if (overlays.length) {
    map.add(overlays)
    map.setFitView(overlays, false, [28, 28, 28, 28], 17)
  }
  map.resize()
}

async function refreshMap() {
  const token = ++refreshToken
  mapError.value = ''

  if (!validPoints.value.length) {
    destroyMap()
    return
  }

  await nextTick()
  if (token !== refreshToken) return

  try {
    AMapApi = await loadAmap()
    if (token !== refreshToken) return
    ensureMap()
    await waitForMapComplete()
    if (token !== refreshToken) return
    renderRoute()
  } catch (err) {
    destroyMap()
    mapError.value = err instanceof Error ? err.message : '高德地图 SDK 加载失败。'
  }
}

onMounted(refreshMap)

watch(() => props.points, refreshMap, { deep: true })

onBeforeUnmount(() => {
  refreshToken += 1
  destroyMap()
})
</script>

