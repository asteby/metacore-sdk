import type { StorefrontErrorCode } from './types.js'

export type StorefrontErrorInit = {
  status: number
  code: StorefrontErrorCode
  message: string
  field?: string
  /** Request URL that failed (without credentials). */
  url?: string
  cause?: unknown
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
  readonly url: string | undefined

  constructor(init: StorefrontErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.status = init.status
    this.code = init.code
    this.field = init.field
    this.url = init.url
  }

  toJSON() {
    return { name: this.name, status: this.status, code: this.code, message: this.message, field: this.field }
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
