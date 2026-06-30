import { normalizeActivity } from '@/services/activities'
import { getEnvelope } from '@/services/api'

function normalizeLoadRow(row = {}) {
  return {
    ...row,
    activities: (row.activities || []).map(normalizeActivity),
  }
}

export async function getLoadBalance(params = {}) {
  const envelope = await getEnvelope('/training/load-balance', {
    params,
    normalizer: normalizeLoadRow,
  })
  return envelope.data || []
}

export async function getGarminImportSummary() {
  const envelope = await getEnvelope('/training/garmin-import-summary')
  return envelope.data || null
}
