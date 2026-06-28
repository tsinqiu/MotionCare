import {
  apiClient,
  clearAuthToken,
  getAuthToken,
  saveAuthToken,
  unwrapApiResponse,
} from '@/services/http'

export async function login(payload) {
  const response = await apiClient.post('/auth/login', payload)
  return unwrapApiResponse(response.data).data
}

export async function register(payload) {
  const response = await apiClient.post('/auth/register', payload)
  return unwrapApiResponse(response.data).data
}

export async function getCurrentUser() {
  if (!getAuthToken()) return null

  const response = await apiClient.get('/auth/me')
  const data = unwrapApiResponse(response.data).data
  return data?.user || data || null
}

export async function getAdminUsers() {
  const response = await apiClient.get('/admin/users')
  return unwrapApiResponse(response.data).data || []
}

export async function createAdminUser(payload) {
  const response = await apiClient.post('/admin/users', payload)
  return unwrapApiResponse(response.data).data
}

export async function disableAdminUser(id) {
  const response = await apiClient.delete(`/admin/users/${id}`)
  return unwrapApiResponse(response.data).data
}

export async function updateCurrentUserProfile(payload) {
  const response = await apiClient.put('/auth/me/profile', payload)
  const data = unwrapApiResponse(response.data).data
  return data?.user || data || null
}

export function persistAuthToken(token) {
  saveAuthToken(token)
}

export function clearAuthSession() {
  clearAuthToken()
}
