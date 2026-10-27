/**
 * The pieces of the order page that are only a SUMMARY: the three compact cards (shipping, invoice, payment), each with
 * a couple of key lines and ONE link to its own full page (`ShipmentDetail`, `InvoiceDetail`, `PaymentDetail`); the
 * compact header shared by the order and its sub-pages; the order totals; and the single sandbox ("test mode") band.
 * Headless (`data-sf-*`, `classNames`). Rule: a fact lives in ONE place. The cards never repeat what their page shows
 * (no address, timeline, folio, downloads or card digits) and a sandbox notice is the band's job, not the cards'.
 */
import type { InvoiceDoc, InvoiceSummary, Money, Order, OrderShippingService, PaymentInfo, Shipment } from '@asteby/storefront'
import { isTestInvoice, isTestShipment, orderShipments } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { enumText, fill } from './orders-messages.js'
import { paymentLabel, type PaymentLabelOptions } from './payment-method.js'
import { OrderStatusBadge } from './progress.js'
import { orderShippingService, shippingServiceEta } from './shipping-service.js'
import { Time, moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type OrderSummaryCardClassNames = Partial<Record<'root' | 'header' | 'title' | 'mark' | 'badge' | 'body' | 'primary' | 'line' | 'note' | 'footer' | 'link', string>>

type CardBase = AccountTextProps & {
  /** The full page this card summarizes. Without it the card has no link. */
  href?: string | null | undefined
  headingLevel?: 2 | 3 | 4
  classNames?: OrderSummaryCardClassNames
}

function Card({ kind, titleText, linkText, linkLabel, href, level, cx, badge, mark, children, footer }: { kind: string; titleText: string; linkText: string; linkLabel: string; href?: string | null | undefined; level: 2 | 3 | 4; cx: OrderSummaryCardClassNames; badge?: ReactNode; mark?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  const id = `sf-sum-${useId().replace(/:/g, '')}`
  const Heading = `h${level}` as 'h2'
  return (
    <section className={cx.root} aria-labelledby={id} data-sf-summary-card={kind}>
      <header className={cx.header}>
        {mark ? <span className={cx.mark}>{mark}</span> : null}
        <Heading id={id} className={cx.title}>
          {titleText}
        </Heading>
        {badge}
      </header>
      <div className={cx.body}>{children}</div>
      {href || footer ? (
        <p className={cx.footer}>
          {href ? (
            <a href={href} className={cx.link} aria-label={linkLabel} data-sf-summary-link>
              {linkText}
            </a>
          ) : null}
          {footer}
        </p>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- shipping */

export type ShipmentSummaryCardProps = CardBase & {
  order: Pick<Order, 'delivery_method' | 'shipping_service' | 'shipping_method'> & Partial<Pick<Order, 'shipments' | 'progress' | 'number'>>
  /** Carrier mark slot (`<BrandMark ... />` from `/checkout`). */
  renderCarrierMark?: (service: OrderShippingService) => ReactNode
  /** The server could not read the shipments (`order.degraded`). */
  degraded?: boolean
}

/** Carrier and service, the estimate and where the package is, with one link to the shipping page. Nothing for a pickup order. */
export function ShipmentSummaryCard({ order, href, headingLevel = 2, renderCarrierMark, degraded, classNames: cx = {}, ...text }: ShipmentSummaryCardProps) {
  const { m, t, date } = useAccountText(text)
  const svc = orderShippingService(order)
  const live = orderShipments({ shipments: order.shipments }).filter((s) => s.kind !== 'return')
  if (order.delivery_method === 'pickup' || (!svc && live.length === 0 && !degraded)) return null
  const real = live.filter((s) => !isTestShipment(s))
  const carrier = str(svc?.carrier) ?? str(real[0]?.carrier) ?? str(live[0]?.carrier)
  const name = str(svc?.title) ?? carrier
  const eta = svc ? shippingServiceEta(svc, m as unknown as Record<string, string>) : null
  const last: Shipment | undefined = real[real.length - 1]
  const promised = last && last.status !== 'delivered' ? date(last.promised_by) : null
  const status = last ? enumText(m, 'shipment.status', last.status) : live.length > 0 ? m['shipment.preparing'] : m['summary.shipment.preparing']
  return (
    <Card kind="shipment" titleText={m['summary.shipment.title']} linkText={m['order.viewDetail']} linkLabel={m['summary.shipment.view']} href={href} level={headingLevel} cx={cx} mark={svc && renderCarrierMark && (carrier || str(svc.carrier_logo_key)) ? renderCarrierMark(svc) : null} badge={<span className={cx.badge} data-sf-summary-state>{status}</span>}>
      {name ? (
        <p className={cx.primary} data-sf-summary-primary>
          {name}
        </p>
      ) : null}
      {promised ? (
        <p className={cx.line}>{t('shipment.promised', { date: promised })}</p>
      ) : eta ? (
        <p className={cx.line}>{eta}</p>
      ) : null}
      {degraded ? (
        <p className={cx.note} role="status">
          {m['summary.shipment.error']}
        </p>
      ) : null}
    </Card>
  )
}

/* ----------------------------------------------------------------- invoice */

export type InvoiceSummaryCardProps = CardBase & {
  invoices?: readonly InvoiceDoc[] | null
  /** The order's `invoice` summary, used while there is no document. */
  summary?: InvoiceSummary | null
  /** Page to request an invoice (default `href`). */
  requestHref?: string | null | undefined
  degraded?: boolean
}

/** The invoice in one line (folio, state, date and total) with «Ver factura»; or what to do when there is none. No downloads here. */
export function InvoiceSummaryCard({ invoices, summary, href, requestHref, degraded, headingLevel = 2, classNames: cx = {}, ...text }: InvoiceSummaryCardProps) {
  const { m, t, date, locale } = useAccountText(text)
  const docs = (Array.isArray(invoices) ? invoices : []).filter((d): d is InvoiceDoc => !!d && typeof d === 'object' && typeof d.id === 'string')
  const main = docs.filter((d) => d.kind !== 'credit_note')
  const doc = main[0] ?? docs[0]
  const base = { kind: 'invoice', titleText: m['summary.invoice.title'], level: headingLevel, cx } as const
  if (degraded && !doc) {
    return (
      <Card {...base} linkText="" linkLabel="">
        <p className={cx.note} role="status">
          {m['section.error']}
        </p>
      </Card>
    )
  }
  if (doc) {
    const name = [str(doc.series), str(doc.folio_number)].filter(Boolean).join('-')
    const total = moneyText(doc.total, locale)
    const issued = date(doc.issued_at)
    const more = docs.length - 1
    return (
      <Card {...base} linkText={m['summary.invoice.view']} linkLabel={fill(m['invoice.viewOf'], { kind: (doc.kind === 'credit_note' ? m['invoice.creditNote'] : m['invoice.invoice']).toLowerCase(), name: name || str(doc.folio) || '' }).replace(/\s+/g, ' ').trim()} href={href} badge={<span className={cx.badge} data-sf-summary-state>{enumText(m, 'invoice.status', doc.status)}</span>}>
        <p className={cx.primary} data-sf-summary-primary>
          {doc.kind === 'credit_note' ? m['invoice.creditNote'] : m['invoice.invoice']}
          {name ? <> {name}</> : null}
        </p>
        <p className={cx.line}>
          {issued ? <Time value={doc.issued_at} text={t('invoice.issued', { date: issued })} /> : null}
          {issued && total ? ' · ' : null}
          {total ?? null}
          {more > 0 ? <> · {t('summary.invoice.more', { n: more })}</> : null}
        </p>
      </Card>
    )
  }
  const stage = summary?.stage
  const blocked = summary?.blocked_reason
  const target = requestHref ?? href
  if (summary && (stage === 'requested' || stage === 'processing' || stage === 'needs_review')) {
    return (
      <Card {...base} linkText={m['summary.invoice.view']} linkLabel={m['summary.invoice.view']} href={href}>
        <p className={cx.line}>{m['summary.invoice.processing']}</p>
      </Card>
    )
  }
  if (summary?.can_request === false || stage === 'awaiting_payment') {
    return (
      <Card {...base} linkText="" linkLabel="">
        <p className={cx.line}>{blocked === 'window_closed' || blocked === 'not_invoiceable' ? m['summary.invoice.unavailable'] : m['summary.invoice.awaiting']}</p>
      </Card>
    )
  }
  return (
    <Card {...base} linkText={m['summary.invoice.request']} linkLabel={m['summary.invoice.request']} href={target}>
      <p className={cx.line}>{m['summary.invoice.none']}</p>
    </Card>
  )
}

/* ----------------------------------------------------------------- payment */

export type PaymentSummaryCardProps = CardBase & {
  payments?: readonly PaymentInfo[] | null
  methodLabel?: PaymentLabelOptions['override']
}

/** What was paid with, how much and its state, with one link to the payment page. */
export function PaymentSummaryCard({ payments, href, headingLevel = 2, methodLabel, classNames: cx = {}, ...text }: PaymentSummaryCardProps) {
  const { m, t, date, locale } = useAccountText(text)
  const items = (Array.isArray(payments) ? payments : []).filter((p): p is PaymentInfo => !!p && typeof p === 'object' && typeof p.method_label === 'string')
  const p = items[0]
  if (!p) return null
  const amount = moneyText(p.amount, locale)
  const paid = date(p.paid_at)
  const label = paymentLabel(p, m, methodLabel ? { override: methodLabel } : {})
  return (
    <Card kind="payment" titleText={m['summary.payment.title']} linkText={m['order.viewDetail']} linkLabel={m['summary.payment.view']} href={href} level={headingLevel} cx={cx} badge={<span className={cx.badge} data-sf-summary-state data-sf-tone={p.status === 'failed' ? 'problem' : p.status === 'paid' ? 'done' : 'current'}>{enumText(m, 'payment.status', p.status)}</span>}>
      <p className={cx.primary} data-sf-summary-primary>
        {label}
      </p>
      <p className={cx.line}>
        {amount}
        {amount && paid ? ' · ' : null}
        {paid ? <Time value={p.paid_at} text={t('payment.paidOn', { date: paid })} /> : null}
        {items.length > 1 ? <> · {t('summary.invoice.more', { n: items.length - 1 })}</> : null}
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------------ header */

export type OrderPageHeaderProps = AccountTextProps & {
  order: Pick<Order, 'id' | 'number' | 'created_at'> & Partial<Pick<Order, 'status' | 'progress' | 'shipments' | 'invoices' | 'payments'>>
  /** The page title (`Pedido SO-00008` on the order, `Envío` / `Factura` / `Pago` on its pages). Default: the order number. */
  title?: string
  /** Back link to the order (sub-pages) as a breadcrumb: «← Pedido SO-00008». */
  backHref?: string | null
  /** A back link of your own (the order page goes to the orders list). */
  backLabel?: string
  classNames?: Partial<Record<'root' | 'back' | 'title' | 'meta' | 'badge', string>>
}

/** Breadcrumb, title, `Pedido SO-00008 · date` and the ONE status badge. The same on the order and on its sub-pages. */
export function OrderPageHeader({ order, title, backHref, backLabel, classNames: cx = {}, ...text }: OrderPageHeaderProps) {
  const { t, date } = useAccountText(text)
  const number = str(order.number) ?? order.id.slice(0, 8)
  const placed = date(order.created_at)
  const label = backLabel ?? t('order.backToOrder', { number })
  return (
    <header className={cx.root} data-sf-order-header>
      {backHref ? (
        <nav aria-label={label}>
          <a href={backHref} className={cx.back}>
            {label}
          </a>
        </nav>
      ) : null}
      <h1 className={cx.title}>{title ?? t('order.number', { number })}</h1>
      <p className={cx.meta}>
        {title ? <>{t('order.number', { number })} · </> : null}
        {placed ? <Time value={order.created_at} text={t('order.placed', { date: placed })} /> : null}{' '}
        <OrderStatusBadge order={order as Order} {...text} className={cx.badge} />
      </p>
    </header>
  )
}

/** The single "test mode" band: say it once per page, never inside the cards. */
export function OrderSandboxNotice({ className, ...text }: AccountTextProps & { className?: string }) {
  const { m } = useAccountText(text)
  return (
    <p role="note" className={className} data-sf-sandbox-notice>
      <strong>{m['order.sandboxTitle']}</strong> {m['order.sandboxBody']}
    </p>
  )
}

/** True when anything in the order is a sandbox shipment or invoice. */
export function isSandboxOrder(order: Partial<Pick<Order, 'shipments' | 'invoices'>>): boolean {
  return (order.shipments ?? []).some(isTestShipment) || (order.invoices ?? []).some(isTestInvoice)
}

/* ------------------------------------------------------------------ totals */

export type OrderTotalsProps = AccountTextProps & {
  order: Pick<Order, 'total'> & Partial<Pick<Order, 'subtotal' | 'discount' | 'shipping' | 'tax' | 'tax_included'>>
  classNames?: Partial<Record<'root' | 'row' | 'term' | 'value' | 'total', string>>
  /** Price renderer (default: `Intl` through the order's currency). */
  renderMoney?: (money: Money) => ReactNode
}

/** Subtotal, discount, shipping, taxes and total as a `<dl>`. */
export function OrderTotals({ order, renderMoney, classNames: cx = {}, ...text }: OrderTotalsProps) {
  const { m, locale } = useAccountText(text)
  const show = (v: Money) => (renderMoney ? renderMoney(v) : moneyText(v, locale))
  const rows: { key: string; label: string; value: Money }[] = [
    order.subtotal && { key: 'subtotal', label: m['totals.subtotal'], value: order.subtotal },
    order.discount && Number(order.discount.amount) > 0 && { key: 'discount', label: m['totals.discount'], value: order.discount },
    order.shipping && { key: 'shipping', label: m['totals.shipping'], value: order.shipping },
    order.tax && !order.tax_included && { key: 'tax', label: m['totals.tax'], value: order.tax },
  ].filter(Boolean) as never
  return (
    <dl className={cx.root} data-sf-order-totals>
      {rows.map((r) => (
        <div key={r.key} className={cx.row} data-sf-total={r.key}>
          <dt className={cx.term}>{r.label}</dt>
          <dd className={cx.value}>{show(r.value)}</dd>
        </div>
      ))}
      <div className={cx.total ?? cx.row} data-sf-total="total" data-total="">
        <dt className={cx.term}>{order.tax_included ? m['totals.totalTaxIncluded'] : m['totals.total']}</dt>
        <dd className={cx.value}>{show(order.total)}</dd>
      </div>
    </dl>
  )
}
