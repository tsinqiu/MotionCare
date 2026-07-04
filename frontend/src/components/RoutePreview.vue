<template>
  <section class="panel route-panel">
    <div class="panel-heading">
      <div>
        <p class="overline">TrackPoints</p>
        <h2>地图轨迹预览</h2>
      </div>
      <span>{{ validPoints.length }} 点</span>
    </div>

    <div v-if="validPoints.length" ref="mapRef" class="route-map" aria-label="轨迹地图预览"></div>
    <div v-else class="route-map route-map-empty" aria-label="轨迹地图预览为空">
      <strong>暂无可用地图轨迹</strong>
      <span>当前运动没有有效经纬度采样点。</span>
    </div>
  </section>
</template>

<script setup>
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  points: {
    type: Array,
    default: () => [],
  },
})

const mapRef = ref(null)
let map = null
let tileLayer = null
let routeLayer = null
let markerLayer = null

const EARTH_RADIUS_M = 6371000
const FALLBACK_ROUTE_COLOR = '#21d47b'
const MAP_PROVIDER = import.meta.env.VITE_MAP_PROVIDER || 'amap'
const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL
const SPEED_COLOR_STOPS = [
  { at: 0, color: [37, 99, 235] },
  { at: 0.25, color: [6, 182, 212] },
  { at: 0.5, color: [34, 197, 94] },
  { at: 0.75, color: [245, 158, 11] },
  { at: 1, color: [239, 68, 68] },
]

const TILE_CONFIGS = {
  amap: {
    url: MAP_TILE_URL || 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    options: {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 19,
      attribution: '&copy; AMap',
    },
  },
  osm: {
    url: MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
}

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
  return colorFromStops(ratio)
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
  if (MAP_PROVIDER !== 'amap' || !isInChina(latitude, longitude)) {
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

const latLngs = computed(() => validPoints.value.map((point) => [point.displayLatitude, point.displayLongitude]))

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
      latLngs: [
        [previous.displayLatitude, previous.displayLongitude],
        [point.displayLatitude, point.displayLongitude],
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

function createEndpointIcon(label, tone) {
  return L.divIcon({
    className: `route-endpoint route-endpoint-${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function createKilometerIcon(kilometer) {
  const label = String(kilometer)
  const size = label.length >= 3 ? 18 : 14
  return L.divIcon({
    className: 'route-km-marker',
    html: `<span>${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function ensureMap() {
  if (!mapRef.value || map) return

  map = L.map(mapRef.value, {
    attributionControl: true,
    scrollWheelZoom: true,
    zoomControl: true,
  })

  const tileConfig = TILE_CONFIGS[MAP_PROVIDER] || TILE_CONFIGS.osm
  tileLayer = L.tileLayer(tileConfig.url, tileConfig.options).addTo(map)
}

function clearLayers() {
  if (routeLayer) {
    routeLayer.remove()
    routeLayer = null
  }
  if (markerLayer) {
    markerLayer.remove()
    markerLayer = null
  }
}

function destroyMap() {
  clearLayers()
  tileLayer?.remove()
  tileLayer = null
  map?.remove()
  map = null
}

function renderRoute() {
  if (!map || !latLngs.value.length) return

  clearLayers()

  routeLayer = L.layerGroup(
    routeSegments.value.map((segment) =>
      L.polyline(segment.latLngs, {
        color: segment.color,
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }),
    ),
  ).addTo(map)

  const markers = []
  const start = latLngs.value[0]
  const end = latLngs.value.at(-1)
  markers.push(L.marker(start, { icon: createEndpointIcon('起', 'start'), keyboard: false }))
  for (const marker of kilometerMarkers.value) {
    markers.push(L.marker(
      [marker.latitude, marker.longitude],
      {
        icon: createKilometerIcon(marker.kilometer),
        keyboard: false,
        title: `${marker.kilometer} km`,
        zIndexOffset: 300,
      },
    ))
  }
  if (end && (end[0] !== start[0] || end[1] !== start[1])) {
    markers.push(L.marker(end, { icon: createEndpointIcon('终', 'finish'), keyboard: false }))
  }
  markerLayer = L.layerGroup(markers).addTo(map)

  const bounds = L.latLngBounds(latLngs.value)
  map.fitBounds(bounds, {
    padding: [28, 28],
    maxZoom: 17,
  })
  map.invalidateSize()
}

async function refreshMap() {
  if (!validPoints.value.length) {
    destroyMap()
    return
  }

  await nextTick()
  ensureMap()
  renderRoute()
}

onMounted(refreshMap)

watch(() => props.points, refreshMap, { deep: true })

onBeforeUnmount(() => {
  destroyMap()
})
</script>
