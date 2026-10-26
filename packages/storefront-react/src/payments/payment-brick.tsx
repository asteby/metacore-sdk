import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatMoney, formatVoucherExpiry, paymentMessages, type Money, type PaymentClient, type PaymentMessages, type PaymentOutcome } from '@asteby/storefront'
import { useModalDialog } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'
import { useEmbeddedPayment, type EmbeddedPaymentState, type UseEmbeddedPaymentOptions } from './use-embedded-payment.js'

export type VoucherCardProps = {
  outcome: PaymentOutcome
  locale?: string
  messages?: Partial<PaymentMessages>
  className?: string
}

/**
 * Cash/SPEI voucher: point, exact amount, reference, barcode/CLABE and deadline, all from the server.
 * The link only renders for https URLs (already filtered by `paymentOutcome`).
 */
export function VoucherCard({ outcome, locale, messages, className }: VoucherCardProps) {
  const v = outcome.voucher
  if (!v) return null
  const m = paymentMessages(locale, messages)
  const expiry = formatVoucherExpiry(v.expires_at, locale, messages)
  return (
    <section className={className} data-sf-voucher aria-labelledby="sf-voucher-title">
      <h3 id="sf-voucher-title">{m['voucher.title']}</h3>
      <dl>
        <div>
          <dt>{m['voucher.point']}</dt>
          <dd>{v.payment_point}</dd>
        </div>
        {v.amount && (
          <div>
            <dt>{m['voucher.amount']}</dt>
            <dd>{formatMoney(v.amount, locale)}</dd>
          </div>
        )}
        <div>
          <dt>{m['voucher.reference']}</dt>
          <dd data-sf-voucher-reference>{v.reference}</dd>
        </div>
        {v.clabe && (
          <div>
            <dt>{m['voucher.clabe']}</dt>
            <dd>{v.clabe}</dd>
          </div>
        )}
        {v.barcode && (
          <div>
            <dt>{m['voucher.barcode']}</dt>
            <dd>{v.barcode}</dd>
          </div>
        )}
      </dl>
      {expiry && <p data-sf-voucher-expiry>{expiry}</p>}
      {v.voucher_url && (
        <p>
          <a href={v.voucher_url} target="_blank" rel="noopener noreferrer">
            {m['voucher.open']}
          </a>
        </p>
      )}
      <p>{m['voucher.email']}</p>
    </section>
  )
}

export type PaymentChallengeProps = {
  outcome: PaymentOutcome
  locale?: string
  messages?: Partial<PaymentMessages>
  /** Replace the default iframe (e.g. mount the provider's status screen). */
  render?: (outcome: PaymentOutcome) => ReactNode
  /**
   * The buyer's emergency exit. The dialog is NOT dismissible (no Esc, no backdrop click) while the payment is in
   * progress; this button only appears after `escapeAfterMs`, so a stuck bank page never traps the buyer (WCAG 2.2.1).
   */
  onCancel?: () => void
  /** How long the dialog stays locked before the exit shows. Default 120000. */
  escapeAfterMs?: number
}

/**
 * 3DS inside the page: a near full-screen modal dialog (`showModal()`: focus trap, inert page) with an accessible title.
 * Esc and backdrop clicks do nothing until the payment ends (the owner unmounts it). Default content is the bank's
 * https iframe. Layout comes from `payments.css` (`dialog[data-sf-challenge]`), overridable with your own CSS.
 */
export function PaymentChallenge({ outcome, locale, messages, render, onCancel, escapeAfterMs = 120_000 }: PaymentChallengeProps) {
  const m = paymentMessages(locale, messages)
  // Esc and backdrop routed to a no-op: the dialog closes only by unmounting.
  const { ref } = useModalDialog({ open: true, onClose: () => {} })
  const [canEscape, setCanEscape] = useState(false)
  // The browser may still close it (a second Esc without user activation, the Android back gesture: close watchers).
  // The page then shows a way back to the bank page instead of leaving the buyer with an invisible challenge.
  const [closed, setClosed] = useState(false)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  const hasCancel = !!onCancel
  useEffect(() => {
    if (!hasCancel) return
    const t = setTimeout(() => setCanEscape(true), escapeAfterMs)
    return () => clearTimeout(t)
  }, [hasCancel, escapeAfterMs])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onClosed = () => setClosed(true)
    el.addEventListener('close', onClosed)
    return () => el.removeEventListener('close', onClosed)
  }, [ref])
  const reopen = () => {
    const el = ref.current
    if (!el) return
    try {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } catch {
      el.setAttribute('open', '')
    }
    setClosed(false)
    el.querySelector<HTMLElement>('[data-sf-autofocus]')?.focus({ preventScroll: true })
  }
  const url = outcome.challenge?.url
  return (
    <>
      {closed && (
        <p role="status" data-sf-challenge-closed>
          {m['state.challenge']}{' '}
          <button type="button" onClick={reopen} data-sf-challenge-reopen style={{ minWidth: 44, minHeight: 44 }}>
            {m['challenge.title']}
          </button>
        </p>
      )}
      <dialog ref={ref} aria-labelledby="sf-challenge-title" data-sf-challenge>
        <div data-sf-challenge-body>
          <h2 id="sf-challenge-title" data-sf-autofocus tabIndex={-1}>
            {m['challenge.title']}
          </h2>
          {render ? (
            render(outcome)
          ) : url ? (
            <iframe src={url} title={m['challenge.title']} data-sf-challenge-frame style={{ width: '100%', minHeight: 420, border: 0 }} />
          ) : (
            <p>{m['state.challenge']}</p>
          )}
          {/* Live region present from the start so the exit is announced when it appears. */}
          {hasCancel && (
            <div data-sf-challenge-escape aria-live="polite">
              {canEscape && (
                <>
                  <p>{m['challenge.escape_hint']}</p>
                  <button type="button" onClick={() => cancelRef.current?.()} style={{ minWidth: 44, minHeight: 44 }}>
                    {m['challenge.escape']}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}

export type PaymentBrickHandle = EmbeddedPaymentState

export type PaymentBrickProps = Omit<UseEmbeddedPaymentOptions, 'amount'> & {
  /** The server's total. Shown on the button and passed to the provider widget. */
  amount: Money
  /** When set, renders the shop's pay button with this label. Otherwise drive it through the ref. */
  submitLabel?: ReactNode
  /** Hide the total next to the label. */
  hideAmountInButton?: boolean
  /** Rendered instead of the built-in voucher card. */
  renderVoucher?: (outcome: PaymentOutcome) => ReactNode
  renderChallenge?: (outcome: PaymentOutcome) => ReactNode
  /** Height reserved for the provider form so the page does not jump. Default 360. */
  minHeight?: number | string
  className?: string
  style?: CSSProperties
}

/**
 * Card form for an embedded payment. Headless: no styles of its own, only `data-*` hooks and CSS variables
 * (`--sf-pay-*`, read for the provider widget; `--sf-pay-min-height` for the reserved height).
 *
 * Accessibility: the container is labelled and `aria-busy` while loading; every message goes through one
 * `role="status"` region (or `role="alert"` for errors, which also takes focus); the button explains why it is
 * busy and never silently disables.
 *
 * Use the `ref` to get the same state the hook returns (`submit`, `retry`, `status`...) when the shop owns the button.
 */
export const PaymentBrick = forwardRef<PaymentBrickHandle, PaymentBrickProps>(function PaymentBrick(props, ref) {
  const { submitLabel, hideAmountInButton, renderVoucher, renderChallenge, minHeight = 360, className, style, ...hookOptions } = props
  const locale = useResolvedLocale(props.locale)
  const state = useEmbeddedPayment({ ...hookOptions, locale })
  useImperativeHandle(ref, () => state)
  const m = paymentMessages(locale, props.messages)
  const alertRef = useRef<HTMLDivElement | null>(null)

  const isError = !!state.error || state.outcome?.kind === 'rejected' || state.status === 'blocked'
  // Move focus to the explanation when a problem appears.
  useEffect(() => {
    if (isError) alertRef.current?.focus()
  }, [isError, state.message])

  if (state.status === 'fallback') {
    return (
      <div className={className} style={style} data-sf-pay-status="fallback">
        <p role="status" data-sf-pay-fallback>
          {m['state.fallback']}
        </p>
      </div>
    )
  }

  const outcome = state.outcome
  const showForm = state.status !== 'approved' && state.status !== 'voucher' && state.status !== 'in_review' && state.status !== 'redirect' && state.status !== 'expired'
  const busy = state.busy
  const total = formatMoney(props.amount, locale)
  const label = state.status === 'processing' ? m['state.processing'] : (submitLabel ?? m['action.pay'])

  return (
    <div className={className} style={style} data-sf-pay-status={state.status}>
      {showForm && (
        <div
          ref={state.containerRef}
          role="group"
          aria-label={m['form.label']}
          aria-busy={state.status === 'loading' || state.status === 'processing'}
          data-sf-pay-container
          style={{ minHeight: `var(--sf-pay-min-height, ${typeof minHeight === 'number' ? `${minHeight}px` : minHeight})` }}
        />
      )}

      {isError ? (
        <div ref={alertRef} role="alert" tabIndex={-1} data-sf-pay-alert data-sf-pay-code={state.error?.kind ?? outcome?.decline_code ?? undefined}>
          {state.message}
          {state.status === 'network_error' && (
            <button type="button" onClick={() => void state.retry()} style={{ minHeight: 44 }}>
              {m['action.retry']}
            </button>
          )}
        </div>
      ) : (
        <p role="status" aria-live="polite" data-sf-pay-message>
          {state.message}
        </p>
      )}

      {outcome?.kind === 'voucher' && (renderVoucher ? renderVoucher(outcome) : <VoucherCard outcome={outcome} locale={locale} {...(props.messages ? { messages: props.messages } : {})} />)}
      {outcome?.kind === 'challenge' && (
        <PaymentChallenge outcome={outcome} locale={locale} onCancel={state.cancelChallenge} {...(props.messages ? { messages: props.messages } : {})} {...(renderChallenge ? { render: renderChallenge } : {})} />
      )}

      {submitLabel !== undefined && showForm && (
        <button
          type="button"
          onClick={() => void state.submit()}
          aria-busy={busy}
          aria-disabled={state.status !== 'ready'}
          data-sf-pay-submit
          style={{ minHeight: 44 }}
        >
          {label}
          {!hideAmountInButton && state.status !== 'processing' && <> · {total}</>}
        </button>
      )}
    </div>
  )
})

export type { PaymentClient }
