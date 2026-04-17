import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'

export interface CreateApiClientOptions {
  /** Base URL for the axios instance. */
  baseURL: string
  /**
   * Synchronous token getter. Returning an empty string or `null` skips the
   * Authorization header.
   */
  getToken?: () => string | null | undefined
  /**
   * Synchronous getter for the `Accept-Language` header value (e.g. the
   * current i18n language). Defaults to `'es'` if omitted.
   */
  getLanguage?: () => string | null | undefined
  /**
   * Synchronous getter for the current branch id — sent as `X-Branch-ID`.
   * Return `null` / `undefined` to skip the header.
   */
  getBranchId?: () => string | number | null | undefined
  /**
   * Called when the server responds with 401. Use this to clear auth state and
   * redirect to the sign-in page. The returned promise (if any) is awaited
   * before the original error is rejected.
   */
  onUnauthorized?: () => void | Promise<void>
  /** Extra axios defaults (headers, timeout, etc). Merged into `axios.create`. */
  axiosConfig?: Omit<AxiosRequestConfig, 'baseURL'>
}

/**
 * Factory for an axios instance wired with Metacore's auth + i18n + multi-branch
 * conventions. Call once at app bootstrap, then share the returned instance.
 */
export function createApiClient(options: CreateApiClientOptions): AxiosInstance {
  const {
    baseURL,
    getToken,
    getLanguage,
    getBranchId,
    onUnauthorized,
    axiosConfig,
  } = options

  const instance = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      ...(axiosConfig?.headers as Record<string, string> | undefined),
    },
    ...axiosConfig,
  })

  instance.interceptors.request.use((config) => {
    const token = getToken?.()
    if (token) {
      config.headers.set?.('Authorization', `Bearer ${token}`)
      // Fallback for older axios versions that expose headers as a plain object.
      ;(config.headers as Record<string, unknown>).Authorization = `Bearer ${token}`
    }

    const language = getLanguage?.() || 'es'
    ;(config.headers as Record<string, unknown>)['Accept-Language'] = language

    const branchId = getBranchId?.()
    if (branchId !== undefined && branchId !== null && branchId !== '') {
      ;(config.headers as Record<string, unknown>)['X-Branch-ID'] = String(branchId)
    }

    // Let the browser set Content-Type (incl. boundary) for FormData uploads.
    if (config.data instanceof FormData) {
      delete (config.headers as Record<string, unknown>)['Content-Type']
    }

    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status = error?.response?.status
      const data = error?.response?.data
      const url =
        (error?.config?.method?.toUpperCase?.() ?? 'REQ') +
        ' ' +
        (error?.config?.url ?? '')
      const serverMessage =
        data?.message || data?.error || data?.title || error?.message
      // eslint-disable-next-line no-console
      console.error(`[API Error] ${url} → ${status}: ${serverMessage}`, data)

      if (status === 401 && onUnauthorized) {
        try {
          await onUnauthorized()
        } catch (handlerErr) {
          // eslint-disable-next-line no-console
          console.error('[API Error] onUnauthorized handler threw', handlerErr)
        }
      }

      return Promise.reject(error)
    }
  )

  return instance
}

export type ApiClient = ReturnType<typeof createApiClient>
