import { normalizeActivity, normalizeActivityTypeStat } from '@/services/activities'
import { getEnvelope } from '@/services/api'

function normalizeTrendRow(row = {}) {
  return {
    ...row,
    activities: (row.activities || []).map(normalizeActivity),
  }
}

function normalizeCalendarDay(day = {}) {
  return {
    ...day,
    activities: (day.activities || []).map(normalizeActivity),
  }
}

function normalizeCalendar(payload = {}) {
  return {
    ...payload,
    days: (payload.days || []).map(normalizeCalendarDay),
  }
}

export async function getSummaryStats(params = {}) {
  const envelope = await getEnvelope('/stats/summary', { params })
  return envelope.data || {}
}

export async function getActivityTypeStats(params = {}) {
  const envelope = await getEnvelope('/stats/activity-types', {
    params,
    normalizer: normalizeActivityTypeStat,
  })
  return envelope.data || []
}

export async function getTimelineStats(params = { group_by: 'month' }) {
  const envelope = await getEnvelope('/stats/timeline', { params })
  return envelope.data || []
}

export async function getMetricTrend(params = { metric: 'avg_heart_rate_bpm', range: '3m' }) {
  const envelope = await getEnvelope('/stats/metric-trend', {
    params,
    normalizer: normalizeTrendRow,
  })
  return envelope.data || []
}

export async function getCalendarStats(params = {}) {
  const envelope = await getEnvelope('/stats/calendar', {
    params,
    normalizer: normalizeCalendar,
  })
  return envelope.data || { days: [] }
}

export async function getPersonalBests(params = {}) {
  const envelope = await getEnvelope('/stats/personal-bests', { params })
  return envelope.data || { steps: [], running: [], cycling: [], swimming: [], overall: [] }
}
