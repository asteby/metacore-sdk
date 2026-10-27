/**
 * The notice above the form when an invoice was refused because of a datum the buyer typed. It says, in plain words, what to
 * fix (the server's `reason_message`: "No pudimos emitir tu factura: el nombre o razón social no coincide con el SAT. Revisa
 * tus datos y vuelve a intentarlo.") and how many attempts are left today. It never shows the provider's text: the server does
 * not send it.
 *
 * Use it with `invoiceCorrection(order.invoice)`: the form gets `values` (what was sent) and `errors` (the refused field).
 */
import type { InvoiceSummary } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { fill, fiscalMessages, type DeepPartial, type FiscalMessages } from './messages.js'

export type InvoiceRejectionNoticeClassNames = Partial<Record<'root' | 'title' | 'body' | 'meta', string>>

export type InvoiceRejectionNoticeProps = {
  invoice?: InvoiceSummary | null
  locale?: string
  messages?: DeepPartial<FiscalMessages>
  classNames?: InvoiceRejectionNoticeClassNames
  /** Heading level of the title (default 3). */
  headingLevel?: 2 | 3 | 4
}

/** Renders nothing unless the invoice needs data: a first request has nothing to correct. */
export function InvoiceRejectionNotice({ invoice, locale: localeProp, messages, classNames: cx = {}, headingLevel = 3 }: InvoiceRejectionNoticeProps) {
  const locale = useResolvedLocale(localeProp)
  const m = fiscalMessages(locale, messages).status
  if (!invoice || invoice.stage !== 'needs_data') return null
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  const reason = invoice.reason_message?.trim() || (invoice.reason_code ? (m.reasons[invoice.reason_code] ?? m.reasons.default) : m.reasons.default)
  const left = invoice.retries_left
  const retries = typeof left === 'number' && left > 0 ? (left === 1 ? m.correction.retriesOne : fill(m.correction.retries, { n: String(left) })) : null
  return (
    <section className={cx.root} role="alert" data-sf-invoice-rejection data-reason={invoice.reason_code || undefined} data-field={invoice.reason_field || undefined}>
      <H className={cx.title}>{m.correction.title}</H>
      <p className={cx.body} data-sf-invoice-rejection-reason>
        {reason}
      </p>
      {retries ? (
        <p className={cx.meta} data-sf-invoice-retries>
          {retries}
        </p>
      ) : null}
    </section>
  )
}
