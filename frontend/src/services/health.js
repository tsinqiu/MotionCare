import { getEnvelope } from '@/services/api'

export async function getHealthTrends(metric = 'hrv', range = '3m') {
  const envelope = await getEnvelope('/health/trends', {
    params: { metric, range },
  })
  return envelope.data || []
}

export async function getHealthSamples(type, params = {}) {
  const envelope = await getEnvelope(`/health/samples/${type}`, { params })
  return envelope.data || []
}

export async function getLatestTrainingStatus() {
  const envelope = await getEnvelope('/health/training-status/latest')
  return envelope.data || null
}

export async function getLatestRacePredictions() {
  const envelope = await getEnvelope('/health/race-predictions/latest')
  return envelope.data || null
}

export async function getLatestLactateThreshold() {
  const envelope = await getEnvelope('/health/lactate-threshold/latest')
  return envelope.data || null
}

export async function getLatestCyclingFtp() {
  const envelope = await getEnvelope('/health/cycling-ftp/latest')
  return envelope.data || null
}
