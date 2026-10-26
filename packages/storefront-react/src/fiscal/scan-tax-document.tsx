/**
 * "Scan your tax document": the entry point of the invoice flows (request an invoice, checkout, add a fiscal profile).
 * A primary button that names the region's document (`IdentityDocumentSpec.label`: another country says its own
 * document) and, under it, "Enter by hand". The button opens a bottom sheet with the `IdentityDocumentReader`: choose
 * the PDF, take a photo of the QR or scan it live, review, confirm.
 *
 * Degradation: when the region publishes no document the component renders nothing (the caller shows the plain form).
 * The file, the photo and the camera frames are read on the device and never uploaded (see the reader).
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { useModalDialog } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'
import { IdentityDocumentReader, type FiscalReaderResult, type IdentityDocumentReaderProps } from './document-reader.js'
import { fill, fiscalMessages } from './messages.js'

export type ScanTaxDocumentClassNames = IdentityDocumentReaderProps['classNames'] &
  Partial<Record<'actions' | 'trigger' | 'manual' | 'sheet' | 'sheetPanel' | 'sheetHeader' | 'sheetTitle' | 'sheetClose', string>>

export type ScanTaxDocumentProps = Omit<IdentityDocumentReaderProps, 'onConfirm' | 'onManual' | 'classNames' | 'confirmLabel'> & {
  /** The buyer confirmed the reviewed data (the sheet is already closed). */
  onConfirm: (result: FiscalReaderResult) => void
  /** The buyer chose to type their data (the sheet is already closed). */
  onManual: () => void
  /** Label of the confirm button inside the sheet. */
  confirmLabel?: ReactNode
  classNames?: ScanTaxDocumentClassNames
}

export function ScanTaxDocument(props: ScanTaxDocumentProps) {
  const { onConfirm, onManual, classNames: cx = {}, messages, confirmLabel, ...reader } = props
  const locale = useResolvedLocale(props.locale)
  const m = fiscalMessages(locale, messages).reader
  const spec = props.document ?? props.region.fiscal_id?.documents?.[0]
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const { ref, onBackdropClick } = useModalDialog({ open, onClose: () => setOpen(false) })
  const opener = useRef<HTMLButtonElement>(null)
  if (!spec) return null
  const name = props.documentName ?? spec.label.toLowerCase()

  return (
    <div className={cx.actions} data-sf-scan>
      <button ref={opener} type="button" className={cx.trigger ?? cx.primary} onClick={() => setOpen(true)} aria-haspopup="dialog" data-sf-scan-open>
        {fill(m.scan.open, { document: spec.label })}
      </button>
      <button type="button" className={cx.manual ?? cx.secondary} onClick={onManual} data-sf-scan-manual>
        {m.scan.manual}
      </button>
      {open ? (
        <dialog ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onBackdropClick} onClose={() => setOpen(false)} className={cx.sheet} data-sf-scan-sheet>
          <div className={cx.sheetPanel} data-sf-scan-panel>
            <div className={cx.sheetHeader} data-sf-scan-header>
              <h2 id={titleId} className={cx.sheetTitle} data-sf-scan-title>
                {fill(m.scan.title, { document: name })}
              </h2>
              <button type="button" className={cx.sheetClose} onClick={() => setOpen(false)} aria-label={m.scan.close} data-sf-scan-close data-sf-autofocus>
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <IdentityDocumentReader
              {...reader}
              locale={locale}
              {...(messages ? { messages } : {})}
              {...(confirmLabel ? { confirmLabel } : {})}
              classNames={cx}
              onConfirm={(result) => {
                setOpen(false)
                onConfirm(result)
              }}
              onManual={() => {
                setOpen(false)
                onManual()
              }}
            />
          </div>
        </dialog>
      ) : null}
    </div>
  )
}
