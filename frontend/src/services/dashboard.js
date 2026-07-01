import { normalizeDashboardOverview } from '@/services/activities'
import { getEnvelope } from '@/services/api'

export async function getDashboardOverview(params = {}) {
  const envelope = await getEnvelope('/dashboard/overview', {
    params,
    normalizer: normalizeDashboardOverview,
  })
  return envelope.data || {
    recentActivities: [],
    monthlySummary: {},
    yearlySummary: {},
    trainingLoad: [],
    personalBests: {},
  }
}

export async function getTodayHealth(params = {}) {
  const envelope = await getEnvelope('/dashboard/health', { params })
  return envelope.data || {}
}
