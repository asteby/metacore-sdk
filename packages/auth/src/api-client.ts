import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { detectHtmlResponse } from '@asteby/metacore-lib/http-errors'
import type { HtmlResponseError } from '@asteby/metacore-lib/http-errors'

export { HtmlResponseError, isHtmlResponseError } from '@asteby/metacore-lib/http-errors'

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
  /**
   * Human message for `HtmlResponseError` (an API call answered with an HTML
   * page — misrouted proxy, SPA catch-all, CDN error page). Receives the
   * status; defaults to the SDK's generic English copy.
   */
  htmlErrorMessage?: (status: number | undefined) => string
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
    htmlErrorMessage,
    axiosConfig,
  } = options

  // An API endpoint answering HTML is never data: turn it into a typed
  // HtmlResponseError (human message + collapsible detail + correlation id)
  // instead of letting the page reach a toast or a modal as "the message".
  // Opt out per request with a non-JSON responseType (text/blob/arraybuffer).
  const htmlError = (
    response: Pick<AxiosResponse, 'status' | 'data' | 'headers' | 'config'> | undefined,
  ): HtmlResponseError | undefined => {
    if (!response) return undefined
    const responseType = response.config?.responseType
    if (responseType && responseType !== 'json') return undefined
    const headers = response.headers as Record<string, unknown> | undefined
    const contentType = String(
      (headers as { get?: (k: string) => unknown })?.get?.('content-type') ?? headers?.['content-type'] ?? '',
    )
    return detectHtmlResponse({
      status: response.status,
      url: `${response.config?.method?.toUpperCase?.() ?? 'REQ'} ${response.config?.url ?? ''}`,
      contentType: contentType || undefined,
      body: response.data,
      message: htmlErrorMessage?.(response.status),
    })
  }

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
    (response) => {
      const typed = htmlError(response)
      if (typed) {
        // eslint-disable-next-line no-console
        console.error(`[API Error] ${typed.url} → ${typed.status}: HTML instead of JSON (${typed.correlationId})`, typed.details())
        return Promise.reject(typed)
      }
      return response
    },
    async (error) => {
      const status = error?.response?.status
      const typed = htmlError(error?.response)
      const data = error?.response?.data
      const url =
        (error?.config?.method?.toUpperCase?.() ?? 'REQ') +
        ' ' +
        (error?.config?.url ?? '')
      const serverMessage = typed
        ? `HTML instead of JSON (${typed.correlationId})`
        : data?.message || data?.error || data?.title || error?.message
      // eslint-disable-next-line no-console
      console.error(`[API Error] ${url} → ${status}: ${serverMessage}`, typed ? typed.details() : data)

      if (status === 401 && onUnauthorized) {
        try {
          await onUnauthorized()
        } catch (handlerErr) {
          // eslint-disable-next-line no-console
          console.error('[API Error] onUnauthorized handler threw', handlerErr)
        }
      }

      return Promise.reject(typed ?? error)
    }
  )

  return instance
}

export type ApiClient = ReturnType<typeof createApiClient>
