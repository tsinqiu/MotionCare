import { getEnvelope, mutateEnvelope } from '@/services/api'

export async function getAiHealth() {
  const envelope = await getEnvelope('/ai/health')
  return envelope.data
}

export function getDailyBrief() {
  return getEnvelope('/ai/daily-brief')
}

export function sendAiMessage(message) {
  return mutateEnvelope('post', '/ai/chat', { message })
}

export function analyzeActivity(activityId) {
  return mutateEnvelope('post', '/ai/activity-analysis', { activityId })
}

export function sendAiFeedback(payload) {
  return mutateEnvelope('post', '/ai/feedback', payload)
}

export function sendMorningReadiness(payload) {
  return mutateEnvelope('post', '/ai/morning-readiness', payload)
}
