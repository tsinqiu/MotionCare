import { getEnvelope, mutateEnvelope } from '@/services/api'

const DEFAULT_SETTINGS = {
  distanceUnit: 'km',
  weightUnit: 'kg',
  temperatureUnit: 'c',
  paceUnit: 'min_per_km',
  defaultPrivacy: 'private',
  hideMapEndpoints: true,
  healthSync: false,
}

export function normalizeSettings(row = {}) {
  const next = { ...DEFAULT_SETTINGS, ...row }
  return {
    ...next,
    hideMapEndpoints: Boolean(next.hideMapEndpoints),
    healthSync: Boolean(next.healthSync),
  }
}

export async function getSettings() {
  const envelope = await getEnvelope('/settings', { normalizer: normalizeSettings })
  return envelope.data || { ...DEFAULT_SETTINGS }
}

export async function updateSettings(payload) {
  const normalized = normalizeSettings(payload)
  const envelope = await mutateEnvelope('put', '/settings', normalized, { normalizer: normalizeSettings })
  return envelope.data || normalized
}
