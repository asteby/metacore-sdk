/**
 * Transport-agnostic HTTP client surface. Mirrors the contract used by
 * `@asteby/metacore-billing` so any host that already wires a fetcher
 * for billing can re-use it (or supply a thinner one if they prefer).
 *
 * The marketplace clients (`HubClient` + `OpsClient`) only need JSON in /
 * JSON out, so this contract stays intentionally tiny.
 */

/** Optional query-string-friendly param helper. */
export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null | string[]
>

/** Minimal fetcher surface — implementable on top of fetch, axios, ky, etc. */
export interface MarketplaceFetcher {
  get<T>(path: string, params?: QueryParams): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  del<T>(path: string): Promise<T>
}

/**
 * Build a query string from a `QueryParams` object. Skips undefined/null;
 * arrays are joined with comma to match the convention the Hub uses for
 * filter lists (e.g. `tags=billing,fiscal`).
 */
export function toQueryString(params?: QueryParams): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      usp.set(key, value.join(','))
      continue
    }
    usp.set(key, String(value))
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

/**
 * The kernel + Hub both speak the canonical envelope
 *   { success: true, data: <payload>, meta?: { ... } }
 * since the v0.8 kernel handler refactor. Older Hub deploys may still
 * return bare payloads — we unwrap defensively to support both.
 */
interface Enveloped<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: Record<string, unknown>
}

export function unwrapEnvelope<T>(raw: T | Enveloped<T>): T {
  if (raw && typeof raw === 'object' && 'success' in (raw as object)) {
    const env = raw as Enveloped<T>
    if (env.success === false) {
      throw new Error(env.message || env.error || 'marketplace request failed')
    }
    return (env.data ?? (raw as unknown)) as T
  }
  return raw as T
}

// ---------------------------------------------------------------------------
// Default fetcher built on top of the platform `fetch` global.
// ---------------------------------------------------------------------------

export interface CreateFetchFetcherOptions {
  /** Base URL — every path is appended to this. */
  baseUrl: string
  /**
   * Returns headers to send with every request. Called per-request so
   * callers can inject a freshly-refreshed bearer token without
   * reconstructing the fetcher.
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>
  /** Optional `fetch` override — useful for SSR or test injection. */
  fetchImpl?: typeof fetch
}

/**
 * Convenience factory — most hosts already have a fetch wrapper they're
 * happy with, but for quick wiring (or tests) this builds one off the
 * platform `fetch` global.
 */
export function createFetchFetcher(opts: CreateFetchFetcherOptions): MarketplaceFetcher {
  const f: typeof fetch =
    opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null!)
  if (!f) {
    throw new Error(
      'createFetchFetcher: no fetch implementation available — pass `fetchImpl` or run in a fetch-capable environment',
    )
  }

  const url = (path: string) => {
    if (/^https?:\/\//.test(path)) return path
    const base = opts.baseUrl.replace(/\/$/, '')
    const suffix = path.startsWith('/') ? path : `/${path}`
    return `${base}${suffix}`
  }

  const buildHeaders = async (extra?: Record<string, string>) => {
    const dyn = (await opts.headers?.()) ?? {}
    return { 'content-type': 'application/json', ...dyn, ...(extra ?? {}) }
  }

  const request = async <T>(
    path: string,
    init: { method: string; body?: unknown; params?: QueryParams },
  ): Promise<T> => {
    const headers = await buildHeaders()
    const res = await f(url(path) + toQueryString(init.params), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `marketplace ${init.method} ${path} failed: ${res.status} ${res.statusText}${
          text ? ` — ${text}` : ''
        }`,
      )
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    get: <T>(path: string, params?: QueryParams) =>
      request<T>(path, { method: 'GET', params }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  }
}
