import { mutateEnvelope } from '@/services/api'
import { normalizeActivity } from '@/services/activities'

function normalizeWorkout(row = {}) {
  return {
    ...row,
    id: row.id || row.workoutId,
    status: row.status || 'active',
    activityType: row.activityType || row.activity_type,
    startedAt: row.startedAt || row.started_at,
  }
}

function normalizeFinishResult(row = {}) {
  return {
    ...row,
    activity: row.activity ? normalizeActivity(row.activity) : row.activity,
  }
}

export async function createWorkout(payload) {
  const envelope = await mutateEnvelope('post', '/workouts', payload, { normalizer: normalizeWorkout })
  return envelope.data
}

export async function appendWorkoutTrackPoints(id, trackPoints) {
  const envelope = await mutateEnvelope('post', `/workouts/${id}/track-points`, { trackPoints })
  return envelope.data
}

export async function pauseWorkout(id) {
  const envelope = await mutateEnvelope('post', `/workouts/${id}/pause`, {}, { normalizer: normalizeWorkout })
  return envelope.data
}

export async function resumeWorkout(id) {
  const envelope = await mutateEnvelope('post', `/workouts/${id}/resume`, {}, { normalizer: normalizeWorkout })
  return envelope.data
}

export async function finishWorkout(id, payload) {
  const envelope = await mutateEnvelope('post', `/workouts/${id}/finish`, payload, { normalizer: normalizeFinishResult })
  return envelope.data
}

export async function cancelWorkout(id) {
  const envelope = await mutateEnvelope('post', `/workouts/${id}/cancel`, {})
  return envelope.data
}
