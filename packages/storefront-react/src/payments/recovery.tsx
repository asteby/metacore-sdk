/**
 * What the buyer sees when a card payment does not end well, and the state behind it.
 *
 * `usePaymentRecovery()` keeps the notice, a counter of form failures (the secure form is mounted again by itself a
 * couple of times before bothering the buyer) and the `sectionKey` that remounts the whole payment section for a new
 * attempt. `<PaymentRecovery>` draws the notice: it never leaves an empty panel, it always says what happened and what
 * comes next, and a merchant-side failure never blames the buyer.
 *
 * Rule: a NEW idempotency key is only started after a DEFINITIVE failure. While the outcome is unknown (confirming,
 * verifying, transient) `retry()` does nothing: the same attempt is checked or repeated by the transport.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PayChoice } from './choices.js'
import { paymentMethodMessages } from './payment-method.messages.js'
import { paymentRecoveryMessages, type PaymentNoticeKind, type PaymentRecoveryMessages } from './recovery-messages.js'
import type { PaymentIssue } from './resilient-transport.js'
import type { PaymentEvent } from './use-embedded-payment.js'
import { useResolvedLocale } from '../locale.js'

export type PaymentNotice = { kind: PaymentNoticeKind }

/** Payment rows other than the in-page card: what the buyer can switch to. */
export function alternativeChoices(choices: readonly PayChoice[]): PayChoice[] {
  return choices.filter((c) => c.mode !== 'card')
}

/** Selects a payment row in the page form (the section's radios are the source of truth) and brings it into view. */
export function pickChoice(form: HTMLFormElement | null | undefined, value: string): void {
  const input = Array.from(form?.querySelectorAll<HTMLInputElement>('input[name="payment_choice"]') ?? []).find((i) => i.value === value)
  if (!input) return
  input.click()
  input.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
}

const INDETERMINATE = new Set(['confirming', 'verifying', 'transient', 'in_progress'])

export type UsePaymentRecoveryOptions = {
  /** Same `scope` as the payment section (usually the cart id): where the attempt key is kept. */
  scope?: string
  /** Where the attempt key lives. Default `sessionStorage`; `null` = memory only. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Automatic remounts of the secure form before showing the "form failed" notice. Default 2. */
  formAutoRetries?: number
  /** The shop is closed (409 `store_not_ready`) or the like: re-read the page data. */
  onRevalidate?: () => void
}

export type PaymentRecoveryState = {
  notice: PaymentNotice | null
  setNotice: (notice: PaymentNotice | null) => void
  /** Use as `key` of `<PaymentMethodSection>`: a new value mounts a fresh section (and a fresh card form). */
  sectionKey: number
  /** Pass to `createResilientTransport({ onIssue })`. */
  onIssue: (issue: PaymentIssue | null) => void
  /** Pass to `<PaymentMethodSection onEvent>` (or compose it with your own handler). */
  onEvent: (event: PaymentEvent) => void
  /** Last problem reported by the transport. */
  lastIssue: { current: PaymentIssue | null }
  /**
   * New attempt: a NEW idempotency key and a fresh form. Only after a definitive failure; returns `false` (and does
   * nothing) while the outcome of the last charge is still unknown.
   */
  retry: () => boolean
  /** Clears the notice (e.g. after the buyer picked another way to pay). */
  clear: () => void
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

export function usePaymentRecovery(options: UsePaymentRecoveryOptions = {}): PaymentRecoveryState {
  const { scope = 'default', formAutoRetries = 2 } = options
  const [notice, setNotice] = useState<PaymentNotice | null>(null)
  const [sectionKey, setSectionKey] = useState(0)
  const formFailures = useRef(0)
  const lastIssue = useRef<PaymentIssue | null>(null)
  const live = useRef(options)
  live.current = options

  const onIssue = useCallback((issue: PaymentIssue | null) => {
    lastIssue.current = issue
    if (!issue) return setNotice((n) => (n?.kind === 'confirming' ? null : n))
    if (issue.kind === 'confirming' || issue.kind === 'verifying') return setNotice({ kind: 'confirming' })
    if (issue.kind === 'merchant_config' || issue.kind === 'stale_checkout' || issue.kind === 'provider_declined') return setNotice({ kind: issue.kind })
    if (issue.kind === 'other') return setNotice({ kind: 'other' })
    // Transient (the transport keeps the same attempt), in progress, rate limit, expired, price change: the form explains it.
    setNotice((n) => (n?.kind === 'confirming' ? null : n))
  }, [])

  const retry = useCallback((): boolean => {
    const issue = lastIssue.current
    if (issue && INDETERMINATE.has(issue.kind)) return false
    const store = live.current.storage === undefined ? safeStorage() : live.current.storage
    try {
      store?.removeItem(`sf:pay:attempt:${live.current.scope ?? 'default'}`)
    } catch {
      /* no storage: the hook makes a new key in memory */
    }
    formFailures.current = 0
    lastIssue.current = null
    setNotice(null)
    setSectionKey((k) => k + 1)
    return true
  }, [])

  const onEvent = useCallback(
    (e: PaymentEvent) => {
      if (e.type === 'form_ready') {
        formFailures.current = 0
        setNotice((n) => (n?.kind === 'form_failed' ? null : n))
      }
      // The secure form did not load: it is mounted again by itself (limited) and, if it still fails, the notice appears.
      if (e.type === 'form_failed') {
        if (formFailures.current < formAutoRetries) {
          formFailures.current += 1
          setSectionKey((k) => k + 1)
        } else {
          setNotice({ kind: 'form_failed' })
        }
      }
      if (e.type === 'result' && e.status === 'rejected') setNotice({ kind: 'rejected' })
      // Only a closed store asks to re-read the page; an order already converted is explained by the notice.
      if (e.type === 'error' && lastIssue.current?.kind === 'store_closed') live.current.onRevalidate?.()
    },
    [formAutoRetries],
  )

  return useMemo(() => ({ notice, setNotice, sectionKey, onIssue, onEvent, lastIssue, retry, clear: () => setNotice(null) }), [notice, sectionKey, onIssue, onEvent, retry])
}

export type PaymentRecoveryClassNames = Partial<Record<'root' | 'title' | 'body' | 'actions' | 'primary' | 'secondary', string>>

export type PaymentRecoveryProps = {
  notice: PaymentNotice | null
  /** Other ways to pay (`alternativeChoices(choices)`); they come from the published choices, never from this component. */
  alternatives?: readonly PayChoice[]
  /** "Retry payment": new key and fresh form (`usePaymentRecovery().retry`). */
  onRetry: () => void
  /** A way to pay was picked. */
  onPick: (choice: PayChoice) => void
  /** "Refresh my order": re-read the cart and checkout. */
  onRefresh: () => void
  locale?: string
  messages?: Partial<PaymentRecoveryMessages>
  /** Text of the button of an alternative. Default: the `action.alternative` message with the row name. */
  alternativeLabel?: (choice: PayChoice) => string
  classNames?: PaymentRecoveryClassNames
  testIds?: Partial<Record<'retry' | 'refresh', string>>
  /** Extra content after the buttons. */
  children?: ReactNode
}

/** Notice of a card payment that did not end well. `role="status"` while confirming, `role="alert"` (focused) otherwise. */
export function PaymentRecovery(props: PaymentRecoveryProps) {
  const { notice, alternatives = [], onRetry, onPick, onRefresh, alternativeLabel, classNames: cx = {}, testIds = {}, children } = props
  const locale = useResolvedLocale(props.locale)
  const m = useMemo(() => paymentRecoveryMessages(locale, props.messages), [locale, props.messages])
  const rowNames = useMemo(() => paymentMethodMessages(locale).options, [locale])
  const ref = useRef<HTMLDivElement>(null)
  const kind = notice?.kind
  useEffect(() => {
    if (kind && kind !== 'confirming') {
      ref.current?.focus()
      ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
  }, [kind])
  if (!notice) return null
  const confirming = notice.kind === 'confirming'
  const canRetry = notice.kind !== 'confirming' && notice.kind !== 'stale_checkout'
  const showAlternatives = notice.kind !== 'stale_checkout' && !confirming && alternatives.length > 0
  // When the merchant cannot take cards, the other ways to pay are the main action.
  const alternativesFirst = notice.kind === 'merchant_config'
  const nameOf = (c: PayChoice) => c.label ?? (c.option ? rowNames[c.option] : undefined) ?? c.option ?? c.methodKey
  const labelOf = (c: PayChoice) => alternativeLabel?.(c) ?? m['action.alternative'].replace('{label}', nameOf(c))
  const retryButton = canRetry ? (
    <button type="button" className={alternativesFirst ? cx.secondary : cx.primary} onClick={onRetry} style={{ minHeight: 44 }} data-sf-pay-retry {...(testIds.retry ? { 'data-testid': testIds.retry } : {})}>
      {notice.kind === 'form_failed' ? m['action.retry_form'] : m['action.retry']}
    </button>
  ) : null
  return (
    <div ref={ref} tabIndex={-1} role={confirming ? 'status' : 'alert'} aria-live={confirming ? 'polite' : undefined} className={cx.root} data-sf-pay-recovery={notice.kind}>
      <p className={cx.title}>
        <strong>{m[`notice.${notice.kind}.title`]}</strong>
      </p>
      <p className={cx.body}>{m[`notice.${notice.kind}.body`]}</p>
      {!confirming ? (
        <div className={cx.actions}>
          {alternativesFirst ? null : retryButton}
          {notice.kind === 'stale_checkout' ? (
            <button type="button" className={cx.primary} onClick={onRefresh} style={{ minHeight: 44 }} data-sf-pay-refresh {...(testIds.refresh ? { 'data-testid': testIds.refresh } : {})}>
              {m['action.refresh']}
            </button>
          ) : null}
          {showAlternatives
            ? alternatives.map((c) => (
                <button key={c.value} type="button" className={alternativesFirst ? cx.primary : cx.secondary} onClick={() => onPick(c)} style={{ minHeight: 44 }} data-sf-pay-alternative={c.value}>
                  {labelOf(c)}
                </button>
              ))
            : null}
          {alternativesFirst ? retryButton : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}
