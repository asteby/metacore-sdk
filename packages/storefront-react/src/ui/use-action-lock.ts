import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'

export type ActionResult = 'idle' | 'done' | 'error'

export type UseActionLockOptions = {
  /** Milliseconds the lock holds after the work ends, against a second click. Default 600. */
  cooldownMs?: number
}

export type ActionLock = {
  /** The work is running. */
  pending: boolean
  /** Running or inside the cooldown: the button must not accept another click. */
  locked: boolean
  /** How the last run ended (`idle` until one ends or when it was cancelled). */
  result: ActionResult
  /**
   * Runs `fn` unless a run is already going (or cooling down): then it returns `undefined` WITHOUT calling it, so a
   * double click, an Enter key repeat or two tabs of code cannot start the work twice. `fn` gets an `AbortSignal` that is
   * aborted by `abort()` and on unmount (close the dialog = cancel the request). A throw (other than an abort) or a
   * result with `ok === false` ends as `error`.
   */
  run: <T>(fn: (signal: AbortSignal) => Promise<T>) => Promise<T | undefined>
  /** Cancels the running work (its signal aborts). */
  abort: () => void
}

const isAbort = (e: unknown) => !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError'

/**
 * Lock for a hand-written async action (`fetch`, a download, a dialog that loads). The guard is a ref, set before the
 * first await, so two clicks in the same tick still run once. Pair it with `<PendingButton pending={lock.pending} />`.
 */
export function useActionLock({ cooldownMs = 600 }: UseActionLockOptions = {}): ActionLock {
  const running = useRef(false)
  const cooling = useRef(false)
  const ctl = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  const [pending, setPending] = useState(false)
  const [cool, setCool] = useState(false)
  const [result, setResult] = useState<ActionResult>('idle')

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      ctl.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const run = useCallback(
    async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      if (running.current || cooling.current) return undefined
      running.current = true
      const c = new AbortController()
      ctl.current = c
      setPending(true)
      setResult('idle')
      let out: T | undefined
      let end: ActionResult = 'done'
      try {
        out = await fn(c.signal)
        if (c.signal.aborted) end = 'idle'
        else if (out && typeof out === 'object' && (out as { ok?: unknown }).ok === false) end = 'error'
      } catch (e) {
        end = isAbort(e) || c.signal.aborted ? 'idle' : 'error'
      } finally {
        running.current = false
        ctl.current = null
        cooling.current = cooldownMs > 0
        if (alive.current) {
          setPending(false)
          setResult(end)
          if (cooldownMs > 0) {
            setCool(true)
            timer.current = setTimeout(() => {
              cooling.current = false
              if (alive.current) setCool(false)
            }, cooldownMs)
          }
        }
      }
      return out
    },
    [cooldownMs],
  )

  const abort = useCallback(() => ctl.current?.abort(), [])
  return { pending, locked: pending || cool, result, run, abort }
}

/**
 * For work a router owns (`useNavigation().state !== 'idle'`, `fetcher.state !== 'idle'`): `locked` stays true for the
 * cooldown after `pending` ends, and `guard` refuses a second submit in the gap before the router reports the first
 * (a double click lands inside it). Use `guard` as `onSubmit` of the form. Without JavaScript nothing of this exists and
 * the server's own guard is the defence.
 */
export function useSubmitOnce(pending: boolean, { cooldownMs = 600 }: UseActionLockOptions = {}) {
  const armed = useRef(false)
  const was = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cool, setCool] = useState(false)

  useEffect(() => {
    if (pending) {
      was.current = true
      armed.current = true
      return
    }
    if (was.current) {
      was.current = false
      armed.current = cooldownMs > 0
      setCool(cooldownMs > 0)
      timer.current = setTimeout(() => {
        armed.current = false
        setCool(false)
      }, cooldownMs)
    }
  }, [pending, cooldownMs])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const guard = useCallback((e: SyntheticEvent) => {
    if (armed.current) {
      e.preventDefault()
      return false
    }
    // The router reports `pending` a moment later; this swallows a second submit in between.
    armed.current = true
    setTimeout(() => {
      if (!was.current) armed.current = false
    }, 250)
    return true
  }, [])

  return { locked: pending || cool, guard }
}
