import { apiClient, unwrapApiResponse } from '@/services/http'

export async function getServerHealth() {
  const response = await apiClient.get('/health')
  return unwrapApiResponse(response.data).data
}
