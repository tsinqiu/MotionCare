import { collectionPayload, getEnvelope, mutateEnvelope } from '@/services/api'
import { apiClient, unwrapApiResponse } from '@/services/http'

function resolveMediaUrl(value) {
  if (!value || typeof value !== 'string') return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) return value
  if (!value.startsWith('/')) return value
  const baseUrl = apiClient.defaults.baseURL || ''
  if (baseUrl.startsWith('/')) return value
  try {
    return `${new URL(baseUrl).origin}${value}`
  } catch {
    return value
  }
}

export function normalizePost(row = {}) {
  return {
    ...row,
    id: row.id,
    username: row.username || row.user || 'User',
    userId: row.userId || row.user_id || null,
    userBio: row.userBio || row.user_bio || row.bio || '',
    content: row.content || row.text || '',
    activityType: row.activityType || row.activity_type || row.type || '',
    activityId: row.activityId || row.activity_id || null,
    activityName: row.activityName || row.activity_name || '',
    activityLocalStartTime: row.activityLocalStartTime || row.activity_local_start_time || '',
    visibility: row.visibility || 'public',
    imageUrl: resolveMediaUrl(row.imageUrl || row.image_url || row.imagePath || row.image_path || ''),
    imageOriginalName: row.imageOriginalName || row.image_original_name || '',
    imageSizeBytes: row.imageSizeBytes ?? row.image_size_bytes ?? null,
    likeCount: Number(row.likeCount ?? row.likes ?? 0),
    commentCount: Number(row.commentCount ?? 0),
    shareCount: Number(row.shareCount ?? 0),
    likedByMe: Boolean(row.likedByMe),
    followedByMe: Boolean(row.followedByMe),
    createdAt: row.createdAt || row.created_at || '',
  }
}

function normalizeComment(row = {}) {
  return {
    ...row,
    id: row.id,
    username: row.username || row.user || 'User',
    content: row.content || '',
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

export async function getCommunityPosts(params = {}) {
  const envelope = await getEnvelope('/community/posts', { params })
  return normalizePaged(envelope.data, normalizePost)
}

export async function createCommunityPost(payload) {
  const formData = new FormData()
  formData.append('content', payload.content)
  formData.append('visibility', payload.visibility || 'public')
  if (payload.activityId) {
    formData.append('activityId', payload.activityId)
  }
  if (payload.image) {
    formData.append('image', payload.image)
  }

  const response = await apiClient.post('/community/posts', formData)
  return normalizePost(unwrapApiResponse(response.data).data)
}

export async function getPostComments(postId, params = {}) {
  const envelope = await getEnvelope(`/community/posts/${postId}/comments`, { params })
  return normalizePaged(envelope.data, normalizeComment)
}

export async function createPostComment(postId, payload) {
  const envelope = await mutateEnvelope('post', `/community/posts/${postId}/comments`, payload, { normalizer: normalizeComment })
  return envelope.data
}

export async function likePost(postId) {
  const envelope = await mutateEnvelope('post', `/community/posts/${postId}/like`, {})
  return envelope.data
}

export async function unlikePost(postId) {
  const envelope = await mutateEnvelope('delete', `/community/posts/${postId}/like`)
  return envelope.data
}

export async function sharePost(postId, channel = 'copy_link') {
  const envelope = await mutateEnvelope('post', `/community/posts/${postId}/share`, { channel })
  return envelope.data
}

export async function followUser(userId) {
  const envelope = await mutateEnvelope('post', `/community/users/${userId}/follow`, {})
  return envelope.data
}

export async function unfollowUser(userId) {
  const envelope = await mutateEnvelope('delete', `/community/users/${userId}/follow`)
  return envelope.data
}
