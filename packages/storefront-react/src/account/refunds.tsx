/** Refunds and payments of an order. Headless (`data-sf-refund-*`, `data-sf-payment-*`, `classNames`). */
import type { PaymentInfo, Refund } from '@asteby/storefront'
import { formatMoney } from '@asteby/storefront'
import { useId } from 'react'
import { enumText, fill } from './orders-messages.js'
import { Hidden, Time, useAccountText, type AccountTextProps } from './orders-ui.js'

export type RefundListClassNames = Partial<Record<'root' | 'title' | 'list' | 'item' | 'amount' | 'status' | 'meta' | 'empty' | 'error' | 'retry', string>>

export type RefundListProps = AccountTextProps & {
  refunds?: readonly Refund[] | null
  /** Show the "no refunds" text when empty (default: render nothing, the usual case). */
  showEmpty?: boolean
  /** The server could not read refunds (`order.degraded`): recoverable error. */
  degraded?: boolean
  onRetry?: () => void
  headingLevel?: 2 | 3 | 4
  classNames?: RefundListClassNames
}

const tone = (s: unknown) => (s === 'completed' ? 'done' : s === 'failed' ? 'problem' : 'current')

export function RefundList({ refunds, showEmpty = false, degraded, onRetry, headingLevel = 3, classNames: cx = {}, ...text }: RefundListProps) {
  const { m, locale, date } = useAccountText(text)
  const titleId = `sf-refunds-${useId().replace(/:/g, '')}`
  const items = (Array.isArray(refunds) ? refunds : []).filter((r): r is Refund => !!r && typeof r === 'object' && typeof r.id === 'string')
  if (!degraded && items.length === 0 && !showEmpty) return null
  const Heading = `h${headingLevel}` as 'h3'
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-refunds>
      <Heading id={titleId} className={cx.title}>
        {m['refund.title']}
      </Heading>
      {degraded ? (
        <div className={cx.error} role="alert" data-sf-section-error="refunds">
          <p>{m['section.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['section.retry']}
              <Hidden> {m['refund.title']}</Hidden>
            </button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <p className={cx.empty}>{m['refund.none']}</p>
      ) : (
        <ul className={cx.list}>
          {items.map((r) => (
            <li key={r.id} className={cx.item} data-sf-refund data-sf-refund-status={typeof r.status === 'string' ? r.status : 'unknown'}>
              <span className={cx.amount} data-sf-refund-amount>
                {formatMoney(r.amount, locale)}
              </span>{' '}
              <span className={cx.status} data-sf-tone={tone(r.status)}>
                {enumText(m, 'refund.status', r.status)}
              </span>
              <span className={cx.meta}>
                {r.method_label ? <> · {r.method_label}</> : null}
                {r.completed_at ? (
                  <>
                    {' · '}
                    <Time value={r.completed_at} text={fill(m['refund.completed'], { date: date(r.completed_at) ?? '' })} />
                  </>
                ) : r.created_at ? (
                  <>
                    {' · '}
                    <Time value={r.created_at} text={fill(m['refund.requested'], { date: date(r.created_at) ?? '' })} />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export type PaymentSummaryProps = AccountTextProps & {
  payments?: readonly PaymentInfo[] | null
  headingLevel?: 2 | 3 | 4
  classNames?: Partial<Record<'root' | 'title' | 'list' | 'item' | 'status' | 'meta', string>>
}

/** What the buyer paid with (card, voucher...) and its status. Renders nothing when the order has no payments. */
export function PaymentSummary({ payments, headingLevel = 3, classNames: cx = {}, ...text }: PaymentSummaryProps) {
  const { m, locale, date } = useAccountText(text)
  const titleId = `sf-payments-${useId().replace(/:/g, '')}`
  const items = (Array.isArray(payments) ? payments : []).filter((p): p is PaymentInfo => !!p && typeof p === 'object' && typeof p.method_label === 'string')
  if (items.length === 0) return null
  const Heading = `h${headingLevel}` as 'h3'
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-payments>
      <Heading id={titleId} className={cx.title}>
        {m['payment.title']}
      </Heading>
      <ul className={cx.list}>
        {items.map((p, i) => (
          <li key={`${p.method_label}-${i}`} className={cx.item} data-sf-payment data-sf-payment-status={typeof p.status === 'string' ? p.status : 'unknown'}>
            <span>{p.method_label}</span> · <span>{formatMoney(p.amount, locale)}</span> ·{' '}
            <span className={cx.status} data-sf-tone={p.status === 'failed' ? 'problem' : p.status === 'paid' ? 'done' : 'current'}>
              {enumText(m, 'payment.status', p.status)}
            </span>
            {p.paid_at ? (
              <span className={cx.meta}>
                {' · '}
                <Time value={p.paid_at} text={fill(m['payment.paidOn'], { date: date(p.paid_at) ?? '' })} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
