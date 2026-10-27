/**
 * The Download PDF / Download XML buttons of one invoice document, and the "still in process" note for the file the
 * server cannot hand over yet (`available_files`). Shared by `InvoiceList` and `InvoiceDetail`. A link only exists when
 * the store gave a route (`fileHref`) or a handler (`onDownload`): a PAC URL never gets printed here.
 */
import type { InvoiceDoc, InvoiceFileKind } from '@asteby/storefront'
import { fill, type AccountMessages } from './orders-messages.js'
import { str } from './orders-ui.js'

export type InvoiceFileLinksProps = {
  doc: InvoiceDoc
  m: AccountMessages
  /** Heading name of the document ("A-10"), used in the accessible label. */
  name?: string
  fileHref?: ((doc: InvoiceDoc, kind: InvoiceFileKind) => string | null | undefined) | undefined
  onDownload?: ((doc: InvoiceDoc, kind: InvoiceFileKind) => void) | undefined
  classNames?: Partial<Record<'actions' | 'download' | 'note', string>>
}

export function InvoiceFileLinks({ doc, m, name, fileHref, onDownload, classNames: cx = {} }: InvoiceFileLinksProps) {
  if (!fileHref && !onDownload) return null
  const kindLabel = doc.kind === 'credit_note' ? m['invoice.creditNote'] : m['invoice.invoice']
  const label = name || str(doc.folio) || ''
  // The server says which files exist NOW (`available_files`); a kind it lacks is "in process", not a dead button.
  const has = (kind: InvoiceFileKind) => doc.available_files == null || doc.available_files.includes(kind)
  const link = (kind: InvoiceFileKind) => {
    if (!has(kind)) return null
    const text = kind === 'pdf' ? m['invoice.pdf'] : m['invoice.xml']
    const aria = fill(m['invoice.downloadOf'], { action: text, kind: kindLabel.toLowerCase(), name: label }).replace(/\s+,/g, ',').replace(/,\s*$/, '').trim()
    const href = fileHref?.(doc, kind)
    if (href) {
      return (
        <a key={kind} href={href} download className={cx.download} aria-label={aria} data-sf-invoice-download={kind}>
          {text}
        </a>
      )
    }
    if (onDownload) {
      return (
        <button key={kind} type="button" className={cx.download} aria-label={aria} onClick={() => onDownload(doc, kind)} data-sf-invoice-download={kind}>
          {text}
        </button>
      )
    }
    return null
  }
  return (
    <>
      <p className={cx.actions} data-sf-invoice-actions>
        {link('pdf')}
        {link('xml')}
      </p>
      {!has('pdf') || !has('xml') ? (
        <p className={cx.note} data-sf-invoice-file-pending={has('pdf') ? 'xml' : 'pdf'}>
          {has('pdf') ? m['invoice.xmlPending'] : m['invoice.pdfPending']}
        </p>
      ) : null}
    </>
  )
}
