/**
 * Preview of an invoice: a dialog that shows the PDF embedded (an `<iframe>` of the bytes the buyer's own route
 * answered), and when the PDF is not there yet, a readable summary of the CFDI built from the stored XML plus a
 * «the PDF is being generated» notice with a retry button. Never a 404 page inside the frame.
 *
 * Everything goes through YOUR authenticated route (`pdfHref`, `xmlHref`: the same `fileHref` of `InvoiceList` /
 * `InvoiceDetail`): the PDF is requested with `?inline=1` (see `invoiceFileResponse`, `Content-Disposition: inline`,
 * `frame-ancestors 'self'`) at the moment the dialog opens, so no link expires and nothing is cached. Native
 * `<dialog>` (focus trapped, Esc closes, focus returns to the opener), accessible title, ES/EN.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useModalDialog } from '../dialog.js'
import { Spinner } from '../ui/navigation-progress.js'
import { PendingButton } from '../ui/pending-button.js'
import { fetchInvoiceFile, inlineHref, type FetchLike, type InvoiceFileErrorKind } from './invoice-fetch.js'
import type { AccountMessages } from './orders-messages.js'

// ---- the CFDI from its XML ----------------------------------------------------------------------------------------

export type CfdiSummary = {
  serie: string | null
  folio: string | null
  date: string | null
  currency: string | null
  subtotal: string | null
  total: string | null
  uuid: string | null
  issuer: { name: string | null; rfc: string | null }
  receiver: { name: string | null; rfc: string | null }
  concepts: { quantity: string | null; description: string | null; amount: string | null }[]
}

const attr = (el: Element | null | undefined, name: string): string | null => {
  const v = el?.getAttribute(name)
  return v && v.trim() ? v.trim().slice(0, 300) : null
}

/** Reads the visible facts of a CFDI. `null` when the text is not a CFDI (never throws, never evaluates anything). */
export function parseCfdi(xml: string): CfdiSummary | null {
  if (typeof DOMParser === 'undefined' || typeof xml !== 'string' || xml.length > 2_000_000) return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return null
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return null
  const all = (name: string): Element[] => [...doc.getElementsByTagName('*')].filter((e) => (e.localName || e.tagName).split(':').pop() === name)
  const first = (name: string): Element | null => all(name)[0] ?? null
  const root = first('Comprobante')
  if (!root) return null
  const issuer = first('Emisor')
  const receiver = first('Receptor')
  const stamp = first('TimbreFiscalDigital')
  const concepts = all('Concepto').slice(0, 50).map((c) => ({
    quantity: attr(c, 'Cantidad'),
    description: attr(c, 'Descripcion'),
    amount: attr(c, 'Importe'),
  }))
  return {
    serie: attr(root, 'Serie'),
    folio: attr(root, 'Folio'),
    date: attr(root, 'Fecha'),
    currency: attr(root, 'Moneda'),
    subtotal: attr(root, 'SubTotal'),
    total: attr(root, 'Total'),
    uuid: attr(stamp, 'UUID'),
    issuer: { name: attr(issuer, 'Nombre'), rfc: attr(issuer, 'Rfc') },
    receiver: { name: attr(receiver, 'Nombre'), rfc: attr(receiver, 'Rfc') },
    concepts,
  }
}

function CfdiView({ cfdi, m, classNames: cx = {} }: { cfdi: CfdiSummary; m: AccountMessages; classNames?: Partial<Record<'cfdi' | 'table', string>> }) {
  const money = (v: string | null) => (v ? `${v}${cfdi.currency ? ` ${cfdi.currency}` : ''}` : null)
  const row = (term: string, value: string | null) =>
    value ? (
      <div key={term}>
        <dt>{term}</dt>
        <dd>{value}</dd>
      </div>
    ) : null
  const party = (title: string, p: CfdiSummary['issuer']) =>
    p.name || p.rfc ? (
      <div key={title}>
        <dt>{title}</dt>
        <dd>{[p.name, p.rfc ? `${m['invoice.cfdi.rfc']}: ${p.rfc}` : null].filter(Boolean).join(' · ')}</dd>
      </div>
    ) : null
  return (
    <div className={cx.cfdi} data-sf-invoice-cfdi>
      <dl>
        {row(m['invoice.series'], [cfdi.serie, cfdi.folio].filter(Boolean).join('-') || null)}
        {row(m['invoice.cfdi.uuid'], cfdi.uuid)}
        {row(m['invoice.cfdi.date'], cfdi.date)}
        {party(m['invoice.cfdi.issuer'], cfdi.issuer)}
        {party(m['invoice.cfdi.receiver'], cfdi.receiver)}
        {row(m['invoice.cfdi.subtotal'], money(cfdi.subtotal))}
        {row(m['invoice.total'], money(cfdi.total))}
      </dl>
      {cfdi.concepts.length ? (
        <table className={cx.table}>
          <caption>{m['invoice.cfdi.concepts']}</caption>
          <thead>
            <tr>
              <th scope="col">{m['invoice.cfdi.quantity']}</th>
              <th scope="col">{m['invoice.cfdi.description']}</th>
              <th scope="col">{m['invoice.cfdi.amount']}</th>
            </tr>
          </thead>
          <tbody>
            {cfdi.concepts.map((c, i) => (
              <tr key={i}>
                <td>{c.quantity}</td>
                <td>{c.description}</td>
                <td>{c.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}

// ---- the dialog ---------------------------------------------------------------------------------------------------

export type { InvoiceFileErrorKind, InvoiceFetchResult } from './invoice-fetch.js'

export type InvoicePreviewClassNames = Partial<Record<'root' | 'header' | 'title' | 'close' | 'body' | 'frame' | 'notice' | 'retry' | 'footer' | 'cfdi' | 'table', string>>

export type InvoicePreviewDialogProps = {
  open: boolean
  onClose: () => void
  /** Accessible title: «Vista previa de la factura A-10». */
  title: string
  /** The buyer's route for the PDF (`fileHref(doc, 'pdf')`); `?inline=1` is added. `null`: no PDF is offered, only the XML summary. */
  pdfHref: string | null
  /** The buyer's route for the XML: when the PDF is not ready the CFDI is drawn from it. */
  xmlHref?: string | null
  m: AccountMessages
  /** Download buttons / links of the document (the same `InvoiceFileLinks` buttons), drawn in the footer. */
  footer?: ReactNode
  classNames?: InvoicePreviewClassNames
  /** For tests / custom transports; default `fetch`. */
  fetch?: FetchLike
  /** Told when the dialog starts / stops loading, so the buttons next to it lock while the (costly) PDF is being made. */
  onBusyChange?: (busy: boolean) => void
}

type View =
  | { kind: 'loading' }
  | { kind: 'pdf'; url: string }
  | { kind: 'generating'; cfdi: CfdiSummary | null }
  | { kind: 'error'; code: InvoiceFileErrorKind }

export function InvoicePreviewDialog({ open, onClose, title, pdfHref, xmlHref, m, footer, classNames: cx = {}, fetch: fetchImpl, onBusyChange }: InvoicePreviewDialogProps) {
  const titleId = `sf-invprev-${useId().replace(/:/g, '')}`
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const { ref, onBackdropClick } = useModalDialog({ open, onClose: () => onClose(), initialFocus: closeRef })
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [slow, setSlow] = useState(false)
  const loading = open && view.kind === 'loading'
  const busyRef = useRef(onBusyChange)
  busyRef.current = onBusyChange
  useEffect(() => {
    busyRef.current?.(loading)
    if (!loading) {
      setSlow(false)
      return undefined
    }
    // The first PDF of a document can take several seconds: say so instead of a bare spinner.
    const id = setTimeout(() => setSlow(true), 2500)
    return () => clearTimeout(id)
  }, [loading])
  useEffect(() => () => busyRef.current?.(false), [])

  useEffect(() => {
    if (!open) return
    const ctl = new AbortController()
    let blobUrl: string | null = null
    setView({ kind: 'loading' })
    void (async () => {
      const opts = { signal: ctl.signal, ...(fetchImpl ? { fetch: fetchImpl } : {}) }
      const summaryOf = async (): Promise<CfdiSummary | null> => {
        if (!xmlHref) return null
        const x = await fetchInvoiceFile(xmlHref, opts)
        if (!x.ok) return null
        try {
          return parseCfdi(await x.blob.text())
        } catch {
          return null
        }
      }
      if (!pdfHref) {
        if (!ctl.signal.aborted) setView({ kind: 'generating', cfdi: await summaryOf() })
        return
      }
      const r = await fetchInvoiceFile(inlineHref(pdfHref), opts)
      if (ctl.signal.aborted) return
      if (r.ok) {
        blobUrl = URL.createObjectURL(new Blob([r.blob], { type: 'application/pdf' }))
        setView({ kind: 'pdf', url: blobUrl })
        return
      }
      if (r.code === 'not_ready' || r.code === 'not_found' || r.code === 'unavailable') {
        const cfdi = await summaryOf()
        if (ctl.signal.aborted) return
        // The PDF is missing but the XML is there: show the CFDI and say the PDF is coming. Without either, a plain error.
        setView(cfdi || r.code === 'not_ready' ? { kind: 'generating', cfdi } : { kind: 'error', code: r.code })
        return
      }
      setView({ kind: 'error', code: r.code })
    })()
    return () => {
      ctl.abort()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [open, pdfHref, xmlHref, attempt, fetchImpl])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  if (!open) return null
  return (
    <dialog ref={ref} className={cx.root} aria-labelledby={titleId} onClick={onBackdropClick} data-sf-invoice-preview-dialog>
      <div className={cx.header} data-sf-invoice-preview-header>
        <h2 id={titleId} className={cx.title}>
          {title}
        </h2>
        <button ref={closeRef} type="button" className={cx.close} onClick={() => onClose()} data-sf-autofocus data-sf-invoice-preview-close>
          {m['invoice.previewClose']}
        </button>
      </div>
      <div className={cx.body} data-sf-invoice-preview-body aria-busy={view.kind === 'loading'}>
        {view.kind === 'loading' ? (
          <p role="status" className={cx.notice} data-sf-invoice-preview-loading style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
            <Spinner />
            <span>{slow ? m['invoice.previewSlow'] : m['invoice.previewLoading']}</span>
          </p>
        ) : null}
        {view.kind === 'pdf' ? (
          <iframe className={cx.frame} title={m['invoice.previewFrame']} src={view.url} data-sf-invoice-preview-frame />
        ) : null}
        {view.kind === 'generating' ? (
          <div data-sf-invoice-preview-generating>
            <p role="status" className={cx.notice}>
              <strong>{m['invoice.previewGenerating']}</strong>
              {view.cfdi ? <> {m['invoice.previewGeneratingHint']}</> : null}
            </p>
            <PendingButton className={cx.retry} onClick={retry} pending={false} data-sf-invoice-preview-retry>
              {m['invoice.previewRetry']}
            </PendingButton>
            {view.cfdi ? <CfdiView cfdi={view.cfdi} m={m} classNames={{ ...(cx.cfdi ? { cfdi: cx.cfdi } : {}), ...(cx.table ? { table: cx.table } : {}) }} /> : null}
          </div>
        ) : null}
        {view.kind === 'error' ? (
          <div data-sf-invoice-preview-error={view.code}>
            <p role="alert" className={cx.notice}>
              {view.code === 'unauthorized' ? m['invoice.fileSession'] : m['invoice.previewFailed']}
            </p>
            <PendingButton className={cx.retry} onClick={retry} pending={false} data-sf-invoice-preview-retry>
              {m['invoice.previewRetry']}
            </PendingButton>
          </div>
        ) : null}
      </div>
      {footer ? (
        <div className={cx.footer} data-sf-invoice-preview-footer>
          {footer}
        </div>
      ) : null}
    </dialog>
  )
}
