/**
 * The invoice of an order, in one card with the state the buyer needs to understand and the one next step. It reads an
 * `InvoiceSummary` (`stage`, `action`, `can_request`, `blocked_reason`, `reason_code`, links) and never guesses: the
 * server decides what is possible. While an invoice is being generated it asks the caller to refresh (`onRefresh`)
 * every 10 s for at most a minute, then stops and says so.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { InvoiceSummary } from '@asteby/storefront'
import type { FiscalReason } from './types.js'
import { useResolvedLocale } from '../locale.js'
import { fill, fiscalMessages, type DeepPartial, type FiscalMessages } from './messages.js'

export type InvoiceCardState =
  | 'not_requested'
  | 'awaiting_payment'
  | 'processing'
  | 'issued'
  | 'needs_data'
  | 'needs_review'
  | 'window_closed'
  | 'unavailable'
  | 'not_enabled'
  | 'unknown'
  | 'unreachable'
  | 'cancelled'

/** The state the order's own `invoice` summary describes (the server decides what is possible for THIS order). */
function orderState(invoice: InvoiceSummary | null | undefined): InvoiceCardState {
  if (!invoice) return 'not_requested'
  const stage = invoice.stage ?? ''
  const blocked = invoice.blocked_reason ?? ''
  if (stage === 'issued' || invoice.status === 'issued' || (invoice.action === 'download' && (invoice.url || invoice.xml_url))) return 'issued'
  if (stage === 'cancelled') return 'cancelled'
  if (stage === 'needs_data' || invoice.action === 'correct_data') return 'needs_data'
  if (stage === 'needs_review' || invoice.action === 'contact_store') return 'needs_review'
  if (stage === 'window_closed' || blocked === 'window_closed') return 'window_closed'
  if (stage === 'awaiting_payment' || blocked === 'awaiting_payment') return 'awaiting_payment'
  if (stage === 'queued' || stage === 'issuing' || stage === 'retrying' || stage === 'requested') return 'processing'
  if (blocked === 'not_invoiceable' || blocked === 'unavailable') return 'unavailable'
  if (invoice.can_request === false && blocked) return 'unavailable'
  return 'not_requested'
}

/**
 * Which of the card's states an invoice is in.
 *
 * `available` / `reason` come from `loadFiscalContext`. Only a server that SAYS the store does not invoice
 * (`reason` `off` / `no_region`) wins over the order: `not_enabled`. When the server says nothing (`unknown`, an older
 * server), could not be asked (`unreachable`) or the caller gave no `reason`, the order's own summary still decides
 * (an order that `can_request`, is being issued or already has its invoice is shown as such) and, with nothing to show,
 * the card is neutral: it never claims that the store does not issue invoices.
 */
export function invoiceCardState(invoice: InvoiceSummary | null | undefined, available = true, reason?: FiscalReason): InvoiceCardState {
  if (available) return orderState(invoice)
  if (reason === 'off' || reason === 'no_region') return 'not_enabled'
  const own = orderState(invoice)
  if (invoice && (own !== 'not_requested' || invoice.can_request === true || invoice.action === 'request')) return own
  return reason === 'unreachable' ? 'unreachable' : 'unknown'
}

export type InvoiceStatusCardClassNames = Partial<Record<'root' | 'title' | 'body' | 'actions' | 'primary' | 'secondary' | 'link' | 'meta', string>>

export type InvoiceStatusCardProps = {
  invoice?: InvoiceSummary | null
  /** `loadFiscalContext(...).available`. `false` alone is read as "unknown": see `availability`. */
  available?: boolean
  /** `loadFiscalContext(...).reason`: why it is (not) available. Lets the card say the true thing (not active / unknown / could not check). */
  availability?: FiscalReason
  /** Invoicing is in test mode (sandbox): shows a badge saying invoices have no fiscal validity. */
  testMode?: boolean
  /** `capabilities.invoicing.window_days`: shown next to the request button. */
  windowDays?: number
  /** The buyer taps "Request invoice". Shown when `invoice.can_request !== false`. Without it, `requestHref` is a link. */
  onRequest?: () => void
  requestHref?: string
  /** "Fix and retry". Without it, `correctHref` is a link. */
  onCorrect?: () => void
  correctHref?: string
  /** Called while the invoice is processing (every `refreshMs`, for at most `refreshForMs`). Reload the order there. */
  onRefresh?: () => void
  refreshMs?: number
  refreshForMs?: number
  /** How to reach the store when it must review: an email, a phone or a URL. */
  contact?: { email?: string; phone?: string; url?: string }
  locale?: string
  messages?: DeepPartial<FiscalMessages>
  classNames?: InvoiceStatusCardClassNames
  /** Heading level of the title (default 3). */
  headingLevel?: 2 | 3 | 4
}

export function InvoiceStatusCard(props: InvoiceStatusCardProps) {
  const { invoice, available = true, availability, testMode, windowDays, onRequest, requestHref, onCorrect, correctHref, onRefresh, refreshMs = 10_000, refreshForMs = 60_000, contact, messages, classNames: cx = {}, headingLevel = 3 } = props
  const locale = useResolvedLocale(props.locale)
  const m = fiscalMessages(locale, messages).status
  const state = invoiceCardState(invoice, available, availability)
  const titleId = `sf-invoice-card-${useId().replace(/:/g, '')}`
  const [tired, setTired] = useState(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  // Refresh while it is processing, then give up quietly (the card says it is still going).
  useEffect(() => {
    setTired(false)
    if (state !== 'processing' || !refresh.current) return
    const t0 = Date.now()
    const id = setInterval(() => {
      if (Date.now() - t0 >= refreshForMs) {
        clearInterval(id)
        setTired(true)
        return
      }
      refresh.current?.()
    }, refreshMs)
    return () => clearInterval(id)
  }, [state, refreshMs, refreshForMs])

  const manualRefresh = useCallback(() => {
    setTired(false)
    refresh.current?.()
  }, [])

  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  const contactLine = contact?.email ?? contact?.phone ?? contact?.url
  const reason = invoice?.reason_code ? (m.reasons[invoice.reason_code] ?? m.reasons.default) : m.reasons.default

  let title: string
  let body: ReactNode = null
  let actions: ReactNode = null
  let live = false

  switch (state) {
    case 'not_requested': {
      title = m.title
      body = (
        <>
          <p className={cx.body}>{m.requestHelp}</p>
          {windowDays && windowDays > 0 ? (
            <p className={cx.meta} data-sf-invoice-window>
              {fill(m.windowNote, { days: windowDays })}
            </p>
          ) : null}
        </>
      )
      const can = invoice?.can_request !== false
      if (can && (onRequest || requestHref)) {
        actions = onRequest ? (
          <button type="button" className={cx.primary} onClick={onRequest} data-sf-invoice-request>
            {m.request}
          </button>
        ) : (
          <a href={requestHref} className={cx.primary} data-sf-invoice-request>
            {m.request}
          </a>
        )
      }
      break
    }
    case 'awaiting_payment':
      title = m.awaitingTitle
      body = <p className={cx.body}>{m.awaitingBody}</p>
      break
    case 'processing':
      live = true
      title = m.processingTitle
      body = <p className={cx.body}>{tired ? m.processingSlow : m.processingBody}</p>
      actions = onRefresh ? (
        <button type="button" className={cx.secondary} onClick={manualRefresh} data-sf-invoice-refresh>
          {m.refresh}
        </button>
      ) : null
      break
    case 'issued':
      title = m.issuedTitle
      body = (
        <>
          <p className={cx.body}>{m.issuedBody}</p>
          {invoice?.folio ? (
            <p className={cx.meta} data-sf-invoice-folio>
              <span>{m.folio}: </span>
              <code>{invoice.folio}</code>
            </p>
          ) : null}
        </>
      )
      actions = (
        <>
          {invoice?.url ? (
            <a href={invoice.url} className={cx.primary} rel="noopener noreferrer" download data-sf-invoice-pdf>
              {m.pdf}
            </a>
          ) : null}
          {invoice?.xml_url ? (
            <a href={invoice.xml_url} className={cx.secondary} rel="noopener noreferrer" download data-sf-invoice-xml>
              {m.xml}
            </a>
          ) : null}
        </>
      )
      break
    case 'needs_data':
      title = m.needsDataTitle
      body = (
        <>
          <p className={cx.body}>{m.needsDataBody}</p>
          <p className={cx.meta} data-sf-invoice-reason>
            {reason}
          </p>
        </>
      )
      actions = onCorrect ? (
        <button type="button" className={cx.primary} onClick={onCorrect} data-sf-invoice-correct>
          {m.correct}
        </button>
      ) : correctHref ? (
        <a href={correctHref} className={cx.primary} data-sf-invoice-correct>
          {m.correct}
        </a>
      ) : null
      break
    case 'needs_review':
      title = m.reviewTitle
      body = (
        <>
          <p className={cx.body}>{m.reviewBody}</p>
          {contactLine ? <p className={cx.meta}>{fill(m.contactBy, { contact: contactLine })}</p> : null}
        </>
      )
      actions = contact?.url ? (
        <a href={contact.url} className={cx.secondary} data-sf-invoice-contact>
          {m.contact}
        </a>
      ) : contact?.email ? (
        <a href={`mailto:${contact.email}`} className={cx.secondary} data-sf-invoice-contact>
          {m.contact}
        </a>
      ) : null
      break
    case 'window_closed':
      title = m.windowTitle
      body = <p className={cx.body}>{m.windowBody}</p>
      break
    case 'cancelled':
      title = m.cancelledTitle
      body = <p className={cx.body}>{m.cancelledBody}</p>
      break
    case 'not_enabled':
    case 'unknown':
    case 'unreachable': {
      title = state === 'not_enabled' ? m.notEnabledTitle : m.unknownTitle
      body = <p className={cx.body}>{state === 'not_enabled' ? m.notEnabledBody : state === 'unreachable' ? m.unreachableBody : m.unknownBody}</p>
      const mail = contact?.url ?? (contact?.email ? `mailto:${contact.email}` : null)
      actions = (
        <>
          {state === 'unreachable' && onRefresh ? (
            <button type="button" className={cx.secondary} onClick={manualRefresh} data-sf-invoice-refresh>
              {m.refresh}
            </button>
          ) : null}
          {mail ? (
            <a href={mail} className={cx.secondary} data-sf-invoice-contact>
              {m.contact}
            </a>
          ) : null}
        </>
      )
      break
    }
    default:
      title = m.unavailableTitle
      body = <p className={cx.body}>{m.unavailableBody}</p>
  }

  return (
    <section className={cx.root} data-sf-invoice-card data-state={state} data-stage={invoice?.stage || undefined} aria-labelledby={titleId}>
      <H id={titleId} className={cx.title} data-sf-invoice-title>
        <span aria-hidden="true" data-sf-invoice-icon>
          {ICON[state]}
        </span>{' '}
        {title}
      </H>
      {/* Announces the change when an invoice moves on while the buyer is looking at the page. */}
      <div aria-live={live || state === 'issued' ? 'polite' : undefined} data-sf-invoice-live>
        {body}
      </div>
      {testMode ? (
        <p className={cx.meta} data-sf-invoice-sandbox>
          {m.sandbox}
        </p>
      ) : null}
      {actions ? (
        <div className={cx.actions} data-sf-invoice-actions>
          {actions}
        </div>
      ) : null}
    </section>
  )
}

/** A shape per state, so the state never depends on color alone. */
const ICON: Record<InvoiceCardState, string> = {
  not_requested: '○',
  awaiting_payment: '◔',
  processing: '↻',
  issued: '✓',
  needs_data: '!',
  needs_review: '◐',
  window_closed: '–',
  unavailable: '–',
  not_enabled: '–',
  unknown: '?',
  unreachable: '?',
  cancelled: '×',
}
