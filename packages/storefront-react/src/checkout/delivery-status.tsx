import { type ReactNode } from 'react'
import { formatMoney, type Money } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import type { QuoteChange } from './auto-quote.js'

export type DeliveryStatusMessages = {
  /** Nothing to quote yet (address incomplete). */
  idle: string
  /** Quote pending or running. */
  quoting: string
  error: string
  retry: string
  /** The destination has no shipping or pickup. */
  noCoverage: string
  /** The shipping price changed after the buyer edited the address; `{to}` and `{from}` are amounts. */
  changed: string
  /** The shipping became free. */
  changedFree: string
}

const ES: DeliveryStatusMessages = {
  idle: 'Escribe tu código postal y calculamos el envío.',
  quoting: 'Calculando envío…',
  error: 'No pudimos calcular el envío. Revisa tu conexión e inténtalo de nuevo.',
  retry: 'Intentar de nuevo',
  noCoverage: 'Por ahora no tenemos envío a ese código postal. Revisa que esté bien escrito.',
  changed: 'Actualizamos tu envío: ahora cuesta {to} (antes {from}).',
  changedFree: 'Actualizamos tu envío: ahora es gratis (antes {from}).',
}
const EN: DeliveryStatusMessages = {
  idle: 'Enter your postal code and we will calculate shipping.',
  quoting: 'Calculating shipping…',
  error: 'We could not calculate shipping. Check your connection and try again.',
  retry: 'Try again',
  noCoverage: 'We do not ship to that postal code yet. Check that it is correct.',
  changed: 'We updated your shipping: it now costs {to} (was {from}).',
  changedFree: 'We updated your shipping: it is now free (was {from}).',
}

export function deliveryStatusMessages(locale?: string | null, overrides?: Partial<DeliveryStatusMessages> | null): DeliveryStatusMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

export type DeliveryStatusState = 'idle' | 'quoting' | 'ready' | 'error' | 'no_coverage'

export type DeliveryStatusProps = {
  state: DeliveryStatusState
  /** From `useAutoQuote().change`: announces a new shipping price. */
  change?: QuoteChange | null
  onRetry?: () => void
  /** Height kept free so the block under it does not jump. Default `1.5rem` (one line). */
  reserve?: string
  renderAmount?: (amount: Money) => ReactNode
  locale?: string
  messages?: Partial<DeliveryStatusMessages>
  classNames?: Partial<Record<'root' | 'spinner' | 'text' | 'error' | 'retry' | 'change', string>>
}

const fill = (tpl: string, vars: Record<string, ReactNode>): ReactNode[] =>
  tpl.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    return key && key in vars ? <strong key={i}>{vars[key]}</strong> : part
  })

/**
 * One line under "Delivery" that says what the automatic quote is doing: waiting for the postal code, calculating
 * (small spinner, no skeleton), failed (with retry), no coverage, or a changed price. A fixed-height box, so nothing
 * shifts. The polite live region is always in the DOM so the change is announced.
 */
export function DeliveryStatus({ state, change, onRetry, reserve = '1.5rem', renderAmount, classNames: cx = {}, ...props }: DeliveryStatusProps) {
  const locale = useResolvedLocale(props.locale)
  const m = deliveryStatusMessages(locale, props.messages)
  const money = (v: Money) => (renderAmount ? renderAmount(v) : formatMoney(v, locale))
  const alert = state === 'error' ? m.error : state === 'no_coverage' ? m.noCoverage : null
  return (
    <div className={cx.root} data-sf-delivery-status={state} style={{ minHeight: reserve }}>
      <p role="status" aria-live="polite" className={cx.text} data-sf-delivery-status-text>
        {state === 'idle' ? m.idle : null}
        {state === 'quoting' ? (
          <>
            <span className={cx.spinner} data-sf-spinner aria-hidden="true" />{m.quoting}
          </>
        ) : null}
        {state === 'ready' && change
          ? fill(Number(change.to.amount) === 0 ? m.changedFree : m.changed, { to: money(change.to), from: money(change.from) })
          : null}
      </p>
      {alert ? (
        <div role="alert" className={cx.error} data-sf-delivery-status-alert>
          <p>{alert}</p>
          {state === 'error' && onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-delivery-retry>
              {m.retry}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
