/**
 * Cash voucher of a payment that is still waiting (OXXO, SPEI, deposit): reference / CLABE with a copy button, the
 * Code 128 barcode drawn as SVG, the expiry, and print / download. Ported from the ProtekAuto store (#84) so no store
 * keeps its own copy. Headless (`data-sf-voucher-*`, `classNames`), texts es/en.
 *
 * Print / download: pass `voucherHref` to serve the voucher from YOUR server route (`pendingVoucherResponse` in
 * `/account/server`, the right choice for the account page: ownership is re-checked on each request), or leave it out
 * and the card builds the document in the browser from the data it already has (thank-you page: guests have no
 * account to go back to). The document generator is a separate chunk, fetched only when the buyer taps.
 */
import { PendingButton } from '../ui/pending-button.js'
import { useActionLock } from '../ui/use-action-lock.js'
import type { PendingPayment } from '@asteby/storefront'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { enumText, fill } from './orders-messages.js'
import { CopyButton, Hidden, Time, moneyText, useAccountText, type AccountTextProps } from './orders-ui.js'
import { barcodeGeometry, voucherOf, type BarcodeFormat } from './voucher.js'

export type BarcodeProps = { value: string; label: string; height?: number; className?: string; /** Symbology (default Code 128). */ format?: BarcodeFormat }

/** Code 128 as an inline `<svg role="img">` (no HTML injection). `null` when the value cannot be encoded. */
export function Barcode({ value, label, height = 56, className, format }: BarcodeProps) {
  const g = useMemo(() => barcodeGeometry(value, { height, ...(format ? { format } : {}) }), [value, height, format])
  if (!g) return null
  return (
    <svg className={className} viewBox={`0 0 ${g.width} ${g.height}`} width={g.width} height={g.height} role="img" aria-label={label} shapeRendering="crispEdges" fill="#000" data-sf-voucher-barcode-svg>
      {g.rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={g.height} />
      ))}
    </svg>
  )
}

export type PendingPaymentCardClassNames = Partial<
  Record<'root' | 'header' | 'method' | 'badge' | 'field' | 'label' | 'value' | 'barcode' | 'expiry' | 'total' | 'note' | 'actions' | 'primary' | 'secondary', string>
>

export type PendingPaymentCardProps = AccountTextProps & {
  payment: PendingPayment
  /**
   * Server route that serves the voucher: `(payment, { download, format })`. The "view and print" link asks for
   * `{ download: false, format: 'html' }`, the download link for `{ download: true, format: 'pdf' }` (a store whose
   * route predates `format` keeps serving the HTML attachment). Without it the browser builds the documents.
   */
  voucherHref?: (payment: PendingPayment, opts: { download: boolean; format: 'html' | 'pdf' }) => string
  /** Store name printed on the document built in the browser. */
  shopName?: string
  headingLevel?: 2 | 3 | 4
  classNames?: PendingPaymentCardClassNames
  children?: ReactNode
}

async function downloadPdf(payment: PendingPayment, opts: { locale: string; shopName?: string | undefined; timeZone?: string | undefined }) {
  const v = voucherOf(payment)
  if (!v) return
  const { renderVoucherPdf } = await import('./voucher-pdf.js')
  const bytes = renderVoucherPdf(v, { locale: opts.locale, ...(opts.shopName ? { shopName: opts.shopName } : {}), ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) })
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'ficha-de-pago.pdf'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function openDocument(payment: PendingPayment, mode: 'print' | 'download', opts: { locale: string; shopName?: string | undefined; timeZone?: string | undefined }) {
  const v = voucherOf(payment)
  if (!v) return
  const { renderVoucherDocument } = await import('./voucher-document.js')
  const html = renderVoucherDocument(v, { locale: opts.locale, ...(opts.shopName ? { shopName: opts.shopName } : {}), ...(opts.timeZone ? { timeZone: opts.timeZone } : {}), printButton: mode === 'print', autoPrint: mode === 'print' })
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const download = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = 'ficha-de-pago.html'
    a.click()
  }
  if (mode === 'print') {
    // (`noopener` in the features would make `open` return null, which is how a blocked pop-up is told apart.)
    const w = window.open(url, '_blank')
    if (w) w.opener = null
    else download()
  } else download()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function PendingPaymentCard({ payment, voucherHref, shopName, headingLevel = 3, classNames: cx = {}, children, ...text }: PendingPaymentCardProps) {
  const { m, t, date, locale, timeZone } = useAccountText(text)
  const titleId = `sf-voucher-${useId().replace(/:/g, '')}`
  const lock = useActionLock()
  const [which, setWhich] = useState<'print' | 'download' | null>(null)
  const v = voucherOf(payment)
  if (!v) return null
  const expired = payment.status === 'expired'
  const Heading = `h${headingLevel}` as 'h3'
  const code = v.barcode
  const methodLabel = enumText(m, 'pending.method', v.method?.toLowerCase())
  const total = moneyText(payment.total, locale) ?? moneyText(v.amount, locale)
  const copyValue = v.reference ?? v.clabe
  const expires = date(v.expires_at ?? payment.expires_at, 'datetime')

  return (
    <article className={cx.root} aria-labelledby={titleId} data-sf-voucher data-sf-voucher-status={expired ? 'expired' : 'pending_payment'}>
      <header className={cx.header}>
        <Heading id={titleId} className={cx.method} data-sf-voucher-method>
          {methodLabel}
        </Heading>
        <span className={cx.badge} data-sf-voucher-badge data-sf-tone={expired ? 'muted' : 'current'}>
          {expired ? m['pending.expired'] : m['pending.waiting']}
        </span>
      </header>
      {v.reference ? (
        <div className={cx.field} data-sf-voucher-reference>
          <p className={cx.label}>{m['pending.reference']}</p>
          <p className={cx.value} data-sf-voucher-value>
            {v.reference}
          </p>
        </div>
      ) : null}
      {v.beneficiary ? (
        <div className={cx.field} data-sf-voucher-beneficiary>
          <p className={cx.label}>{m['pending.beneficiary']}</p>
          <p className={cx.value} data-sf-voucher-value>
            {v.beneficiary}
          </p>
        </div>
      ) : null}
      {v.bank ? (
        <div className={cx.field} data-sf-voucher-bank>
          <p className={cx.label}>{m['pending.bank']}</p>
          <p className={cx.value} data-sf-voucher-value>
            {v.bank}
          </p>
        </div>
      ) : null}
      {v.clabe ? (
        <div className={cx.field} data-sf-voucher-clabe>
          <p className={cx.label}>{m['pending.clabe']}</p>
          <p className={cx.value} data-sf-voucher-value>
            {v.clabe}
          </p>
        </div>
      ) : null}
      {v.barcode_text && !expired ? (
        <div className={cx.field} data-sf-voucher-code>
          <p className={cx.label}>{m['pending.code']}</p>
          <p className={cx.value} data-sf-voucher-value>
            {v.barcode_text}
          </p>
        </div>
      ) : null}
      {code && !expired ? (
        <div className={cx.barcode} data-sf-voucher-barcode>
          <Barcode value={code} format={v.barcode_format ?? 'code128'} label={fill(m['pending.barcode'], { code })} />
        </div>
      ) : null}
      {expires ? (
        <p className={cx.expiry} data-sf-voucher-expiry>
          <Time value={v.expires_at ?? payment.expires_at} text={fill(m[expired ? 'pending.expiredOn' : 'pending.expires'], { date: expires })} />
        </p>
      ) : null}
      {total ? (
        <p className={cx.total} data-sf-voucher-total>
          <span>{m['pending.total']}: </span>
          <strong>{total}</strong>
        </p>
      ) : null}
      {expired ? (
        <p className={cx.note} data-sf-voucher-expired-note>
          {m['pending.expiredNote']}
        </p>
      ) : (
        <div className={cx.actions} data-sf-voucher-actions>
          {voucherHref ? (
            <>
              <a href={voucherHref(payment, { download: false, format: 'html' })} target="_blank" rel="noopener" className={cx.primary} data-sf-voucher-print>
                {m['pending.print']}
                <Hidden> {m['action.newTab']}</Hidden>
              </a>
              <a href={voucherHref(payment, { download: true, format: 'pdf' })} download className={cx.secondary} data-sf-voucher-download>
                {m['pending.download']}
              </a>
            </>
          ) : (
            <>
              <PendingButton className={cx.primary} pending={lock.pending} busy={lock.pending && which === 'print'} kind="load" locale={locale} onClick={() => { setWhich('print'); void lock.run(() => Promise.resolve(openDocument(payment, 'print', { locale, shopName, timeZone }))) }} data-sf-voucher-print>
                {m['pending.print']}
              </PendingButton>
              <PendingButton className={cx.secondary} pending={lock.pending} busy={lock.pending && which === 'download'} kind="download" locale={locale} onClick={() => { setWhich('download'); void lock.run(() => Promise.resolve(downloadPdf(payment, { locale, shopName, timeZone }))) }} data-sf-voucher-download>
                {m['pending.download']}
              </PendingButton>
            </>
          )}
          {v.ticket_url ? (
            <a href={v.ticket_url} target="_blank" rel="noopener noreferrer" className={cx.secondary} data-sf-voucher-ticket>
              {m['pending.ticket']}
              <Hidden> {m['action.newTab']}</Hidden>
            </a>
          ) : null}
          {copyValue ? (
            <CopyButton value={copyValue} label={v.reference ? m['pending.copyReference'] : m['pending.copyClabe']} copiedLabel={m['pending.copied']} failedLabel={m['pending.copyFailed']} className={cx.secondary} data-sf-copy="voucher" />
          ) : null}
        </div>
      )}
      {children}
    </article>
  )
}

export type PendingPaymentListProps = AccountTextProps &
  Pick<PendingPaymentCardProps, 'voucherHref' | 'shopName' | 'classNames'> & {
    payments?: readonly PendingPayment[] | null
    headingLevel?: 2 | 3
    /** Classes of the section itself. */
    listClassNames?: Partial<Record<'root' | 'title' | 'intro' | 'list' | 'item', string>>
  }

/** "Pendientes de pago": the valid vouchers first, then the expired ones. Renders nothing when there are none. */
export function PendingPaymentList({ payments, voucherHref, shopName, classNames, listClassNames: lc = {}, headingLevel = 2, ...text }: PendingPaymentListProps) {
  const { m } = useAccountText(text)
  const titleId = `sf-pending-${useId().replace(/:/g, '')}`
  const items = (Array.isArray(payments) ? payments : []).filter((p) => !!voucherOf(p))
  if (items.length === 0) return null
  const sorted = [...items.filter((p) => p.status !== 'expired'), ...items.filter((p) => p.status === 'expired')]
  const Heading = `h${headingLevel}` as 'h2'
  const cardHeading = (headingLevel + 1) as 3 | 4
  return (
    <section className={lc.root} aria-labelledby={titleId} data-sf-pending>
      <Heading id={titleId} className={lc.title}>
        {m['pending.title']}
      </Heading>
      <p className={lc.intro}>{m['pending.intro']}</p>
      <ul className={lc.list}>
        {sorted.map((p) => (
          <li key={p.id} className={lc.item}>
            <PendingPaymentCard payment={p} {...(voucherHref ? { voucherHref } : {})} {...(shopName ? { shopName } : {})} {...(classNames ? { classNames } : {})} headingLevel={cardHeading} {...text} />
          </li>
        ))}
      </ul>
    </section>
  )
}
