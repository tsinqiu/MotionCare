import axios from 'axios'
import { Capacitor } from '@capacitor/core'

const TOKEN_STORAGE_KEY = 'motion-analysis-token'
const LOCAL_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8089/api' : '/api'
const DEFAULT_NATIVE_API_BASE_URL = 'http://47.112.190.14/api'
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000)
let authFailureHandler = null

function absoluteApiBaseUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : ''
}

export function resolveApiBaseUrl() {
  if (Capacitor.isNativePlatform()) {
    const configuredNativeUrl = absoluteApiBaseUrl(import.meta.env.VITE_NATIVE_API_BASE_URL)
    return configuredNativeUrl
      || absoluteApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
      || DEFAULT_NATIVE_API_BASE_URL
  }

  return import.meta.env.VITE_API_BASE_URL || LOCAL_API_BASE_URL
}

export function resolveMediaUrl(value) {
  if (!value || typeof value !== 'string') return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) return value
  if (!value.startsWith('/')) return value

  const baseUrl = resolveApiBaseUrl()
  if (!baseUrl || baseUrl.startsWith('/')) return value

  try {
    return `${new URL(baseUrl).origin}${value}`
  } catch {
    return value
  }
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0 ? API_TIMEOUT_MS : 20000,
})

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendError = error.response?.data?.error
    if (backendError?.message) {
      const normalizedError = new Error(backendError.message)
      normalizedError.code = backendError.code
      normalizedError.status = error.response.status
      if (
        normalizedError.status === 401
        && ['AUTH_REQUIRED', 'INVALID_TOKEN'].includes(normalizedError.code)
      ) {
        clearAuthToken()
        if (typeof authFailureHandler === 'function') {
          authFailureHandler(normalizedError)
        }
      }
      return Promise.reject(normalizedError)
    }

    return Promise.reject(error)
  },
)

export function setAuthFailureHandler(handler) {
  authFailureHandler = handler
}

export function unwrapApiResponse(payload) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return {
      data: payload.data,
      meta: payload.meta || {},
    }
  }

  return {
    data: payload,
    meta: {},
  }
}

export function getAuthToken() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(TOKEN_STORAGE_KEY) || ''
}

export function saveAuthToken(token) {
  if (typeof localStorage === 'undefined') return
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

export function clearAuthToken() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

