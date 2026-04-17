import axios from 'axios'
import { useAuthStore } from '../stores/auth-store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

import i18n from '../i18n/i18n'

// Add request interceptor to include auth token and language
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Add current language header
  config.headers['Accept-Language'] = i18n.language || 'es'

  // Add current branch header for multi-branch scoping
  try {
    const branch = JSON.parse(localStorage.getItem('current_branch') || '{}')
    if (branch?.id) config.headers['X-Branch-ID'] = branch.id
  } catch { /* ignore parse errors */ }

  // Let browser set Content-Type with boundary for FormData uploads
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }

  return config
})


// Add response interceptor to handle auth errors and log all API errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Always log API errors with backend message for debugging
    const status = error.response?.status
    const data = error.response?.data
    const url = error.config?.method?.toUpperCase() + ' ' + error.config?.url
    const serverMessage = data?.message || data?.error || data?.title || error.message
    console.error(`[API Error] ${url} → ${status}: ${serverMessage}`, data)

    if (status === 401) {
      const { reset } = useAuthStore.getState().auth
      reset()
      window.location.href = '/sign-in'
    }
    return Promise.reject(error)
  }
)
