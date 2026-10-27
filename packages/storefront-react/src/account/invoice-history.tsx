/**
 * Every invoice of the buyer in one list («Mis facturas»): one row per document with its fiscal folio, issue date,
 * order, total and status, the PDF / XML downloads and links to the invoice page and to the order. Headless
 * (`data-sf-invoice-history*`, `classNames`). The store loads the orders that have an invoice and passes each document
 * with its order; downloads go through YOUR authenticated route (`fileHref`, re-used on every visit: nothing here
 * expires), never a PAC URL. A sandbox invoice stays labelled «test, not valid».
 */
import type { InvoiceDoc, InvoiceFileKind, Order } from '@asteby/storefront'
import { isTestInvoice } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { InvoiceFileLinks } from './invoice-files.js'
import { enumText, fill } from './orders-messages.js'
import { Time, moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

export type InvoiceHistoryEntry = { order: Pick<Order, 'id' | 'number'>; invoice: InvoiceDoc }

export type InvoiceHistoryClassNames = Partial<Record<'root' | 'title' | 'list' | 'item' | 'heading' | 'status' | 'meta' | 'actions' | 'download' | 'link' | 'test' | 'note' | 'empty', string>>

export type InvoiceHistoryProps = AccountTextProps & {
  entries: readonly InvoiceHistoryEntry[] | null | undefined
  fileHref?: (doc: InvoiceDoc, kind: InvoiceFileKind, order: InvoiceHistoryEntry['order']) => string | null | undefined
  /** Page of ONE invoice (`<InvoiceDetail />`). */
  detailHref?: (doc: InvoiceDoc, order: InvoiceHistoryEntry['order']) => string | null | undefined
  /** Page of the order. */
  orderHref?: (order: InvoiceHistoryEntry['order']) => string | null | undefined
  /** `compact`: one row per invoice with folio, state, date, total and order, and ONE «Ver detalle» link; downloads and the order link live on the invoice page. */
  compact?: boolean
  headingLevel?: 2 | 3 | 4
  /** Shown when there is none (e.g. a link to the orders). */
  empty?: ReactNode
  classNames?: InvoiceHistoryClassNames
}

export function InvoiceHistory({ entries, fileHref, detailHref, orderHref, compact = false, headingLevel = 2, empty, classNames: cx = {}, ...text }: InvoiceHistoryProps) {
  const { m, date, locale } = useAccountText(text)
  const titleId = `sf-invhist-${useId().replace(/:/g, '')}`
  const Heading = `h${headingLevel}` as 'h2'
  const rows = (Array.isArray(entries) ? entries : []).filter((e) => e && e.invoice && typeof e.invoice.id === 'string' && e.order && typeof e.order.id === 'string')
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-invoice-history>
      <Heading id={titleId} className={cx.title}>
        {m['invoiceHistory.title']}
      </Heading>
      {rows.length === 0 ? (
        <div className={cx.empty} data-sf-invoice-history-empty>
          <p>{m['invoiceHistory.empty']}</p>
          {empty}
        </div>
      ) : (
        <ul className={cx.list} data-sf-invoice-history-list>
          {rows.map(({ order, invoice: doc }) => {
            const credit = doc.kind === 'credit_note'
            const kindLabel = credit ? m['invoice.creditNote'] : m['invoice.invoice']
            const name = [str(doc.series), str(doc.folio_number)].filter(Boolean).join('-')
            const folio = str(doc.folio)
            const total = moneyText(doc.total, locale)
            const test = isTestInvoice(doc)
            const issued = doc.status === 'issued'
            const detail = detailHref?.(doc, order)
            const orderLink = orderHref?.(order)
            const label = name || folio || ''
            return (
              <li key={`${order.id}-${doc.id}`} className={cx.item} data-sf-invoice-history-item data-sf-invoice-status={typeof doc.status === 'string' ? doc.status : 'unknown'}>
                <p className={cx.heading}>
                  <strong>{kindLabel}</strong>
                  {name ? <> {name}</> : null} ·{' '}
                  <span className={cx.status} data-sf-invoice-state>
                    {enumText(m, 'invoice.status', doc.status)}
                  </span>
                  {test ? (
                    <>
                      {' '}
                      <span className={cx.test} data-sf-invoice-test>
                        {m['invoice.test']}
                      </span>
                    </>
                  ) : null}
                </p>
                {folio && !compact ? (
                  <p className={cx.meta} data-sf-invoice-folio>
                    {m['invoice.folio']}: <code>{folio}</code>
                  </p>
                ) : null}
                <p className={cx.meta}>
                  {doc.issued_at ? <Time value={doc.issued_at} text={fill(m['invoice.issued'], { date: date(doc.issued_at) ?? '' })} /> : null}
                  {total ? <> · {m['invoice.total']}: {total}</> : null}
                  {str(order.number) ? <> · {fill(m['order.number'], { number: str(order.number) ?? '' })}</> : null}
                </p>
                {issued && !compact ? <InvoiceFileLinks doc={doc} m={m} name={label} fileHref={fileHref ? (d, k) => fileHref(d, k, order) : undefined} classNames={{ actions: cx.actions, download: cx.download, note: cx.note }} /> : null}
                {detail || orderLink ? (
                  <p className={cx.actions}>
                    {detail ? (
                      <a href={detail} className={cx.link} aria-label={fill(m['invoice.viewOf'], { kind: kindLabel.toLowerCase(), name: label }).replace(/\s+/g, ' ').trim()}>
                        {m['invoice.view']}
                      </a>
                    ) : null}
                    {orderLink && !compact ? (
                      <a href={orderLink} className={cx.link}>
                        {m['order.view']}
                      </a>
                    ) : null}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
