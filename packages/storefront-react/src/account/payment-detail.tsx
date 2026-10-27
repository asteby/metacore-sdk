/**
 * The full payment page of an order (`/cuenta/pedidos/:id/pago`): per payment the method, amount, state, date and a
 * masked reference (card brand and last four digits, never more), the refunds when there are any, the cash-voucher link
 * when the payment is still pending (slot) and the order totals. It is the ONLY place that prints these; the order shows
 * `PaymentSummaryCard`. Headless (`data-sf-payment-detail*`, `classNames`).
 */
import type { Order, PaymentInfo, Refund } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { enumText } from './orders-messages.js'
import { OrderTotals, type OrderTotalsProps } from './order-summary.js'
import { paymentLabel, type PaymentLabelOptions } from './payment-method.js'
import { RefundList } from './refunds.js'
import { Time, moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type PaymentDetailClassNames = Partial<Record<'root' | 'section' | 'title' | 'list' | 'row' | 'term' | 'value' | 'status' | 'note' | 'empty' | 'error' | 'retry' | 'totals', string>>

export type PaymentDetailProps = AccountTextProps & {
  order: OrderTotalsProps['order'] & Partial<Pick<Order, 'payments' | 'refunds'>>
  methodLabel?: PaymentLabelOptions['override']
  /** Link/button to the voucher for a pending cash payment, called per pending payment. */
  renderPending?: (payment: PaymentInfo) => ReactNode
  /** Price renderer for the totals. */
  renderMoney?: OrderTotalsProps['renderMoney']
  degraded?: boolean
  refundsDegraded?: boolean
  onRetry?: () => void
  headingLevel?: 2 | 3
  classNames?: PaymentDetailClassNames
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', master: 'Mastercard', amex: 'American Express', american_express: 'American Express', carnet: 'Carnet', discover: 'Discover' }

export function PaymentDetail({ order, methodLabel, renderPending, renderMoney, degraded, refundsDegraded, onRetry, headingLevel = 2, classNames: cx = {}, ...text }: PaymentDetailProps) {
  const { m, t, date, locale } = useAccountText(text)
  const uid = useId().replace(/:/g, '')
  const H = `h${headingLevel}` as 'h2'
  const items = (Array.isArray(order.payments) ? order.payments : []).filter((p): p is PaymentInfo => !!p && typeof p === 'object' && typeof p.method_label === 'string')
  const row = (key: string, term: string, value: ReactNode) =>
    value ? (
      <div key={key} className={cx.row} data-sf-payment-field={key}>
        <dt className={cx.term}>{term}</dt>
        <dd className={cx.value}>{value}</dd>
      </div>
    ) : null
  return (
    <div className={cx.root} data-sf-payment-detail>
      {degraded ? (
        <div className={cx.error} role="alert" data-sf-section-error="payments">
          <p>{m['paymentPage.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['section.retry']}
            </button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <p className={cx.empty} data-sf-payment-empty>
          {m['paymentPage.none']}
        </p>
      ) : (
        items.map((p, i) => {
          const id = `${uid}-p-${i}`
          const last4 = str(p.last4)
          const brandKey = str(p.brand)?.toLowerCase()
          const brand = brandKey ? (BRANDS[brandKey] ?? brandKey.replace(/\b\w/g, (c) => c.toUpperCase())) : null
          const label = paymentLabel(p, m, methodLabel ? { override: methodLabel } : {})
          // The method label already ends in the card's digits when the server knew them: do not say it twice.
          const reference = last4 && !label.includes(last4.slice(-4)) ? `•••• ${last4.slice(-4)}` : null
          const paid = date(p.paid_at)
          return (
            <section key={`${p.method_label}-${i}`} className={cx.section} aria-labelledby={id} data-sf-payment data-sf-payment-status={typeof p.status === 'string' ? p.status : 'unknown'}>
              <H id={id} className={cx.title}>
                {items.length > 1 ? `${m['paymentPage.payment']} ${i + 1}` : m['paymentPage.payment']}
              </H>
              <dl className={cx.list}>
                {row('method', m['paymentPage.method'], label)}
                {row('amount', m['paymentPage.amount'], moneyText(p.amount, locale))}
                {row('status', m['paymentPage.status'], <span className={cx.status} data-sf-tone={p.status === 'failed' ? 'problem' : p.status === 'paid' ? 'done' : 'current'}>{enumText(m, 'payment.status', p.status)}</span>)}
                {row('date', m['paymentPage.date'], paid ? <Time value={p.paid_at} text={paid} /> : null)}
                {row('reference', m['paymentPage.reference'], reference ? (brand ? t('paymentPage.card', { brand, last4: last4!.slice(-4) }) : t('paymentPage.cardNoBrand', { last4: last4!.slice(-4) })) : null)}
              </dl>
              {p.status === 'pending' ? <p className={cx.note}>{m['paymentPage.pendingNote']}</p> : null}
              {p.status === 'pending' && renderPending ? renderPending(p) : null}
            </section>
          )
        })
      )}

      {(order.refunds && order.refunds.length > 0) || refundsDegraded ? (
        <RefundList refunds={order.refunds as readonly Refund[]} degraded={refundsDegraded} onRetry={onRetry} headingLevel={headingLevel} {...text} classNames={{ title: cx.title }} />
      ) : null}

      <section className={cx.totals} aria-labelledby={`${uid}-totals`} data-sf-payment-totals>
        <H id={`${uid}-totals`} className={cx.title}>
          {m['paymentPage.totals']}
        </H>
        <OrderTotals order={order} {...(renderMoney ? { renderMoney } : {})} {...text} classNames={{ root: cx.list, row: cx.row, term: cx.term, value: cx.value }} />
      </section>
    </div>
  )
}
