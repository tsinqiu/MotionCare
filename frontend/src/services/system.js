import { apiClient, unwrapApiResponse } from '@/services/http'

export async function getServerHealth() {
  const response = await apiClient.get('/health')
  return unwrapApiResponse(response.data).data
}

export async function getPublicConfig() {
  const response = await apiClient.get('/system/public-config')
  return unwrapApiResponse(response.data).data || {}
}
