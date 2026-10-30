import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  generateIdempotencyKey,
  paymentErrorView,
  paymentIdempotencyKey,
  paymentMessages,
  paymentOutcome,
  type Money,
  type PaymentAction,
  type PaymentAttemptResult,
  type PaymentClient,
  type PaymentErrorKind,
  type PaymentErrorView,
  type PaymentMessages,
  type PaymentOutcome,
  type PaymentOutcomeKind,
} from '@asteby/storefront'
import type { MountedPaymentForm, PaymentFormAdapter, PaymentTransport } from './adapter.js'
import { mercadoPagoBricksAdapter } from './mercadopago.js'
import { mountQueued } from './mount-queue.js'
import { isResolvedAttempt } from './resilient-transport.js'
import { STRIPE_ELEMENTS_KIND, stripeElementsAdapter } from './stripe.js'
import { readPaymentScheme, readPaymentTheme } from './theme.js'

export type EmbeddedPaymentStatus =
  | 'idle' // no client / disabled / not hydrated
  | 'loading' // loading the provider SDK and mounting
  | 'ready'
  | 'processing'
  | OutcomeStatus
  | 'network_error' // no answer: `retry()` repeats the SAME attempt
  | 'blocked' // 409/429 and the like: do not retry (see `error.kind`)
  | 'fallback' // the secure form is unusable: switch to a redirect payment

type OutcomeStatus = PaymentOutcomeKind

export type PaymentFallbackReason = 'sdk_timeout' | 'sdk_error' | 'form_error' | 'unsupported_provider' | 'no_client'

/** Anonymous funnel events: no personal or card data. */
export type PaymentEvent =
  | { type: 'form_ready'; ms: number }
  | { type: 'form_failed'; reason: PaymentFallbackReason }
  | { type: 'tokenize_error' }
  | { type: 'submit' }
  | { type: 'result'; status: PaymentOutcomeKind; decline_code: string | null }
  | { type: 'error'; kind: PaymentErrorKind }
  | { type: 'retry' }
  /** A challenge the provider SDK runs itself (Stripe 3DS): `completed` / `failed` is the SDK's word, never the payment's. */
  | { type: 'provider_action'; result: 'completed' | 'failed' | 'unsupported' }

export type UseEmbeddedPaymentOptions = {
  /** Provider data from `paymentMethods[].client`. `null`/absent: nothing to mount (status `idle`). */
  client: PaymentClient | null | undefined
  /**
   * The total computed by the server. When it changes the form on screen is UPDATED in place (`MountedPaymentForm.update`)
   * or, if the provider cannot, mounted again through the queue; never while a charge is in flight (applied after the
   * answer). Never calculate it in the shop.
   */
  amount: Money
  transport: PaymentTransport
  /** Mount only while the card option is selected. Default true. */
  enabled?: boolean
  email?: string
  locale?: string
  /** Replaces the adapter chosen from `client.kind`. */
  adapter?: PaymentFormAdapter
  /** Extra adapters by `kind`. Mercado Pago (`mercadopago_bricks`) and Stripe (`stripe_elements`) are built in. */
  adapters?: Record<string, PaymentFormAdapter>
  /** CSP nonce for the inserted script. */
  nonce?: string
  /** Time to wait for the form to be ready before falling back. Default 8000. */
  sdkTimeoutMs?: number
  /** Automatic resubmits (same attempt) after a network failure before showing the retry button. Default 2. */
  autoRetries?: number
  /** Base delay for the backoff between automatic retries. Default 600. */
  retryDelayMs?: number
  /** Longest wait for the provider's `create` before the form is declared failed. Default `sdkTimeoutMs`. */
  createTimeoutMs?: number
  /** After an UNKNOWN outcome ("verifying"), how long the hook keeps reading `refresh`, with growing waits. Default 120000. */
  verifyTimeoutMs?: number
  /** First wait of that check (doubles up to 15 s). Default 2000. */
  verifyIntervalMs?: number
  /** Poll interval/timeout for a pending 3DS challenge or review when `transport.refresh` exists. */
  pollIntervalMs?: number
  pollTimeoutMs?: number
  /** Where the attempt id is kept so a reload/retry reuses it. Default `sessionStorage`; `null` disables. Never holds card data. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Scope of the stored attempt (e.g. the checkout or cart id). Default `default`. */
  scope?: string
  messages?: Partial<PaymentMessages>
  /** Called with the classified outcome of every definitive answer. */
  onResult?: (outcome: PaymentOutcome, result: PaymentAttemptResult) => void
  /** Called for `redirect` outcomes. Default: `location.assign(url)` (https only). */
  onRedirect?: (url: string) => void
  onFallback?: (reason: PaymentFallbackReason) => void
  onEvent?: (event: PaymentEvent) => void
  /** Overrides the theme read from `--sf-pay-*` tokens. */
  theme?: Record<string, string>
  /** Overrides the light / dark scheme read from the page (`--sf-pay-scheme` or `color-scheme`). */
  colorScheme?: 'light' | 'dark'
  /** Test hooks. */
  newAttemptId?: () => string
}

export type EmbeddedPaymentState = {
  status: EmbeddedPaymentStatus
  /** Text to show for the current state (decline reason, review notice, error...). */
  message: string | null
  outcome: PaymentOutcome | null
  error: PaymentErrorView | null
  fallbackReason: PaymentFallbackReason | null
  attemptsLeft: number | null
  /** Id of the current attempt (stable across network retries). */
  attemptId: string | null
  /** `true` while loading, mounting or processing. */
  busy: boolean
  /** `true` while the hook reads the payment state in the background after an unknown outcome. The attempt stays the same. */
  verifying: boolean
  /** Attach to the element the provider renders into. */
  containerRef: (el: HTMLElement | null) => void
  containerId: string
  /** Tokenises and sends. No-ops while another submit is in flight (double click safe). */
  submit: () => Promise<void>
  /** Repeats the last submit with the SAME attempt after a network failure. */
  retry: () => Promise<void>
  /** After a rejection: clears the message (the form is remounted by the hook). */
  dismiss: () => void
  /**
   * Leaves a pending 3DS challenge (the buyer's emergency exit). The outcome is UNKNOWN (the bank may still approve the
   * attempt the buyer just verified), so the attempt key is kept and no new payment can start: the hook verifies the
   * payment state through `transport.refresh` (status `blocked`, `error.kind = 'payment_in_progress'`, `verifying`).
   * Only a definitive answer settles it: approved, or rejected / expired / cancelled, which gives a new attempt and a
   * fresh form. A still-pending challenge does not reopen the dialog.
   */
  cancelChallenge: () => void
}

const DEFAULT_ADAPTERS: Record<string, PaymentFormAdapter> = {}

function defaultAdapterFor(kind: string): PaymentFormAdapter | undefined {
  if (kind === 'mercadopago_bricks') return (DEFAULT_ADAPTERS[kind] ??= mercadoPagoBricksAdapter())
  if (kind === STRIPE_ELEMENTS_KIND) return (DEFAULT_ADAPTERS[kind] ??= stripeElementsAdapter())
  return undefined
}

/**
 * A pending challenge the provider SDK must run itself (`challenge.kind` set and not `iframe`, e.g. `stripe_next_action`),
 * as opposed to a bank page `url` shown in the page's own dialog (Mercado Pago 3DS: no `kind`).
 */
function providerAction(result: PaymentAttemptResult): PaymentAction | null {
  const p = result.payment
  if (p.status !== 'requires_action' && p.status !== 'pending') return null
  const a = p.action
  const k = a?.type === 'challenge' ? a.challenge?.kind : undefined
  return typeof k === 'string' && k !== '' && k !== 'iframe' ? a! : null
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Embedded payment state machine for one card form.
 *
 * Guarantees:
 * - The amount is the server's: it is passed to the provider widget and echoed as `expected_total`; never computed.
 * - One idempotency key per attempt (`attempt`), kept in `storage`, reused on network retries and rotated only
 *   after a definitive answer (a rejected card needs a new token, hence a new attempt).
 * - Card data never reaches this code or storage: only the provider token, held in memory until the answer.
 * - A double click returns the in-flight promise instead of sending twice.
 */
export function useEmbeddedPayment(options: UseEmbeddedPaymentOptions): EmbeddedPaymentState {
  const {
    client,
    amount,
    transport,
    enabled = true,
    locale,
    sdkTimeoutMs = 8000,
    autoRetries = 2,
    retryDelayMs = 600,
    pollIntervalMs = 2000,
    pollTimeoutMs = 300_000,
    verifyTimeoutMs = 120_000,
    verifyIntervalMs = 2000,
    scope = 'default',
  } = options
  const msgs = useMemo(() => paymentMessages(locale, options.messages), [locale, options.messages])
  const rawId = useId()
  const containerId = useMemo(() => `sf-pay-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId])

  const [status, setStatus] = useState<EmbeddedPaymentStatus>('idle')
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null)
  const [error, setError] = useState<PaymentErrorView | null>(null)
  const [fallbackReason, setFallbackReason] = useState<PaymentFallbackReason | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [mountKey, setMountKey] = useState(0)
  const [verifying, setVerifying] = useState(false)

  // Latest props without re-triggering effects.
  const live = useRef({ ...options, msgs })
  live.current = { ...options, msgs }
  const form = useRef<MountedPaymentForm | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  type PayData = { provider_data: Record<string, unknown>; device_session_id?: string }
  // Memory only, for `retry()`: the tokenized data AND the total the buyer saw when pressing PAY (same attempt, same body).
  const pendingData = useRef<{ data: PayData; total: Money } | null>(null)
  // Attempt key kept in memory too: with `storage: null` or blocked storage, `retry()` must reuse it.
  const memAttempt = useRef<string | null>(null)
  const memOnly = useRef(false)
  const errorRef = useRef<PaymentErrorView | null>(null)
  const retryRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const alive = useRef(true)
  const generation = useRef(0)
  const statusRef = useRef<EmbeddedPaymentStatus>('idle')
  // The buyer left a pending challenge: a refresh that still says "challenge" must not reopen it.
  const leftChallenge = useRef(false)
  statusRef.current = status
  errorRef.current = error
  // Total the form on screen was created / last updated with, and the update in flight.
  const amountKey = `${amount.amount}|${amount.currency_code}`
  const amountKeyRef = useRef(amountKey)
  amountKeyRef.current = amountKey
  const appliedAmount = useRef<string | null>(null)
  const updating = useRef<Promise<void> | null>(null)
  const remountRequested = useRef(false)
  // A provider-run challenge (Stripe 3DS modal) is in progress: no submit, no total update, no second run.
  const actionRunning = useRef(false)
  const runActionRef = useRef<(action: PaymentAction) => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const storageKey = `sf:pay:attempt:${scope}`
  const store = options.storage === undefined ? safeStorage() : options.storage
  const emit = useCallback((e: PaymentEvent) => live.current.onEvent?.(e), [])

  const readAttempt = useCallback((): string => {
    if (!memOnly.current) {
      try {
        const saved = store?.getItem(storageKey)
        if (saved) {
          memAttempt.current = saved
          return saved
        }
      } catch {
        memOnly.current = true // storage unreadable (blocked): the key lives in memory
      }
    }
    if (memOnly.current && memAttempt.current) return memAttempt.current
    if (!store) {
      if (memAttempt.current) return memAttempt.current
    }
    const fresh = (live.current.newAttemptId ?? generateIdempotencyKey)()
    memAttempt.current = fresh
    try {
      store?.setItem(storageKey, fresh)
      if (store && store.getItem(storageKey) !== fresh) memOnly.current = true
    } catch {
      memOnly.current = true // keep in memory only
    }
    return fresh
  }, [store, storageKey])

  const rotateAttempt = useCallback(() => {
    memAttempt.current = null
    try {
      store?.removeItem(storageKey)
    } catch {
      /* ignore */
    }
    setAttemptId(null)
  }, [store, storageKey])

  const fallback = useCallback(
    (reason: PaymentFallbackReason) => {
      setFallbackReason(reason)
      setStatus('fallback')
      emit({ type: 'form_failed', reason })
      live.current.onFallback?.(reason)
    },
    [emit],
  )

  // Applies a new server total to the form that is on screen: `update` in place; if the provider cannot, ONE queued
  // remount. Never while a charge is in flight (`submit` runs it afterwards) and never two at once.
  const syncAmount = useCallback((): void => {
    const m = form.current
    if (!m || inFlight.current || updating.current || remountRequested.current || actionRunning.current) return
    // The outcome of a charge is unknown: the form (and its single-use token) stays as it is until it is resolved.
    if (statusRef.current === 'network_error' || (statusRef.current === 'blocked' && errorRef.current?.kind === 'payment_in_progress')) return
    if (appliedAmount.current === amountKeyRef.current) return
    const run = (async () => {
      while (form.current === m && alive.current && appliedAmount.current !== amountKeyRef.current) {
        const key = amountKeyRef.current
        try {
          if (!m.update) throw new Error('payment form: update not supported')
          await m.update({ amount: live.current.amount })
          appliedAmount.current = key
        } catch {
          if (form.current === m && alive.current) {
            remountRequested.current = true
            setMountKey((k) => k + 1)
          }
          return
        }
      }
    })().finally(() => {
      updating.current = null
      if (alive.current) syncAmount()
    })
    updating.current = run
  }, [])

  // Mount the provider form ONCE per life of the form (client, container, mount key). A total change does not run this
  // effect: it goes through `syncAmount`. Mounts are queued per container (one at a time, `await unmount` first).
  const kind = client?.kind
  const publicKey = client?.public_key
  useEffect(() => {
    if (!enabled || !client) {
      setStatus((s) => (s === 'loading' || s === 'ready' ? 'idle' : s))
      return
    }
    const adapter = live.current.adapter ?? live.current.adapters?.[client.kind] ?? defaultAdapterFor(client.kind)
    if (!adapter) {
      fallback('unsupported_provider')
      return
    }
    if (!container) return
    remountRequested.current = false
    const my = ++generation.current
    const started = Date.now()
    const abort = new AbortController()
    let mounted: MountedPaymentForm | null = null
    setStatus('loading')
    const stale = () => my !== generation.current || !alive.current
    // Fails this mount once: later callbacks of the same mount are ignored.
    const fail = (reason: PaymentFallbackReason) => {
      if (stale()) return
      generation.current++
      abort.abort()
      clearTimeout(timer)
      const m = mounted ?? form.current
      mounted = null
      form.current = null
      appliedAmount.current = null
      if (m) void Promise.resolve(m.unmount())
      fallback(reason)
    }
    const timer = setTimeout(() => {
      if (statusRef.current !== 'ready') fail('sdk_timeout')
    }, sdkTimeoutMs)

    container.id = containerId
    ;(async () => {
      try {
        await adapter.load(client, { ...(live.current.nonce ? { nonce: live.current.nonce } : {}), timeoutMs: sdkTimeoutMs })
        if (stale()) return
        const theme = live.current.theme ?? readPaymentTheme(container)
        const colorScheme = live.current.colorScheme ?? readPaymentScheme(container)
        const createdWith = amountKeyRef.current
        const m = await mountQueued(
          adapter,
          {
            container,
            client,
            amount: live.current.amount,
            ...(live.current.email ? { email: live.current.email } : {}),
            ...(live.current.locale ? { locale: live.current.locale } : {}),
            theme,
            ...(colorScheme ? { colorScheme } : {}),
            signal: abort.signal,
            onReady: () => {
              if (stale()) return
              clearTimeout(timer)
              setStatus((s) => (s === 'loading' ? 'ready' : s))
              emit({ type: 'form_ready', ms: Date.now() - started })
            },
            onError: (e) => {
              if (stale()) return
              if (e.critical) fail('form_error')
            },
          },
          { createTimeoutMs: live.current.createTimeoutMs ?? sdkTimeoutMs },
        )
        if (stale()) {
          void Promise.resolve(m.unmount())
          return
        }
        mounted = m
        form.current = m
        appliedAmount.current = createdWith
        // The total may have changed while the provider was creating the form.
        syncAmount()
      } catch (err) {
        fail(err instanceof Error && /timeout/i.test(err.message) ? 'sdk_timeout' : 'sdk_error')
      }
    })()

    return () => {
      clearTimeout(timer)
      generation.current++
      abort.abort()
      const m = mounted ?? form.current
      mounted = null
      form.current = null
      appliedAmount.current = null
      if (m) void Promise.resolve(m.unmount())
    }
    // `client` identity changes with every loader run; its identity-defining fields are listed instead.
  }, [enabled, container, kind, publicKey, mountKey, sdkTimeoutMs, containerId])

  // A new server total: update the form in place (or remount once, queued).
  useEffect(() => {
    syncAmount()
  }, [amountKey, syncAmount])

  const finish = useCallback(
    (result: PaymentAttemptResult) => {
      // The provider SDK runs this challenge (Stripe `handleNextAction`), not the page's iframe dialog.
      const action = providerAction(result)
      if (action) {
        void runActionRef.current(action)
        return
      }
      const o = paymentOutcome(result, live.current.locale, live.current.messages)
      pendingData.current = null
      leftChallenge.current = false
      setOutcome(o)
      setError(null)
      setAttemptsLeft(o.attempts_left)
      setStatus(o.kind)
      emit({ type: 'result', status: o.kind, decline_code: o.decline_code })
      if (o.kind === 'approved') rotateAttempt()
      if (o.kind === 'rejected' || o.kind === 'cancelled') {
        // The token is single-use: a new attempt and a fresh form.
        rotateAttempt()
        setMountKey((k) => k + 1)
      }
      live.current.onResult?.(o, result)
      if (o.kind === 'redirect' && o.redirect_url) {
        if (live.current.onRedirect) live.current.onRedirect(o.redirect_url)
        else if (typeof window !== 'undefined') window.location.assign(o.redirect_url)
      }
    },
    [emit, rotateAttempt],
  )

  // Runs a provider-driven challenge (Stripe 3DS) and then asks the SERVER what happened. The SDK's answer is never taken
  // as the outcome: a "completed" 3DS can still be declined, a "failed" one may still be settling. The attempt key is kept.
  // The action (with its client secret) only goes to the adapter: it is not kept in state nor handed to `onResult`.
  const runAction = useCallback(
    async (action: PaymentAction): Promise<void> => {
      if (actionRunning.current) return
      actionRunning.current = true
      const m = form.current
      pendingData.current = null
      leftChallenge.current = false
      setOutcome(null)
      setError(null)
      setStatus('processing')
      let result: 'completed' | 'failed' | 'unsupported' = 'unsupported'
      try {
        if (m?.handleAction) {
          await m.handleAction(action)
          result = 'completed'
        }
      } catch {
        result = 'failed'
      }
      emit({ type: 'provider_action', result })
      try {
        if (!alive.current) return
        const refresh = transport.refresh
        if (refresh) {
          try {
            const r = await refresh({ signal: new AbortController().signal })
            if (!alive.current) return
            if (isResolvedAttempt(r) && !providerAction(r)) {
              actionRunning.current = false
              finish(r)
              return
            }
          } catch {
            /* unknown: verified in the background below */
          }
        }
        // Still unknown: the same "verifying" state as leaving a challenge. No new payment can start; the hook keeps
        // reading `refresh` and only a definitive answer (paid / rejected / expired / cancelled) settles it.
        leftChallenge.current = true
        setError({
          kind: 'payment_in_progress',
          message: live.current.msgs[result === 'completed' ? 'challenge.verifying' : 'challenge.left'],
          retrySameAttempt: false,
          canRetry: false,
        })
        setStatus('blocked')
      } finally {
        actionRunning.current = false
      }
    },
    [emit, finish, transport],
  )
  runActionRef.current = runAction

  const send = useCallback(
    async (data: PayData, attempt: string, total: Money) => {
      const ctl = new AbortController()
      const maxRetries = live.current.autoRetries ?? autoRetries
      for (let n = 0; ; n++) {
        try {
          const result = await transport.submit(
            {
              option: 'card',
              attempt,
              idempotencyKey: attempt,
              provider_data: data.provider_data,
              ...(data.device_session_id ? { device_session_id: data.device_session_id } : {}),
              expected_total: total,
            },
            { signal: ctl.signal },
          )
          if (!alive.current) return
          const action = providerAction(result)
          // Awaited inside the submit: the buyer cannot pay again while the provider's 3DS modal is open.
          if (action) await runActionRef.current(action)
          else finish(result)
          return
        } catch (err) {
          if (!alive.current) return
          const view = paymentErrorView(err, live.current.locale, live.current.messages)
          if (view.retrySameAttempt && n < maxRetries) {
            await sleep((live.current.retryDelayMs ?? retryDelayMs) * 2 ** n)
            if (!alive.current) return
            continue
          }
          emit({ type: 'error', kind: view.kind })
          setError(view)
          if (view.kind === 'network') {
            pendingData.current = { data, total } // memory only, for `retry()` with the same attempt
            setStatus('network_error')
          } else if (view.kind === 'price_mismatch') {
            pendingData.current = null
            rotateAttempt()
            setMountKey((k) => k + 1)
            setStatus('ready')
          } else if (view.kind === 'generic') {
            pendingData.current = null
            rotateAttempt()
            setMountKey((k) => k + 1)
            setStatus('ready')
          } else {
            pendingData.current = null
            setStatus('blocked')
          }
          return
        }
      }
    },
    [autoRetries, emit, finish, retryDelayMs, rotateAttempt, transport],
  )

  const submit = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const m = form.current
    if (!m || (statusRef.current !== 'ready' && statusRef.current !== 'network_error')) return Promise.resolve()
    // Unknown outcome: pressing PAY again must NOT tokenize anew (a new token with the same key is a 409): same data, same key.
    if (statusRef.current === 'network_error' && pendingData.current) return retryRef.current()
    // The total is read when the buyer presses PAY, and travels with the data.
    const total = live.current.amount
    const run = (async () => {
      // A total update in flight finishes first, so the token is made for the form the buyer sees.
      if (updating.current) await updating.current.catch(() => {})
      setStatus('processing')
      setError(null)
      setOutcome(null)
      emit({ type: 'submit' })
      // The form was taken down while it tokenised (critical error -> fallback, payment disabled, remount, page left):
      // whatever it produced is never sent, and the status set by whoever removed it stays (no "ready" over a fallback).
      // Nothing reached the server, so this is not an indeterminate outcome: no key, no charge.
      const withdrawn = () => !alive.current || form.current !== m
      const settle = () => {
        if (alive.current) setStatus((s) => (s === 'processing' ? 'idle' : s))
      }
      let data
      try {
        data = await m.collect()
      } catch {
        if (withdrawn()) return settle()
        emit({ type: 'tokenize_error' })
        setError({ kind: 'generic', message: live.current.msgs['error.card_data'], retrySameAttempt: false, canRetry: true })
        setStatus('ready')
        return
      }
      if (withdrawn()) return settle()
      const attempt = readAttempt()
      setAttemptId(attempt)
      await send(data, attempt, total)
    })().finally(() => {
      inFlight.current = null
      // A total change that arrived during the charge is applied now, after the answer.
      syncAmount()
    })
    inFlight.current = run
    return run
  }, [emit, readAttempt, send, syncAmount])

  const retry = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const pending = pendingData.current
    if (!pending) return submit()
    emit({ type: 'retry' })
    const run = (async () => {
      setStatus('processing')
      setError(null)
      const attempt = readAttempt()
      setAttemptId(attempt)
      await send(pending.data, attempt, pending.total)
    })().finally(() => {
      inFlight.current = null
      syncAmount()
    })
    inFlight.current = run
    return run
  }, [emit, readAttempt, send, submit, syncAmount])
  retryRef.current = retry

  // Poll a pending 3DS challenge / review until it resolves or the window closes.
  useEffect(() => {
    if ((status !== 'challenge' && status !== 'in_review') || !transport.refresh) return
    let stop = false
    const ctl = new AbortController()
    const until = Date.now() + pollTimeoutMs
    ;(async () => {
      while (!stop && Date.now() < until) {
        await sleep(pollIntervalMs)
        if (stop || !alive.current) return
        try {
          const r = await transport.refresh!({ signal: ctl.signal })
          if (stop || !alive.current) return
          if (r.payment.status === 'none') continue
          const o = paymentOutcome(r, live.current.locale, live.current.messages)
          if (o.kind !== status) {
            finish(r)
            return
          }
        } catch {
          /* keep polling until the window closes */
        }
      }
    })()
    return () => {
      stop = true
      ctl.abort()
    }
  }, [status, transport, pollIntervalMs, pollTimeoutMs, finish])

  // Unknown outcome ("verifying"): the answer was lost or the payment is still in progress. Keep reading the payment state
  // with growing waits for about two minutes. Only a RESOLVED answer ends it (paid, rejected, voucher, challenge...);
  // `pending` and `none` do not. The attempt (idempotency key) never changes while this runs.
  const unknownOutcome = status === 'network_error' || (status === 'blocked' && error?.kind === 'payment_in_progress')
  // A total change that arrived while the outcome was unknown is applied once it is resolved.
  useEffect(() => {
    if (!unknownOutcome) syncAmount()
  }, [unknownOutcome, syncAmount])
  useEffect(() => {
    if (!unknownOutcome || !transport.refresh) {
      setVerifying(false)
      return
    }
    let stop = false
    const ctl = new AbortController()
    // After leaving a challenge the bank may take as long as the challenge window itself.
    const until = Date.now() + (leftChallenge.current ? Math.max(verifyTimeoutMs, pollTimeoutMs) : verifyTimeoutMs)
    setVerifying(true)
    ;(async () => {
      let wait = verifyIntervalMs
      while (!stop && Date.now() < until) {
        await sleep(wait)
        wait = Math.min(wait * 2, 15_000)
        if (stop || !alive.current) return
        try {
          const r = await transport.refresh!({ signal: ctl.signal })
          if (stop || !alive.current) return
          if (isResolvedAttempt(r)) {
            // The buyer left the bank page: a still-open challenge is not an answer; keep waiting for the bank's.
            const settled = r.payment.status === 'paid' || r.payment.status === 'failed' || r.payment.status === 'expired' || r.payment.status === 'cancelled'
            if (leftChallenge.current && !settled && r.payment.action?.type === 'challenge') continue
            setVerifying(false)
            finish(r)
            return
          }
        } catch {
          /* still unknown: keep checking until the window closes */
        }
      }
      if (!stop && alive.current) setVerifying(false)
    })()
    return () => {
      stop = true
      ctl.abort()
      setVerifying(false)
    }
  }, [unknownOutcome, transport, verifyTimeoutMs, verifyIntervalMs, pollTimeoutMs, finish])

  const dismiss = useCallback(() => {
    setError(null)
    setOutcome((o) => (o?.kind === 'rejected' ? null : o))
  }, [])

  // Never rotates the attempt: leaving the bank page does not mean the bank did not approve (see the type doc).
  const cancelChallenge = useCallback(() => {
    if (statusRef.current !== 'challenge') return
    leftChallenge.current = true
    setOutcome(null)
    setError({ kind: 'payment_in_progress', message: live.current.msgs['challenge.left'], retrySameAttempt: false, canRetry: false })
    setStatus('blocked')
  }, [])

  // After a rejection the hook remounts the form; the rejection text stays visible via `outcome` until the next submit.
  const message =
    status === 'processing'
      ? msgs['state.processing']
      : status === 'fallback'
        ? msgs['state.fallback']
        : (error?.message ?? outcome?.message ?? (status === 'loading' ? msgs['state.loading'] : null))

  return {
    status,
    message,
    outcome,
    error,
    fallbackReason,
    attemptsLeft,
    attemptId,
    // A pending 3DS challenge / review counts as busy too: no second attempt while one is in the bank's hands.
    busy: status === 'loading' || status === 'processing' || status === 'challenge' || status === 'in_review',
    verifying,
    containerRef: setContainer,
    containerId,
    submit,
    retry,
    dismiss,
    cancelChallenge,
  }
}

export { paymentIdempotencyKey }
