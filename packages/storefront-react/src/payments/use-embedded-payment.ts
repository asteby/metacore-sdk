import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  generateIdempotencyKey,
  paymentErrorView,
  paymentIdempotencyKey,
  paymentMessages,
  paymentOutcome,
  type Money,
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

export type UseEmbeddedPaymentOptions = {
  /** Provider data from `paymentMethods[].client`. `null`/absent: nothing to mount (status `idle`). */
  client: PaymentClient | null | undefined
  /** The total computed by the server. The Brick is remounted when it changes. Never calculate it in the shop. */
  amount: Money
  transport: PaymentTransport
  /** Mount only while the card option is selected. Default true. */
  enabled?: boolean
  email?: string
  locale?: string
  /** Replaces the adapter chosen from `client.kind`. */
  adapter?: PaymentFormAdapter
  /** Extra adapters by `kind`. Mercado Pago is built in. */
  adapters?: Record<string, PaymentFormAdapter>
  /** CSP nonce for the inserted script. */
  nonce?: string
  /** Time to wait for the form to be ready before falling back. Default 8000. */
  sdkTimeoutMs?: number
  /** Automatic resubmits (same attempt) after a network failure before showing the retry button. Default 2. */
  autoRetries?: number
  /** Base delay for the backoff between automatic retries. Default 600. */
  retryDelayMs?: number
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
  /** Attach to the element the provider renders into. */
  containerRef: (el: HTMLElement | null) => void
  containerId: string
  /** Tokenises and sends. No-ops while another submit is in flight (double click safe). */
  submit: () => Promise<void>
  /** Repeats the last submit with the SAME attempt after a network failure. */
  retry: () => Promise<void>
  /** After a rejection: clears the message (the form is remounted by the hook). */
  dismiss: () => void
}

const DEFAULT_ADAPTERS: Record<string, PaymentFormAdapter> = {}

function defaultAdapterFor(kind: string): PaymentFormAdapter | undefined {
  if (kind === 'mercadopago_bricks') return (DEFAULT_ADAPTERS[kind] ??= mercadoPagoBricksAdapter())
  return undefined
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
    pollTimeoutMs = 60_000,
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

  // Latest props without re-triggering effects.
  const live = useRef({ ...options, msgs })
  live.current = { ...options, msgs }
  const form = useRef<MountedPaymentForm | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const pendingData = useRef<{ provider_data: Record<string, unknown>; device_session_id?: string } | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)
  const statusRef = useRef<EmbeddedPaymentStatus>('idle')
  statusRef.current = status

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
    try {
      const saved = store?.getItem(storageKey)
      if (saved) return saved
    } catch {
      /* private mode */
    }
    const fresh = (live.current.newAttemptId ?? generateIdempotencyKey)()
    try {
      store?.setItem(storageKey, fresh)
    } catch {
      /* keep in memory only */
    }
    return fresh
  }, [store, storageKey])

  const rotateAttempt = useCallback(() => {
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

  // Mount / remount the provider form. Re-runs when the server total, client or mount key changes.
  const amountKey = `${amount.amount}|${amount.currency_code}`
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
    const my = ++generation.current
    const started = Date.now()
    let mounted: MountedPaymentForm | null = null
    setStatus('loading')
    const stale = () => my !== generation.current || !alive.current
    // Fails this mount once: later callbacks of the same mount are ignored.
    const fail = (reason: PaymentFallbackReason) => {
      if (stale()) return
      generation.current++
      clearTimeout(timer)
      const m = mounted ?? form.current
      mounted = null
      form.current = null
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
        const m = await adapter.mount({
          container,
          client,
          amount: live.current.amount,
          ...(live.current.email ? { email: live.current.email } : {}),
          ...(live.current.locale ? { locale: live.current.locale } : {}),
          theme,
          ...(colorScheme ? { colorScheme } : {}),
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
        })
        if (stale()) {
          void Promise.resolve(m.unmount())
          return
        }
        mounted = m
        form.current = m
      } catch (err) {
        fail(err instanceof Error && /timeout/i.test(err.message) ? 'sdk_timeout' : 'sdk_error')
      }
    })()

    return () => {
      clearTimeout(timer)
      generation.current++
      const m = mounted ?? form.current
      mounted = null
      form.current = null
      if (m) void Promise.resolve(m.unmount())
    }
    // `client` identity changes with every loader run; its identity-defining fields are listed instead.
  }, [enabled, container, kind, publicKey, amountKey, mountKey, sdkTimeoutMs, containerId])

  const finish = useCallback(
    (result: PaymentAttemptResult) => {
      const o = paymentOutcome(result, live.current.locale, live.current.messages)
      pendingData.current = null
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

  const send = useCallback(
    async (data: { provider_data: Record<string, unknown>; device_session_id?: string }, attempt: string) => {
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
              expected_total: live.current.amount,
            },
            { signal: ctl.signal },
          )
          if (!alive.current) return
          finish(result)
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
            pendingData.current = data // memory only, for `retry()` with the same attempt
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
    const run = (async () => {
      setStatus('processing')
      setError(null)
      setOutcome(null)
      emit({ type: 'submit' })
      let data
      try {
        data = await m.collect()
      } catch {
        emit({ type: 'tokenize_error' })
        setError({ kind: 'generic', message: live.current.msgs['error.card_data'], retrySameAttempt: false, canRetry: true })
        setStatus('ready')
        return
      }
      const attempt = readAttempt()
      setAttemptId(attempt)
      await send(data, attempt)
    })().finally(() => {
      inFlight.current = null
    })
    inFlight.current = run
    return run
  }, [emit, readAttempt, send])

  const retry = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current
    const data = pendingData.current
    if (!data) return submit()
    emit({ type: 'retry' })
    const run = (async () => {
      setStatus('processing')
      setError(null)
      const attempt = readAttempt()
      setAttemptId(attempt)
      await send(data, attempt)
    })().finally(() => {
      inFlight.current = null
    })
    inFlight.current = run
    return run
  }, [emit, readAttempt, send, submit])

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

  const dismiss = useCallback(() => {
    setError(null)
    setOutcome((o) => (o?.kind === 'rejected' ? null : o))
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
    busy: status === 'loading' || status === 'processing',
    containerRef: setContainer,
    containerId,
    submit,
    retry,
    dismiss,
  }
}

export { paymentIdempotencyKey }
