/**
 * Watch of a "payment to confirm" screen (a 3DS challenge left open, a lost bank answer, a payment pending at the
 * provider), so it is NEVER a dead end and never opens a second charge:
 * - it re-reads the REAL payment state by itself (`check`: in a shop, re-run the page loader, which reads
 *   `GET checkouts/:id`; OPS asks the provider through `commerce.payments.status`), waiting longer each time
 *   (5 s, 10 s, 15 s, 30 s) and never while the tab is hidden;
 * - after `graceMs` (2.5 min since the screen was first seen, kept across reloads) the phase becomes `stuck`: show the
 *   ways out (reopen the bank verification, keep waiting, change details or pay another way through `checkouts.cancel`,
 *   contact);
 * - a check that takes longer than `slowMs` stops locking its button (`slow`), so a spinner never spins forever.
 * Nothing about the payment is decided here: releasing it is OPS's answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type PendingPhase = 'confirming' | 'stuck'

/**
 * Open attempts the provider can settle at any moment (`requires_action`, `processing`, `unconfirmed`, `pending`
 * without a voucher). A cash voucher and a review by the store are not watched.
 */
const LIVE_ATTEMPTS = new Set(['requires_action', 'processing', 'unconfirmed', 'pending', ''])

export function watchesAttempt(p: { attempt: string; checkoutStatus?: string | null; voucherUrl?: string | null }): boolean {
  if (p.voucherUrl) return false
  if (p.checkoutStatus && p.checkoutStatus !== 'pending') return false
  return LIVE_ATTEMPTS.has(p.attempt)
}

export const PENDING_GRACE_MS = 150_000
export const PENDING_SLOW_MS = 20_000
export const PENDING_DELAYS_MS: readonly number[] = [5_000, 10_000, 15_000, 30_000]

/** Wait before check number `n` (0, 1, 2...); the last one repeats. */
export function nextCheckDelay(n: number, delays: readonly number[] = PENDING_DELAYS_MS): number {
  const list = delays.length ? delays : PENDING_DELAYS_MS
  return list[Math.min(Math.max(0, n), list.length - 1)]!
}

export function pendingPhase(firstSeen: number, now: number, graceMs = PENDING_GRACE_MS): PendingPhase {
  return now - firstSeen >= graceMs ? 'stuck' : 'confirming'
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_PREFIX = 'sf:pay:pending-seen:'

function sessionStore(): Store | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

/** When this open payment was first seen (per checkout), so a reload does not restart the wait. Only a timestamp. */
export function firstSeenAt(key: string, now: number, store: Store | null = sessionStore()): number {
  try {
    const raw = store?.getItem(STORAGE_PREFIX + key)
    const saved = raw ? Number(raw) : NaN
    if (Number.isFinite(saved) && saved <= now) return saved
    store?.setItem(STORAGE_PREFIX + key, String(now))
  } catch {
    /* no storage: the wait starts at mount */
  }
  return now
}

/** `m:ss` for the countdown to the next check. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export type PendingWatchOptions = {
  /** Checkout id: where the first-seen time is kept. */
  key: string
  /** Watch (automatic checks and the `stuck` phase). `false`: only the manual check with its time limit. */
  enabled: boolean
  /** Starts a real check (in a shop: re-run the page loader). */
  check: () => void
  /** A check is running (revalidation or navigation). */
  checking: boolean
  graceMs?: number
  slowMs?: number
  delaysMs?: readonly number[]
  /** Test hooks. */
  now?: () => number
  storage?: Store | null
}

export type PendingWatch = {
  phase: PendingPhase
  /** A check is running and is not late yet: only then is its button locked. */
  busy: boolean
  /** The running check passed `slowMs`: the button is available again; say it is taking long. */
  slow: boolean
  /** Ms to the next automatic check; `null` when none is scheduled (or the tab is hidden). */
  nextCheckInMs: number | null
  /** Manual check: restarts the wait between checks. */
  checkNow: () => void
}

export function usePendingPaymentWatch(options: PendingWatchOptions): PendingWatch {
  const { key, enabled, checking, graceMs = PENDING_GRACE_MS, slowMs = PENDING_SLOW_MS, delaysMs = PENDING_DELAYS_MS } = options
  const clock = options.now ?? Date.now
  const live = useRef(options)
  live.current = options
  // No browser clock on the server nor on the first paint: `confirming`, no countdown.
  const [firstSeen, setFirstSeen] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [visible, setVisible] = useState(true)
  const [checkStarted, setCheckStarted] = useState<number | null>(null)
  const [dueAt, setDueAt] = useState<number | null>(null)
  const rounds = useRef(0)

  useEffect(() => {
    const t = clock()
    setFirstSeen(firstSeenAt(key, t, options.storage === undefined ? sessionStore() : options.storage))
    setNow(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = () => setVisible(document.visibilityState !== 'hidden')
    onChange()
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  useEffect(() => {
    if (checking) {
      setCheckStarted((s) => s ?? clock())
      setDueAt(null)
      return
    }
    setCheckStarted(null)
    if (!enabled) {
      setDueAt(null)
      return
    }
    setDueAt(clock() + nextCheckDelay(rounds.current, delaysMs))
    rounds.current += 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, enabled])

  const run = useCallback(() => {
    setDueAt(null)
    setCheckStarted(clock())
    live.current.check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!enabled || checking || !visible || dueAt === null || now === null) return
    if (now >= dueAt) run()
  }, [enabled, checking, visible, dueAt, now, run])

  // A requested check that never started (or got lost) does not stop the clock: after `slowMs` another one is scheduled.
  useEffect(() => {
    if (checking || checkStarted === null || now === null || now - checkStarted < slowMs) return
    setCheckStarted(null)
    if (enabled) setDueAt(clock() + nextCheckDelay(rounds.current, delaysMs))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, checkStarted, now, slowMs, enabled])

  const checkNow = useCallback(() => {
    rounds.current = 0
    run()
  }, [run])

  const slow = checkStarted !== null && now !== null && now - checkStarted >= slowMs
  const phase: PendingPhase = enabled && firstSeen !== null && now !== null ? pendingPhase(firstSeen, now, graceMs) : 'confirming'
  const nextCheckInMs = enabled && visible && !checking && dueAt !== null && now !== null ? Math.max(0, dueAt - now) : null
  return { phase, busy: checkStarted !== null && !slow, slow, nextCheckInMs, checkNow }
}
