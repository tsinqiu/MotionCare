import { collectionPayload, getEnvelope, mutateEnvelope } from '@/services/api'
import { apiClient, unwrapApiResponse } from '@/services/http'

const PROVIDER_NAMES = {
  garmin: 'Garmin Connect',
  strava: 'Strava',
  coros: 'COROS',
  apple_health: 'Apple Health',
}

function normalizeStatus(status) {
  return {
    已连接: 'connected',
    未连接: 'not_connected',
    待授权: 'needs_auth',
    异常: 'error',
  }[status] || status
}

export function normalizeProvider(row = {}) {
  const provider = row.provider || String(row.name || '').toLowerCase() || 'garmin'
  return {
    ...row,
    provider,
    name: row.name || PROVIDER_NAMES[provider] || provider,
    status: normalizeStatus(row.status) || 'not_connected',
    autoSync: Boolean(row.autoSync ?? row.auto),
    syncDirection: row.syncDirection || row.direction || 'import',
    lastSyncAt: row.lastSyncAt || row.lastSync || null,
    adapterStatus: row.adapterStatus || 'not_configured',
    authorizationUrl: row.authorizationUrl || '',
  }
}

export function normalizeGarminAccount(row = {}) {
  const status = row.status || (row.exists ? 'connected' : 'not_connected')
  return {
    provider: 'garmin',
    exists: Boolean(row.exists ?? status === 'connected'),
    status,
    email: row.email || null,
    isCn: Boolean(row.isCn),
    lastSyncAt: row.lastSyncAt || row.last_sync_at || null,
    connectedAt: row.connectedAt || row.connected_at || null,
  }
}

function normalizeJob(row = {}) {
  return {
    ...row,
    id: row.id || row.jobId,
    provider: row.provider || 'garmin',
    jobType: row.jobType || row.job_type || 'manual_sync',
    status: row.status || 'queued',
    requestedAt: row.requestedAt || row.requested_at || row.createdAt || row.created_at || '',
    startedAt: row.startedAt || row.started_at || null,
    finishedAt: row.finishedAt || row.finished_at || null,
    activityCount: Number(row.activityCount ?? row.activity_count ?? 0),
    errorMessage: row.errorMessage || row.error_message || '',
  }
}

function normalizeLog(row = {}) {
  return {
    ...row,
    id: row.id || row.logId,
    provider: row.provider || 'garmin',
    level: row.level || row.status || 'info',
    message: row.message || row.detail || '',
    createdAt: row.createdAt || row.created_at || '',
  }
}

function normalizePaged(payload, normalizer) {
  const page = collectionPayload(payload)
  return {
    ...page,
    items: (page.items || []).map(normalizer),
  }
}

export async function getSyncProviders() {
  const envelope = await getEnvelope('/sync/providers')
  return (envelope.data || []).map(normalizeProvider)
}

export async function getGarminAccount() {
  const envelope = await getEnvelope('/sync/providers/garmin/account', {
    normalizer: normalizeGarminAccount,
  })
  return envelope.data
}

export async function updateProviderSettings(provider, payload) {
  const envelope = await mutateEnvelope('put', `/sync/providers/${provider}/settings`, payload, {
    normalizer: normalizeProvider,
  })
  return envelope.data
}

export async function authorizeProvider(provider) {
  const envelope = await mutateEnvelope('post', `/sync/providers/${provider}/authorize`, {})
  return envelope.data
}

export async function authorizeGarminAccount(payload) {
  const body = {
    email: payload.email,
    password: payload.password,
    mfaCode: payload.mfaCode || undefined,
    isCn: Boolean(payload.isCn),
  }
  const response = await apiClient.post('/sync/providers/garmin/authorize', body, {
    timeout: 120000,
  })
  const envelope = unwrapApiResponse(response.data)
  return normalizeGarminAccount(envelope.data)
}

export async function disconnectProvider(provider) {
  const envelope = await mutateEnvelope('post', `/sync/providers/${provider}/disconnect`, {})
  return envelope.data
}

export async function disconnectGarminAccount() {
  const envelope = await mutateEnvelope('post', '/sync/providers/garmin/disconnect', {})
  return envelope.data
}

export async function createSyncJob(payload) {
  const response = await apiClient.post('/sync/jobs', { jobType: 'manual_sync', ...payload }, {
    timeout: 600000,
  })
  const envelope = unwrapApiResponse(response.data)
  return normalizeJob(envelope.data)
}

export async function getSyncJobs(params = {}) {
  const envelope = await getEnvelope('/sync/jobs', { params })
  return normalizePaged(envelope.data, normalizeJob)
}

export async function getSyncLogs(params = {}) {
  const envelope = await getEnvelope('/sync/logs', { params })
  return normalizePaged(envelope.data, normalizeLog)
}
