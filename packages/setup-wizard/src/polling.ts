import { useCallback, useEffect, useRef, useState } from 'react'

/** Delay before attempt N (0-based). A number is constant; an array is a backoff schedule whose last value repeats. */
export type PollInterval = number | number[] | ((attempt: number) => number)

export function intervalFor(i: PollInterval, attempt: number): number {
  if (typeof i === 'number') return i
  if (typeof i === 'function') return i(attempt)
  return i[Math.min(attempt, i.length - 1)] ?? 0
}

export type PollOutcome<T> = { status: 'done'; value: T; attempts: number } | { status: 'exhausted'; value: T | undefined; attempts: number } | { status: 'aborted'; attempts: number }

export interface PollOptions<T> {
  interval: PollInterval
  /** Max checks (including the first). Infinity by default. */
  maxAttempts?: number
  signal?: AbortSignal
  /** Stop when this returns true for the latest value. */
  until: (value: T) => boolean
  onTick?: (value: T, attempt: number) => void
  /** Skip waiting-time checks while the tab is hidden. */
  pauseWhenHidden?: boolean
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener('abort', done)
      clearTimeout(t)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })

/** Runs `check` immediately and then on the schedule until `until`, exhaustion or abort. Errors propagate. */
export async function pollUntil<T>(check: (attempt: number, signal?: AbortSignal) => Promise<T>, opts: PollOptions<T>): Promise<PollOutcome<T>> {
  const { interval, maxAttempts = Infinity, signal, until, onTick, pauseWhenHidden = true, sleep: wait = sleep } = opts
  let last: T | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return { status: 'aborted', attempts: attempt }
    if (attempt > 0) {
      await wait(intervalFor(interval, attempt - 1), signal)
      if (signal?.aborted) return { status: 'aborted', attempts: attempt }
      while (pauseWhenHidden && typeof document !== 'undefined' && document.hidden && !signal?.aborted) {
        await new Promise<void>((r) => {
          const on = () => {
            document.removeEventListener('visibilitychange', on)
            signal?.removeEventListener('abort', on)
            r()
          }
          document.addEventListener('visibilitychange', on)
          signal?.addEventListener('abort', on, { once: true })
        })
      }
    }
    const value = await check(attempt, signal)
    if (signal?.aborted) return { status: 'aborted', attempts: attempt + 1 }
    last = value
    onTick?.(value, attempt + 1)
    if (until(value)) return { status: 'done', value, attempts: attempt + 1 }
  }
  return { status: 'exhausted', value: last, attempts: maxAttempts }
}

export type PollingState = 'idle' | 'polling' | 'done' | 'exhausted' | 'error'

export interface UsePollingOptions<T> extends Omit<PollOptions<T>, 'signal' | 'onTick'> {
  enabled?: boolean
}

/**
 * Live verification hook: polls `check` while enabled and exposes the latest
 * value, attempt count and state. `restart()` re-arms it after exhaustion.
 */
export function usePolling<T>(check: (attempt: number, signal?: AbortSignal) => Promise<T>, opts: UsePollingOptions<T>) {
  const { enabled = true } = opts
  const [value, setValue] = useState<T | undefined>()
  const [attempts, setAttempts] = useState(0)
  const [state, setState] = useState<PollingState>('idle')
  const [error, setError] = useState<unknown>()
  const [run, setRun] = useState(0)
  const checkRef = useRef(check)
  checkRef.current = check
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!enabled) return
    const ac = new AbortController()
    setState('polling')
    setError(undefined)
    pollUntil((a, sig) => checkRef.current(a, sig), {
      ...optsRef.current,
      signal: ac.signal,
      onTick: (v, n) => (setValue(v), setAttempts(n)),
    }).then(
      (r) => {
        if (r.status === 'done') setState('done')
        else if (r.status === 'exhausted') setState('exhausted')
      },
      (e) => {
        if (!ac.signal.aborted) (setError(e), setState('error'))
      },
    )
    return () => ac.abort()
  }, [enabled, run])

  const restart = useCallback(() => setRun((n) => n + 1), [])
  return { value, attempts, state, error, restart }
}
