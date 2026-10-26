/**
 * The invoices and credit notes of an order. Headless (`data-sf-invoice-*`, `classNames`). A credit note is listed
 * under the invoice it corrects. Downloads go ONLY through YOUR authenticated route (`fileHref`, backed by
 * `invoiceFileResponse` in `/account/server`) or a handler (`onDownload`): this component never prints a link it did
 * not get from the store, so a PAC URL can never end up in the page. An invoice from a sandbox PAC (`test_mode`) is
 * hidden or marked "test, not valid" and gets no download.
 *
 * With no documents it hands the order's `invoice` summary (not requested, needs data, being generated...) to
 * `renderSummary`; the usual one is `(s) => <InvoiceStatusCard invoice={s} ... />` from `@asteby/storefront-react/fiscal`
 * (a slot, so this bundle does not carry the fiscal texts for stores that never request invoices from here).
 */
import type { InvoiceDoc, InvoiceFileKind, InvoiceSummary } from '@asteby/storefront'
import { groupInvoiceDocs, isTestInvoice } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { enumText, fill } from './orders-messages.js'
import { Hidden, Time, moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type InvoiceListClassNames = Partial<
  Record<'root' | 'title' | 'group' | 'doc' | 'status' | 'meta' | 'note' | 'actions' | 'download' | 'creditNotes' | 'test' | 'error' | 'retry' | 'empty', string>
>

export type InvoiceListProps = AccountTextProps & {
  invoices?: readonly InvoiceDoc[] | null
  /** The order's invoice summary, handed to `renderSummary` when there are no documents. */
  summary?: InvoiceSummary | null
  /** Draws the summary (request, needs data, being generated...): `(s) => <InvoiceStatusCard invoice={s} requestHref="/factura" />`. */
  renderSummary?: (summary: InvoiceSummary) => ReactNode
  /** Your authenticated download route for a file of a document, e.g. `/cuenta/pedidos/${order}/facturas/${doc.id}.${kind}`. */
  fileHref?: (doc: InvoiceDoc, kind: InvoiceFileKind) => string | null | undefined
  /** Alternative to `fileHref`: a handler (opens your own download flow). */
  onDownload?: (doc: InvoiceDoc, kind: InvoiceFileKind) => void
  /** The server could not read the invoices (`order.degraded` has `invoices`): shows a recoverable error. */
  degraded?: boolean
  onRetry?: () => void
  /** A sandbox invoice: `mark` (default) shows it labelled and with no download; `hide` removes it. */
  testMode?: 'hide' | 'mark'
  /** Money formatter is `Intl`; the order's currency comes with each total. */
  headingLevel?: 2 | 3 | 4
  /** Content under the list (e.g. a "Request invoice" button). */
  children?: ReactNode
  classNames?: InvoiceListClassNames
}

const known = (s: unknown): s is 'issued' | 'pending' | 'cancelled' | 'error' => s === 'issued' || s === 'pending' || s === 'cancelled' || s === 'error'

export function InvoiceList({ invoices, summary, renderSummary, fileHref, onDownload, degraded, onRetry, testMode = 'mark', headingLevel = 3, children, classNames: cx = {}, ...text }: InvoiceListProps) {
  const { m, t, date, locale } = useAccountText(text)
  const Heading = `h${headingLevel}` as 'h3'
  const titleId = `sf-invoices-${useId().replace(/:/g, '')}`
  const all = (Array.isArray(invoices) ? invoices : []).filter((d): d is InvoiceDoc => !!d && typeof d === 'object' && typeof d.id === 'string')
  const docs = testMode === 'hide' ? all.filter((d) => !isTestInvoice(d)) : all
  const { groups, orphans } = groupInvoiceDocs(docs)

  const renderDoc = (doc: InvoiceDoc, parent?: InvoiceDoc) => {
    const test = isTestInvoice(doc)
    const status = known(doc.status) ? doc.status : 'unknown'
    const kindLabel = doc.kind === 'credit_note' ? m['invoice.creditNote'] : m['invoice.invoice']
    const docName = (d: InvoiceDoc) => [str(d.series), str(d.folio_number)].filter(Boolean).join('-')
    const name = docName(doc)
    const folio = str(doc.folio)
    const canDownload = status === 'issued' && !test
    const total = moneyText(doc.total, locale)
    const link = (kind: InvoiceFileKind) => {
      const label = kind === 'pdf' ? m['invoice.pdf'] : m['invoice.xml']
      const aria = fill(m['invoice.downloadOf'], { action: label, kind: kindLabel.toLowerCase(), name: name || folio || '' }).replace(/\s+,/g, ',').replace(/,\s*$/, '').trim()
      const href = fileHref?.(doc, kind)
      if (href) {
        return (
          <a key={kind} href={href} download className={cx.download} aria-label={aria} data-sf-invoice-download={kind}>
            {label}
          </a>
        )
      }
      if (onDownload) {
        return (
          <button key={kind} type="button" className={cx.download} aria-label={aria} onClick={() => onDownload(doc, kind)} data-sf-invoice-download={kind}>
            {label}
          </button>
        )
      }
      return null
    }
    return (
      <li key={doc.id} className={cx.doc} data-sf-invoice-doc data-sf-invoice-kind={doc.kind === 'credit_note' ? 'credit_note' : 'invoice'} data-sf-invoice-status={status}>
        <p className={cx.status} data-sf-invoice-heading>
          <strong>{kindLabel}</strong>
          {name ? <> {name}</> : null} · <span data-sf-invoice-state>{enumText(m, 'invoice.status', doc.status)}</span>
          {test ? (
            <>
              {' '}
              <span className={cx.test} data-sf-invoice-test>
                {m['invoice.test']}
              </span>
            </>
          ) : null}
        </p>
        {parent ? (
          <p className={cx.meta} data-sf-invoice-parent>
            {fill(m['invoice.creditNoteOf'], { folio: docName(parent) || str(parent.folio) || '' }).trim()}
          </p>
        ) : null}
        {folio && !test ? (
          <p className={cx.meta} data-sf-invoice-folio>
            {m['invoice.folio']}: <code>{folio}</code>
          </p>
        ) : null}
        <p className={cx.meta}>
          {doc.issued_at ? <Time value={doc.issued_at} text={fill(m['invoice.issued'], { date: date(doc.issued_at) ?? '' })} /> : null}
          {total ? <> · {m['invoice.total']}: {total}</> : null}
        </p>
        {status === 'pending' || status === 'error' || status === 'cancelled' ? (
          <p className={cx.note} data-sf-invoice-note>
            {m[`invoice.statusNote.${status}`]}
          </p>
        ) : null}
        {canDownload && (fileHref || onDownload) ? (
          <p className={cx.actions} data-sf-invoice-actions>
            {link('pdf')}
            {link('xml')}
          </p>
        ) : null}
      </li>
    )
  }

  const hasDocs = groups.length + orphans.length > 0
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-invoices>
      <Heading id={titleId} className={cx.title}>
        {m['invoice.title']}
      </Heading>
      {degraded ? (
        <div className={cx.error} role="alert" data-sf-section-error="invoices">
          <p>{m['section.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['section.retry']}
              <Hidden> {m['invoice.title']}</Hidden>
            </button>
          ) : null}
        </div>
      ) : hasDocs ? (
        <ul data-sf-invoice-list>
          {groups.map(({ invoice, creditNotes }) => (
            <li key={invoice.id} className={cx.group} data-sf-invoice-group>
              <ul>{renderDoc(invoice)}</ul>
              {creditNotes.length ? (
                <ul className={cx.creditNotes} data-sf-invoice-credit-notes>
                  {creditNotes.map((nc) => renderDoc(nc, invoice))}
                </ul>
              ) : null}
            </li>
          ))}
          {orphans.map((nc) => (
            <li key={nc.id} className={cx.group} data-sf-invoice-group>
              <ul>{renderDoc(nc)}</ul>
            </li>
          ))}
        </ul>
      ) : summary && renderSummary ? (
        <div data-sf-invoice-summary>{renderSummary(summary)}</div>
      ) : (
        <p className={cx.empty} data-sf-invoice-empty>
          {m['invoice.none']}
        </p>
      )}
      {children}
    </section>
  )
}
