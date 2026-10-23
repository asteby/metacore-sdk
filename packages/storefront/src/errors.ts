import type { InsufficientStockLine, StorefrontErrorCode } from './types.js'

export type StorefrontErrorInit = {
  status: number
  code: StorefrontErrorCode
  message: string
  field?: string
  /** Raw `error.details` from the body (untrusted shape). */
  details?: unknown
  /** Request URL that failed (without credentials). */
  url?: string
  cause?: unknown
  /** Scopes named by the gateway on a `403 insufficient_scope`. */
  requiredScopes?: string[]
}

/**
 * Error thrown by the client for any non-2xx response, network failure,
 * timeout or abort. `status` is `0` when no HTTP response was received.
 */
export class StorefrontError extends Error {
  override readonly name = 'StorefrontError'
  readonly status: number
  readonly code: StorefrontErrorCode
  readonly field: string | undefined
  readonly details: unknown
  readonly url: string | undefined
  /** Scopes a `403 insufficient_scope` says the route needs (empty for any other error). */
  readonly requiredScopes: string[]

  constructor(init: StorefrontErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.status = init.status
    this.code = init.code
    this.field = init.field
    this.details = init.details
    this.url = init.url
    this.requiredScopes = init.requiredScopes ?? []
  }

  /**
   * Affected lines of a `409 insufficient_stock` (empty for any other error or a
   * server older than contract 1.1). The cart is untouched: show the lines and
   * let the buyer adjust or remove them.
   */
  get stockLines(): InsufficientStockLine[] {
    const lines = (this.details as { lines?: unknown } | null | undefined)?.lines
    if (this.code !== 'insufficient_stock' || !Array.isArray(lines)) return []
    return lines.filter((l): l is InsufficientStockLine => typeof l === 'object' && l !== null && typeof (l as { sku?: unknown }).sku === 'string')
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      message: this.message,
      field: this.field,
      ...(this.requiredScopes.length ? { requiredScopes: this.requiredScopes } : {}),
    }
  }
}

export function isStorefrontError(err: unknown): err is StorefrontError {
  return err instanceof StorefrontError || (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'StorefrontError')
}

const STATUS_CODES: Record<number, StorefrontErrorCode> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'invalid_state',
  429: 'rate_limited',
}

export function defaultCodeForStatus(status: number): StorefrontErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? 'server_error' : 'invalid_response')
}
