/**
 * The «View invoice» / Download PDF / Download XML buttons of one invoice document, and the "still in process" note for
 * the file the server cannot hand over yet (`available_files`). Shared by `InvoiceList`, `InvoiceDetail` and
 * `InvoiceHistory`. A link only exists when the store gave a route (`fileHref`) or a handler (`onDownload`): a PAC URL
 * never gets printed here.
 *
 * With a route, a click does NOT navigate: the file is requested from your authenticated route at that moment (nothing
 * expires, as many times as the buyer wants) and saved under the name the server sent (`Content-Disposition`), so an
 * error (still generating, session expired) shows as a notice in the page instead of saving an empty `pdf.txt`.
 * Without JavaScript the link still works as a plain download. «View invoice» opens `InvoicePreviewDialog` (PDF
 * embedded; the CFDI from the XML while the PDF is not there); on a phone it opens the PDF in a new tab.
 */
import type { InvoiceDoc, InvoiceFileKind } from '@asteby/storefront'
import { useState, type MouseEvent } from 'react'
import { PendingButton } from '../ui/pending-button.js'
import { useActionLock } from '../ui/use-action-lock.js'
import { fill, type AccountMessages } from './orders-messages.js'
import { fetchInvoiceFile, inlineHref, saveBlob, type InvoiceFileErrorKind } from './invoice-fetch.js'
import type { InvoicePreviewClassNames } from './invoice-preview.js'
import { InvoicePreviewDialog } from './invoice-preview-lazy.js'
import { str } from './orders-ui.js'

export type InvoiceFileLinksProps = {
  doc: InvoiceDoc
  m: AccountMessages
  /** Heading name of the document ("A-10"), used in the accessible label. */
  name?: string
  fileHref?: ((doc: InvoiceDoc, kind: InvoiceFileKind) => string | null | undefined) | undefined
  onDownload?: ((doc: InvoiceDoc, kind: InvoiceFileKind) => void) | undefined
  /** «View invoice» (preview dialog) next to the downloads. Default true when there is a route. */
  preview?: boolean
  classNames?: Partial<Record<'actions' | 'download' | 'note', string>> & { preview?: string; previewDialog?: InvoicePreviewClassNames }
}

/** `factura-A-10.pdf`: the name the browser gets even if the server's header is lost. */
function fallbackName(doc: InvoiceDoc, kind: InvoiceFileKind): string {
  const part = (v: unknown) => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9_-]+/g, '') : '')
  const serieFolio = [part(doc.series), part(doc.folio_number)].filter(Boolean).join('-')
  const base = serieFolio || part(doc.folio) || 'cfdi'
  return `${doc.kind === 'credit_note' ? 'nota-de-credito' : 'factura'}-${base}.${kind}`
}

const narrow = () => {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches
  } catch {
    return false
  }
}

export function InvoiceFileLinks({ doc, m, name, fileHref, onDownload, preview = true, classNames: cx = {} }: InvoiceFileLinksProps) {
  const [notice, setNotice] = useState<{ kind: InvoiceFileKind; code: InvoiceFileErrorKind } | null>(null)
  // One lock for the whole document: a PDF, an XML and the preview never run side by side (the PDF is the costly one).
  const lock = useActionLock()
  const [busy, setBusy] = useState<InvoiceFileKind | 'preview' | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const working = lock.pending || dialogBusy
  if (!fileHref && !onDownload) return null
  const kindLabel = doc.kind === 'credit_note' ? m['invoice.creditNote'] : m['invoice.invoice']
  const label = name || str(doc.folio) || ''
  // The server says which files exist NOW (`available_files`); a kind it lacks is "in process", not a dead button.
  const has = (kind: InvoiceFileKind) => doc.available_files == null || doc.available_files.includes(kind)
  const hrefOf = (kind: InvoiceFileKind) => (has(kind) ? fileHref?.(doc, kind) || null : null)

  const save = async (e: MouseEvent, kind: InvoiceFileKind, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || typeof fetch !== 'function') return
    e.preventDefault()
    if (working) return
    setNotice(null)
    setBusy(kind)
    await lock.run(async (signal) => {
      const r = await fetchInvoiceFile(href, { signal })
      if (signal.aborted) return r
      if (r.ok) saveBlob(r.blob, r.filename ?? fallbackName(doc, kind))
      else setNotice({ kind, code: r.code })
      return r
    })
    setBusy(null)
  }

  const link = (kind: InvoiceFileKind) => {
    if (!has(kind)) return null
    const text = kind === 'pdf' ? m['invoice.pdf'] : m['invoice.xml']
    const aria = fill(m['invoice.downloadOf'], { action: text, kind: kindLabel.toLowerCase(), name: label }).replace(/\s+,/g, ',').replace(/,\s*$/, '').trim()
    const href = hrefOf(kind)
    if (href) {
      return (
        <PendingButton key={kind} href={href} download={fallbackName(doc, kind)} className={cx.download} aria-label={aria} pending={working} busy={lock.pending && busy === kind} kind="download" pendingLabel={m['invoice.downloading']} result={busy === kind && lock.result === 'done' ? 'done' : 'idle'} doneLabel={m['invoice.downloaded']} onClick={(e) => void save(e, kind, href)} data-sf-invoice-download={kind}>
          {text}
        </PendingButton>
      )
    }
    if (onDownload) {
      return (
        <PendingButton key={kind} className={cx.download} aria-label={aria} pending={working} busy={false} onClick={() => onDownload(doc, kind)} data-sf-invoice-download={kind}>
          {text}
        </PendingButton>
      )
    }
    return null
  }

  const pdfHref = hrefOf('pdf')
  const xmlHref = hrefOf('xml')
  const canPreview = preview && !!fileHref && (!!pdfHref || !!xmlHref)
  const openPreview = async () => {
    setNotice(null)
    // A phone has no useful embedded PDF viewer: open the PDF in a tab (checked first, so an error is a notice, not a blank tab).
    if (narrow() && pdfHref && typeof window !== 'undefined') {
      if (working) return
      const tab = window.open('', '_blank')
      setBusy('preview')
      const r = await lock.run((signal) => fetchInvoiceFile(inlineHref(pdfHref), { signal }))
      setBusy(null)
      if (r?.ok && tab) {
        tab.opener = null
        tab.location.href = URL.createObjectURL(new Blob([r.blob], { type: 'application/pdf' }))
        return
      }
      tab?.close()
      if (r && !r.ok) setNotice({ kind: 'pdf', code: r.code })
      return
    }
    setOpen(true)
  }
  const title = fill(m['invoice.previewTitle'], { kind: kindLabel.toLowerCase(), name: label }).replace(/\s+/g, ' ').trim()
  const noun = notice ? m[notice.kind === 'pdf' ? 'invoice.fileNoun.pdf' : 'invoice.fileNoun.xml'] : ''
  const noticeText = !notice
    ? ''
    : notice.code === 'not_ready'
      ? fill(m['invoice.fileNotReady'], { file: noun })
      : notice.code === 'unauthorized'
        ? m['invoice.fileSession']
        : notice.code === 'rate_limited'
          ? m['invoice.fileRateLimited']
          : m['invoice.fileUnavailable']
  return (
    <>
      <p className={cx.actions} data-sf-invoice-actions>
        {canPreview ? (
          <PendingButton className={cx.preview ?? cx.download} aria-haspopup="dialog" aria-label={fill(m['invoice.previewOf'], { kind: kindLabel.toLowerCase(), name: label }).replace(/\s+/g, ' ').trim()} pending={working && !open} busy={lock.pending && busy === 'preview'} kind="load" pendingLabel={m['invoice.previewLoading']} onClick={() => void openPreview()} data-sf-invoice-preview>
            {m['invoice.preview']}
          </PendingButton>
        ) : null}
        {link('pdf')}
        {link('xml')}
      </p>
      {notice ? (
        <p className={cx.note} role={notice.code === 'not_ready' ? 'status' : 'alert'} data-sf-invoice-file-notice={notice.code}>
          {noticeText}{' '}
          {notice.code === 'not_ready' || notice.code === 'unavailable' || notice.code === 'rate_limited' ? (
            <button
              type="button"
              className={cx.download}
              onClick={(e) => {
                const href = hrefOf(notice.kind)
                if (href) void save(e as unknown as MouseEvent, notice.kind, href)
              }}
              data-sf-invoice-file-retry
            >
              {m['invoice.previewRetry']}
            </button>
          ) : null}
        </p>
      ) : null}
      {!has('pdf') || !has('xml') ? (
        <p className={cx.note} data-sf-invoice-file-pending={has('pdf') ? 'xml' : 'pdf'}>
          {has('pdf') ? m['invoice.xmlPending'] : m['invoice.pdfPending']}
        </p>
      ) : null}
      {canPreview && open ? (
        <InvoicePreviewDialog
          open
          onClose={() => {
            setOpen(false)
            setDialogBusy(false)
          }}
          onBusyChange={setDialogBusy}
          title={title}
          pdfHref={pdfHref}
          xmlHref={xmlHref}
          m={m}
          {...(cx.previewDialog ? { classNames: cx.previewDialog } : {})}
          footer={
            <>
              {link('pdf')}
              {link('xml')}
            </>
          }
        />
      ) : null}
    </>
  )
}
