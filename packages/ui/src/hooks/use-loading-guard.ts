import { useCallback, useEffect, useState } from 'react'

/** Default ceiling for a loading state before it is declared stuck. */
export const DEFAULT_LOAD_TIMEOUT_MS = 15_000

export interface UseLoadingGuardOptions {
  /** Milliseconds a loading state may last before `timedOut` flips. `0`/`Infinity` disables the guard. */
  timeoutMs?: number
  /** Fired once per timeout (e.g. to log or abort the in-flight request). */
  onTimeout?: () => void
}

export interface LoadingGuard {
  /** True once `loading` has been continuously true for `timeoutMs`. Clears when loading ends or `retry()` runs. */
  timedOut: boolean
  /** Clears the timed-out flag and restarts the clock; call it from the retry handler. */
  retry: () => void
}

/**
 * Turns "loading forever" into a decidable state. A skeleton driven by a request
 * that never answers (offline, hung proxy, swallowed error) would otherwise stay
 * on screen indefinitely; with this guard the host can swap it for an actionable
 * error. Reusable by any loading surface (sidebar, dashboard, tables, panels).
 */
export function useLoadingGuard(
  loading: boolean,
  { timeoutMs = DEFAULT_LOAD_TIMEOUT_MS, onTimeout }: UseLoadingGuardOptions = {},
): LoadingGuard {
  const [timedOut, setTimedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!loading) {
      setTimedOut(false)
      return
    }
    if (!timeoutMs || !Number.isFinite(timeoutMs)) return
    const id = setTimeout(() => {
      setTimedOut(true)
      onTimeout?.()
    }, timeoutMs)
    return () => clearTimeout(id)
    // onTimeout intentionally excluded: a fresh closure must not restart the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, timeoutMs, attempt])

  const retry = useCallback(() => {
    setTimedOut(false)
    setAttempt((n) => n + 1)
  }, [])

  return { timedOut, retry }
}
