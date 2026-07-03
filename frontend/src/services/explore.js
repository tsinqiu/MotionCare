import { collectionPayload, getEnvelope } from '@/services/api'
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

function normalizeArticle(row = {}) {
  const coverUrl = row.coverUrl || row.cover_url || ''
  return {
    ...row,
    id: row.id || row.slug || row.title,
    title: row.title || '',
    type: row.type || row.category || 'article',
    category: row.category || row.type || 'article',
    level: row.level || row.difficulty || 'general',
    readTime: row.readTime || row.read_time || '',
    summary: row.summary || row.excerpt || row.description || '',
    content: row.content || '',
    coverUrl: resolveMediaUrl(coverUrl),
    imageUrl: resolveMediaUrl(row.imageUrl || row.image_url || coverUrl),
    username: row.username || '',
    userBio: row.userBio || row.user_bio || row.bio || '',
    videoUrl: resolveMediaUrl(row.videoUrl || row.video_url || ''),
    videoOriginalName: row.videoOriginalName || row.video_original_name || '',
    videoSizeBytes: row.videoSizeBytes ?? row.video_size_bytes ?? null,
    publishedAt: row.publishedAt || row.published_at || '',
  }
}

function normalizePaged(payload) {
  const page = collectionPayload(payload)
  return {
    ...page,
    items: (page.items || []).map(normalizeArticle),
  }
}

export async function getExploreArticles(params = {}) {
  const envelope = await getEnvelope('/explore/articles', { params })
  return normalizePaged(envelope.data)
}

export async function getExploreArticle(id) {
  const envelope = await getEnvelope(`/explore/articles/${id}`, { normalizer: normalizeArticle })
  return envelope.data || null
}

export async function getExploreRecommendations(params = {}) {
  const envelope = await getEnvelope('/explore/recommendations', { params })
  return normalizePaged(envelope.data)
}

export async function createExploreArticle(payload) {
  const formData = new FormData()
  formData.append('type', payload.type)
  formData.append('title', payload.title)
  formData.append('summary', payload.summary || '')
  formData.append('content', payload.content || '')
  if (payload.video) {
    formData.append('video', payload.video)
  }
  if (payload.image) {
    formData.append('image', payload.image)
  }

  const response = await apiClient.post('/explore/articles', formData)
  return normalizeArticle(unwrapApiResponse(response.data).data)
}
