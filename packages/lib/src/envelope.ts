import { translateErrorCode } from './error-catalog'
/**
 * Kernel response envelope `{ success, data, meta }` — the ONE place the SDK
 * (and every app/addon built on it) unwraps it and extracts error messages.
 * Pure: no React, no DOM, no HTTP client.
 */

export interface EnvelopeMeta {
  total?: number
  page?: number
  per_page?: number
  [key: string]: unknown
}

export interface Envelope<T> {
  success?: boolean
  data?: T
  meta?: EnvelopeMeta
  message?: string
  error?: string
}

/** Anything shaped like an HTTP response whose body is `data` (axios & co.). */
export interface ResponseLike {
  data?: unknown
}

export interface ApiErrorInit {
  status?: number
  code?: string
  details?: unknown
  cause?: unknown
}

/** An error reported by the server (`success:false` envelope or HTTP failure). */
export class ApiError extends Error {
  readonly status?: number
  readonly code?: string
  readonly details?: unknown

  constructor(message: string, init: ApiErrorInit = {}) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

const ENVELOPE_KEYS = new Set(['success', 'data', 'meta', 'message', 'error'])

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * True when `body` is a kernel envelope: has a boolean `success`, or is a
 * `{data, meta?, message?}` object with no other keys. A flat record that
 * merely happens to have a `data` field next to other fields is NOT one.
 */
export function isEnvelope(body: unknown): body is Envelope<unknown> {
  if (!isObj(body)) return false
  if (typeof body.success === 'boolean') return true
  return 'data' in body && Object.keys(body).every((k) => ENVELOPE_KEYS.has(k))
}

function envelopeMessage(env: Envelope<unknown>): string {
  if (typeof env.message === 'string' && env.message) return env.message
  if (typeof env.error === 'string' && env.error) return env.error
  return 'request failed'
}

/**
 * Unwraps a response BODY. `{success:true,data}` → `data`; `{success:false}`
 * throws `ApiError`; a bare payload (no envelope) is returned untouched.
 */
export function unwrapEnvelope<T>(body: unknown): T {
  if (!isEnvelope(body)) return body as T
  if (body.success === false) {
    throw new ApiError(envelopeMessage(body), { details: body })
  }
  return body.data as T
}

/** Same as {@link unwrapEnvelope} for an axios-style response (`res.data`). */
export function unwrapResponse<T>(res: ResponseLike | null | undefined): T {
  return unwrapEnvelope<T>(res?.data)
}

export interface UnwrappedList<T> {
  items: T[]
  /** `meta.total` when the server sent it, else `items.length`. */
  total: number
  meta: EnvelopeMeta
}

/** Unwraps a list body: `data` (or a bare array) + `meta.total`. Never null. */
export function unwrapList<T>(body: unknown): UnwrappedList<T> {
  const data = unwrapEnvelope<unknown>(body)
  const items = Array.isArray(data) ? (data as T[]) : []
  const meta = isEnvelope(body) && isObj(body.meta) ? (body.meta as EnvelopeMeta) : {}
  const total = typeof meta.total === 'number' ? meta.total : items.length
  return { items, total, meta }
}

/** Same as {@link unwrapList} for an axios-style response. */
export function unwrapListResponse<T>(res: ResponseLike | null | undefined): UnwrappedList<T> {
  return unwrapList<T>(res?.data)
}

/** True for a cancelled request (AbortController / axios CanceledError). */
export function isAbortError(err: unknown): boolean {
  if (!isObj(err) && !(err instanceof Error)) return false
  const e = err as { name?: unknown; code?: unknown }
  return e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED'
}

const nonEmpty = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

/**
 * Human message from an axios-style error, an `ApiError`, a fetch failure or
 * a plain string. Never dumps an HTML page (uses its `<title>` or the fallback).
 */
export interface ApiErrorMessageOptions {
  /** Language of the error catalog (`registerErrorCatalog`); default none. */
  lang?: string
}

/** Extracts `{code, params}` from an error body: root, `error{}` or `data{}`. */
function extractCode(data: unknown): { code?: string; params?: Record<string, unknown> } {
  if (!isObj(data)) return {}
  for (const src of [data, data.error, data.data]) {
    if (!isObj(src)) continue
    const code = nonEmpty(src.code)
    if (code) {
      const params = isObj(src.params) ? src.params : isObj(data.params) ? data.params : undefined
      return { code, params }
    }
  }
  return {}
}

export function getApiErrorMessage(
  err: unknown,
  fallback = 'Error',
  opts: ApiErrorMessageOptions = {},
): string {
  if (err == null) return fallback
  if (typeof err === 'string') return nonEmpty(err) ?? fallback

  if (opts.lang) {
    const e = err as { code?: unknown; details?: unknown; response?: { data?: unknown } }
    const fromBody = extractCode(e.response?.data)
    const fromDetails = extractCode(e.details)
    const code = fromBody.code ?? fromDetails.code ?? (err instanceof ApiError ? err.code : undefined)
    const translated = translateErrorCode(code, opts.lang, fromBody.params ?? fromDetails.params)
    if (translated) return translated
  }

  const ax = err as { response?: { data?: unknown }; message?: unknown }
  const data = ax.response?.data

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (trimmed) {
      const title = trimmed.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim()
      if (title) return title
      if (!trimmed.startsWith('<') && trimmed.length < 800) return trimmed
    }
  } else if (isObj(data)) {
    for (const key of ['message', 'error', 'detail', 'title'] as const) {
      const v = nonEmpty(data[key])
      if (v) return v
    }
    if (isObj(data.data)) {
      const m = nonEmpty(data.data.message)
      if (m) return m
    }
  }

  return nonEmpty(ax.message) ?? fallback
}
