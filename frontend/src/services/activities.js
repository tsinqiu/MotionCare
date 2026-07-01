import { cleanParams, getEnvelope, mutateEnvelope } from '@/services/api'
import { apiClient, unwrapApiResponse } from '@/services/http'

const ACTIVITY_TYPE_LABELS = {
  running: '跑步',
  street_running: '跑步',
  track_running: '田径跑步',
  treadmill_running: '跑步',
  cycling: '骑行',
  road_biking: '骑行',
  indoor_cycling: '骑行',
  swimming: '游泳',
  pool_swimming: '游泳',
  open_water_swimming: '游泳',
  strength_training: '力量训练',
  floor_climbing: '爬楼',
  walking: '步行',
  other: '其他',
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isNaN(number) ? null : number
}

function kmToMeters(value) {
  const number = toNumber(value)
  return number === null ? null : number * 1000
}

function paceToSpeedMps(value) {
  const pace = toNumber(value)
  return pace && Number.isFinite(pace) && pace > 0 ? 1000 / pace : null
}

function displayActivityType(value) {
  return ACTIVITY_TYPE_LABELS[value] || value || '--'
}

export function normalizeActivity(row = {}) {
  const rawType = firstDefined(row.raw_activity_type, row.activity_type, row.activityType, row.sportType)
  const distanceM = firstDefined(
    row.total_distance_m,
    row.distance_m,
    row.distanceM,
    kmToMeters(row.jsonDistanceKm),
    kmToMeters(row.fitDistanceKm),
    kmToMeters(row.distanceKm),
  )
  const durationS = firstDefined(
    row.total_timer_time_s,
    row.duration_s,
    row.durationS,
    row.fitTimerTimeS,
    row.movingDurationS,
    row.total_moving_time_s,
  )
  const avgSpeedMps = firstDefined(
    row.avg_speed_mps,
    row.avgSpeedMps,
    paceToSpeedMps(row.avgPaceSecPerKm),
  )

  return {
    ...row,
    id: toNumber(row.id),
    activity_key: firstDefined(row.activity_key, row.activityKey, row.garminActivityId, row.activityName, `ACT-${row.id || 'unknown'}`),
    activity_name: firstDefined(row.activity_name, row.activityName, displayActivityType(rawType)),
    activity_type: displayActivityType(rawType),
    raw_activity_type: rawType,
    start_time_utc: firstDefined(row.start_time_utc, row.startTimeUtc),
    local_start_time: firstDefined(row.local_start_time, row.localStartTime),
    location_name: firstDefined(row.location_name, row.locationName),
    ownerUserId: toNumber(firstDefined(row.owner_user_id, row.ownerUserId)),
    owner_username: firstDefined(row.owner_username, row.ownerUsername),
    data_source: firstDefined(row.data_source, row.dataSource, row.is_manual ? 'manual_upload' : 'garmin_import'),
    is_manual: Boolean(firstDefined(row.is_manual, row.isManual, false)),
    total_distance_m: toNumber(distanceM),
    total_timer_time_s: toNumber(durationS),
    total_moving_time_s: toNumber(firstDefined(row.total_moving_time_s, row.movingDurationS, row.durationS)),
    total_elapsed_time_s: toNumber(firstDefined(row.total_elapsed_time_s, row.elapsedDurationS, row.fitElapsedTimeS)),
    total_calories: toNumber(firstDefined(row.total_calories, row.calories)),
    avg_speed_mps: toNumber(avgSpeedMps),
    max_speed_mps: toNumber(firstDefined(row.max_speed_mps, row.maxSpeedMps)),
    avg_heart_rate_bpm: toNumber(firstDefined(row.avg_heart_rate_bpm, row.avgHeartRateBpm)),
    max_heart_rate_bpm: toNumber(firstDefined(row.max_heart_rate_bpm, row.maxHeartRateBpm)),
    avg_cadence: toNumber(firstDefined(row.avg_cadence, row.avgCadenceSpm, row.fitSingleLegCadence)),
    max_cadence: toNumber(firstDefined(row.max_cadence, row.maxCadenceSpm)),
    avg_power_w: toNumber(firstDefined(row.avg_power_w, row.avgPowerW, row.normalizedPowerW)),
    max_power_w: toNumber(firstDefined(row.max_power_w, row.maxPowerW)),
    normalized_power_w: toNumber(firstDefined(row.normalized_power_w, row.normalizedPowerW)),
    total_ascent_m: toNumber(firstDefined(row.total_ascent_m, row.elevationGainM)),
    total_descent_m: toNumber(firstDefined(row.total_descent_m, row.elevationLossM)),
    activity_training_load: toNumber(firstDefined(row.activity_training_load, row.activityTrainingLoad)),
    aerobic_training_effect_message: firstDefined(row.aerobic_training_effect_message, row.aerobicTrainingEffectMessage),
    anaerobic_training_effect_message: firstDefined(row.anaerobic_training_effect_message, row.anaerobicTrainingEffectMessage),
    avg_pace_sec_per_km: toNumber(firstDefined(row.avg_pace_sec_per_km, row.avgPaceSecPerKm)),
    vo2max: toNumber(firstDefined(row.vo2max, row.vo2Max)),
    perceived_effort: toNumber(firstDefined(row.perceived_effort, row.perceivedEffort)),
    photo_path: firstDefined(row.photo_path, row.photoPath),
    shoe_id: toNumber(firstDefined(row.shoe_id, row.shoeId)),
    shoe_name: firstDefined(row.shoe_name, row.shoeName),
    weather_condition: firstDefined(row.weather_condition, row.weatherCondition),
    temperature_c: toNumber(firstDefined(row.temperature_c, row.temperatureC)),
    humidity_percent: toNumber(firstDefined(row.humidity_percent, row.humidityPercent)),
    feels_like_c: toNumber(firstDefined(row.feels_like_c, row.feelsLikeC)),
    weather_source: firstDefined(row.weather_source, row.weatherSource),
    weather_updated_at: firstDefined(row.weather_updated_at, row.weatherUpdatedAt),
  }
}

export function normalizeTrackPoint(row = {}) {
  return {
    ...row,
    sample_index: firstDefined(row.sample_index, row.sampleIndex),
    sample_time_utc: String(firstDefined(row.sample_time_utc, row.sampleTimeUtc, '')),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    altitude_m: toNumber(firstDefined(row.altitude_m, row.altitudeM)),
    distance_m: toNumber(firstDefined(row.distance_m, row.distanceM)),
    speed_mps: toNumber(firstDefined(row.speed_mps, row.speedMps)),
    heart_rate_bpm: toNumber(firstDefined(row.heart_rate_bpm, row.heartRateBpm)),
    cadence: toNumber(firstDefined(row.cadence, row.fitSingleLegCadence)),
    power_w: toNumber(firstDefined(row.power_w, row.powerW)),
    vertical_oscillation_mm: toNumber(firstDefined(row.vertical_oscillation_mm, row.verticalOscillationMm)),
  }
}

export function normalizeLap(row = {}) {
  return {
    ...row,
    lap_index: firstDefined(row.lap_index, row.lapIndex),
    start_time_utc: firstDefined(row.start_time_utc, row.startTimeUtc),
    total_distance_m: toNumber(firstDefined(row.total_distance_m, row.totalDistanceM)),
    total_timer_time_s: toNumber(firstDefined(row.total_timer_time_s, row.totalTimerTimeS)),
    avg_speed_mps: toNumber(firstDefined(row.avg_speed_mps, row.avgSpeedMps)),
    avg_heart_rate_bpm: toNumber(firstDefined(row.avg_heart_rate_bpm, row.avgHeartRateBpm)),
    avg_power_w: toNumber(firstDefined(row.avg_power_w, row.avgPowerW)),
  }
}

export function normalizeActivityTypeStat(row = {}) {
  return {
    ...row,
    activity_type: displayActivityType(firstDefined(row.activity_type, row.activityType)),
    raw_activity_type: firstDefined(row.raw_activity_type, row.activity_type, row.activityType),
    activity_count: toNumber(firstDefined(row.activity_count, row.activityCount)),
    total_distance_m: toNumber(firstDefined(row.total_distance_m, row.totalDistanceM, kmToMeters(row.totalDistanceKm))),
    total_timer_time_s: toNumber(firstDefined(row.total_timer_time_s, row.totalDurationS)),
    avg_heart_rate_bpm: toNumber(firstDefined(row.avg_heart_rate_bpm, row.avgHeartRateBpm)),
    total_training_load: toNumber(firstDefined(row.total_training_load, row.totalTrainingLoad)),
    percentage: toNumber(row.percentage),
  }
}

export function normalizeDashboardOverview(row = {}) {
  return {
    ...row,
    recentActivities: (row.recentActivities || []).map(normalizeActivity),
    monthlySummary: row.monthlySummary || {},
    yearlySummary: row.yearlySummary || {},
    trainingLoad: row.trainingLoad || [],
    personalBests: row.personalBests || { running: [], cycling: [], swimming: [], overall: [] },
  }
}

async function getPagedTrackData(id, path, normalizer, params = {}, maxPageSize = 5000) {
  const pageSize = Math.min(Number(params.limit) || maxPageSize, maxPageSize)
  let offset = Number(params.offset) || 0
  const rows = []

  while (true) {
    const envelope = await getEnvelope(`/activities/${id}/${path}`, {
      params: cleanParams({ ...params, limit: pageSize, offset }),
      normalizer,
    })
    const page = envelope.data || []
    rows.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return rows
}

export async function getActivityPage(params = {}) {
  const query = {
    page: 1,
    page_size: 50,
    sort_by: 'local_start_time',
    sort_order: 'desc',
    ...params,
  }
  const envelope = await getEnvelope('/activities', {
    params: cleanParams(query),
    normalizer: normalizeActivity,
  })
  return {
    data: envelope.data || [],
    meta: envelope.meta || {},
  }
}

export async function getActivities(params = {}) {
  const envelope = await getActivityPage(params)
  return envelope.data
}

export async function getActivity(id) {
  const envelope = await getEnvelope(`/activities/${id}`, { normalizer: normalizeActivity })
  return envelope.data || null
}

export function getTrackPoints(id, params = {}) {
  return getPagedTrackData(id, 'track-points', normalizeTrackPoint, params, 5000)
}

export function getHeartRateSeries(id, params = {}) {
  return getPagedTrackData(id, 'heart-rate', normalizeTrackPoint, params, 10000)
}

export function getSpeedSeries(id, params = {}) {
  return getPagedTrackData(id, 'speed', normalizeTrackPoint, params, 10000)
}

export async function getLaps(id) {
  const envelope = await getEnvelope(`/activities/${id}/laps`, { normalizer: normalizeLap })
  return envelope.data || []
}

export async function getActivityZones(id) {
  const envelope = await getEnvelope(`/activities/${id}/zones`)
  return envelope.data || []
}

export async function createManualActivity(payload) {
  const envelope = await mutateEnvelope('post', '/manual-activities', payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function updateManualActivity(id, payload) {
  const envelope = await mutateEnvelope('put', `/manual-activities/${id}`, payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function deleteManualActivity(id) {
  const envelope = await mutateEnvelope('delete', `/manual-activities/${id}`)
  return envelope.data
}

export async function updateActivityMeta(id, payload) {
  const envelope = await mutateEnvelope('patch', `/activities/${id}`, payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function uploadActivityPhoto(id, file) {
  const form = new FormData()
  form.append('photo', file)
  const response = await apiClient.post(`/activities/${id}/photo`, form)
  const envelope = unwrapApiResponse(response.data)
  return normalizeActivity(envelope.data)
}

export async function updateActivityWeather(id, payload) {
  const envelope = await mutateEnvelope('patch', `/activities/${id}/weather`, payload, { normalizer: normalizeActivity })
  return envelope.data
}

export async function fetchActivityWeather(id) {
  const envelope = await mutateEnvelope('post', `/activities/${id}/weather/fetch`, {}, { normalizer: normalizeActivity })
  return envelope.data
}

export async function predictRunningLoad(payload) {
  const envelope = await mutateEnvelope('post', '/ml/running-prediction', payload)
  return envelope.data
}
