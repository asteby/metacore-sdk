/**
 * The detail of ONE invoice (or credit note) of an order, for the buyer: the fiscal folio, series and number, issue date,
 * status, total and currency, payment method and form, who it was issued to (the buyer's own fiscal data) and the
 * PDF / XML downloads. Headless (`data-sf-invoice-detail*`, `classNames`). It prints only what the document carries
 * (contract 1.14 `receiver`, `payment_method`, `payment_form`): a missing field is left out, never made up. An invoice
 * from a sandbox PAC (`test_mode`) shows a clear "test, not valid" notice. Downloads go through YOUR route (`fileHref`) or
 * `onDownload`, exactly as in `InvoiceList`; the PAC's URLs never reach the page.
 */
import type { InvoiceDoc, InvoiceFileKind } from '@asteby/storefront'
import { isTestInvoice } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { InvoiceFileLinks } from './invoice-files.js'
import { enumText, type AccountMessages } from './orders-messages.js'
import { Time, moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type InvoiceDetailClassNames = Partial<Record<'root' | 'title' | 'status' | 'test' | 'list' | 'row' | 'term' | 'value' | 'group' | 'groupTitle' | 'actions' | 'download' | 'note', string>>

export type InvoiceDetailProps = AccountTextProps & {
  invoice: InvoiceDoc
  fileHref?: (doc: InvoiceDoc, kind: InvoiceFileKind) => string | null | undefined
  onDownload?: (doc: InvoiceDoc, kind: InvoiceFileKind) => void
  /** Readable name of a tax regime code (the region's catalog); without it the code is printed. */
  taxRegimeLabel?: (code: string) => string | null | undefined
  /** Readable name of an invoice-use code (the region's catalog); without it the code is printed. */
  cfdiUseLabel?: (code: string) => string | null | undefined
  /** Offer the downloads of a sandbox invoice (labelled; its files carry the test mark). Default true: the notice already says it. */
  testDownloads?: boolean
  /** Print the «test, not valid» notice (default true). Pass `false` when the page already shows ONE sandbox band (`OrderSandboxNotice`). */
  testNotice?: boolean
  headingLevel?: 2 | 3 | 4
  /** Content under the details (e.g. a link back to the order). */
  children?: ReactNode
  classNames?: InvoiceDetailClassNames
}

const has = (m: AccountMessages, key: string): key is keyof AccountMessages => Object.prototype.hasOwnProperty.call(m, key)

/** `PUE` → «Pago en una sola exhibición (PUE)»; an unknown value prints as the server sent it. */
function coded(m: AccountMessages, group: string, value: string | null): string | null {
  if (!value) return null
  const key = `${group}.${value}`
  return has(m, key) ? m[key] : value
}

export function InvoiceDetail({ invoice, fileHref, onDownload, taxRegimeLabel, cfdiUseLabel, testDownloads = true, testNotice = true, headingLevel = 2, children, classNames: cx = {}, ...text }: InvoiceDetailProps) {
  const { m, date, locale } = useAccountText(text)
  const titleId = `sf-invdet-${useId().replace(/:/g, '')}`
  if (!invoice || typeof invoice !== 'object') return null
  const Heading = `h${headingLevel}` as 'h2'
  const Sub = `h${Math.min(headingLevel + 1, 6)}` as 'h3'
  const test = isTestInvoice(invoice)
  const credit = invoice.kind === 'credit_note'
  const kindLabel = credit ? m['invoice.creditNote'] : m['invoice.invoice']
  const name = [str(invoice.series), str(invoice.folio_number)].filter(Boolean).join('-')
  const folio = str(invoice.folio)
  const total = moneyText(invoice.total, locale)
  const currency = invoice.total && typeof invoice.total === 'object' && typeof invoice.total.currency_code === 'string' ? invoice.total.currency_code.toUpperCase() : null
  const issued = invoice.status === 'issued'
  const r = invoice.receiver && typeof invoice.receiver === 'object' ? invoice.receiver : null
  const code = (v: unknown, label?: (c: string) => string | null | undefined) => {
    const c = str(v)
    if (!c) return null
    const l = str(label?.(c))
    return l && l !== c ? `${c} · ${l}` : c
  }
  const row = (key: string, term: string, value: ReactNode) =>
    value == null || value === '' ? null : (
      <div key={key} className={cx.row} data-sf-invoice-field={key}>
        <dt className={cx.term}>{term}</dt>
        <dd className={cx.value}>{value}</dd>
      </div>
    )
  const emission = [
    row('folio', m['invoice.folio'], folio ? <code>{folio}</code> : null),
    row('series', m['invoice.series'], name || null),
    row('issued_at', m['invoice.issuedAt'], invoice.issued_at ? <Time value={invoice.issued_at} text={date(invoice.issued_at)} /> : null),
    row('cancelled_at', m['invoice.cancelledAt'], invoice.cancelled_at ? <Time value={invoice.cancelled_at} text={date(invoice.cancelled_at)} /> : null),
    row('status', m['invoice.state'], enumText(m, 'invoice.status', invoice.status)),
    row('total', m['invoice.total'], total),
    row('currency', m['invoice.currency'], currency),
    row('payment_method', m['invoice.paymentMethod'], coded(m, 'invoice.paymentMethod', str(invoice.payment_method)?.toUpperCase() ?? null)),
    row('payment_form', m['invoice.paymentForm'], (() => {
      const f = str(invoice.payment_form)
      const label = f ? coded(m, 'invoice.paymentForm', f) : null
      return f && label && label !== f ? `${f} · ${label}` : f
    })()),
  ].filter(Boolean)
  const receiver = r
    ? [
        row('rfc', m['invoice.taxId'], str(r.rfc)),
        row('name', m['invoice.legalName'], str(r.name)),
        row('tax_regime', m['invoice.taxRegime'], code(r.tax_regime, taxRegimeLabel)),
        row('cfdi_use', m['invoice.cfdiUse'], code(r.cfdi_use, cfdiUseLabel)),
        row('postal_code', m['invoice.postalCode'], str(r.postal_code)),
      ].filter(Boolean)
    : []

  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-invoice-detail data-sf-invoice-kind={credit ? 'credit_note' : 'invoice'} data-sf-invoice-status={typeof invoice.status === 'string' ? invoice.status : 'unknown'}>
      <Heading id={titleId} className={cx.title}>
        {kindLabel}
        {name ? <> {name}</> : null}
      </Heading>
      <p className={cx.status} data-sf-invoice-state>
        {enumText(m, 'invoice.status', invoice.status)}
      </p>
      {test && testNotice ? (
        <p role="note" className={cx.test} data-sf-invoice-test>
          <strong>{m['invoice.test']}.</strong> {m['invoice.testNote']}
        </p>
      ) : null}
      {invoice.status === 'pending' || invoice.status === 'error' || invoice.status === 'cancelled' ? (
        <p className={cx.note} data-sf-invoice-note>
          {m[`invoice.statusNote.${invoice.status}` as 'invoice.statusNote.pending']}
        </p>
      ) : null}
      {emission.length ? (
        <dl className={cx.list} data-sf-invoice-emission>
          {emission}
        </dl>
      ) : null}
      {receiver.length ? (
        <div className={cx.group} data-sf-invoice-receiver>
          <Sub className={cx.groupTitle}>{m['invoice.receiver']}</Sub>
          <dl className={cx.list}>{receiver}</dl>
        </div>
      ) : null}
      {issued && (testDownloads || !test) && (fileHref || onDownload) ? (
        <div className={cx.group} data-sf-invoice-files>
          <Sub className={cx.groupTitle}>{m['invoice.files']}</Sub>
          <InvoiceFileLinks doc={invoice} m={m} name={name || folio || ''} fileHref={fileHref} onDownload={onDownload} classNames={{ actions: cx.actions, download: cx.download, note: cx.note }} />
        </div>
      ) : null}
      {children}
    </section>
  )
}

