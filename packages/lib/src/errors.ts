/**
 * Server error handler. Pure: no React, no DOM.
 *
 * `toast` is injected (typically from `sonner`) to avoid a hard dependency.
 * Localized strings can be overridden via the `labels` argument.
 */

export interface ErrorLabels {
  generic: string
  notFound: string
  unauthorized: string
  forbidden: string
  network: string
  timeout: string
}

const DEFAULT_LABELS: ErrorLabels = {
  generic: 'Something went wrong!',
  notFound: 'Content not found.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have permission to perform this action.',
  network: 'Network error. Please check your connection.',
  timeout: 'Request timed out. Please try again.',
}

export interface ToastLike {
  error: (message: string) => unknown
}

/**
 * Minimal logger-like interface (accepts console or a custom logger).
 */
export interface LoggerLike {
  error?: (...args: unknown[]) => void
  log?: (...args: unknown[]) => void
}

interface ErrorWithStatus {
  status?: number
  message?: string
  response?: {
    status?: number
    data?: unknown
  }
  code?: string
  isAxiosError?: boolean
  name?: string
}

function extractMessage(error: unknown, labels: ErrorLabels): string {
  if (!error) return labels.generic

  if (typeof error === 'string') return error

  if (typeof error !== 'object') return labels.generic

  const err = error as ErrorWithStatus

  // Axios-style error
  if (err.isAxiosError || err.response) {
    const status = err.response?.status ?? err.status
    const data = err.response?.data as
      | { message?: string; title?: string; error?: string; detail?: string }
      | undefined

    if (status === 401) return labels.unauthorized
    if (status === 403) return labels.forbidden
    if (status === 404) return labels.notFound
    if (status === 204) return labels.notFound

    return (
      data?.message || data?.title || data?.error || data?.detail || err.message || labels.generic
    )
  }

  // Network-level errors
  if (err.code === 'ECONNABORTED' || err.name === 'TimeoutError') return labels.timeout
  if (err.code === 'ERR_NETWORK' || err.name === 'NetworkError') return labels.network

  if ('status' in err && Number(err.status) === 204) return labels.notFound

  return err.message || labels.generic
}

/**
 * Report a server error to the user via `toast` and log it.
 *
 * @example
 *   import { toast } from 'sonner'
 *   handleServerError(err, toast)
 *
 * @example
 *   handleServerError(err, toast, { labels: { unauthorized: 'Sesión expirada' } })
 */
export function handleServerError(
  error: unknown,
  toast?: ToastLike,
  options: {
    labels?: Partial<ErrorLabels>
    logger?: LoggerLike
  } = {},
): string {
  const labels: ErrorLabels = { ...DEFAULT_LABELS, ...(options.labels ?? {}) }
  const logger: LoggerLike = options.logger ?? console

  const message = extractMessage(error, labels)

  try {
    logger.error?.(error) ?? logger.log?.(error)
  } catch {
    // swallow logger errors
  }

  if (toast) {
    try {
      toast.error(message)
    } catch {
      // swallow toast errors
    }
  }

  return message
}
