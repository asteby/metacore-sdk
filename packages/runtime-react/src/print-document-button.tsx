// PrintDocumentButton — a drop-in button that prints/downloads a server-rendered
// document via usePrintDocument, so an addon doesn't re-wire the hook + loading
// state every time. Headless-friendly: it renders a plain <button> you style
// with `className`, disables itself while the PDF is fetching, and reports
// failures through `onError` (no toast dependency baked in).
//
// Example:
//   <PrintDocumentButton model="SalesOrder" id={sale.id} documentKey="sale_ticket"
//     className="btn">Imprimir ticket</PrintDocumentButton>
import React, { useCallback, useState } from 'react'
import { usePrintDocument, type PrintDocumentArgs } from './use-print-document'

export interface PrintDocumentButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
    /** Model KEY the document is declared against (e.g. "SalesOrder"). */
    model: string
    /** Record id. */
    id: string
    /** Document key from contributions.documents[].key (e.g. "sale_ticket"). */
    documentKey: string
    /** print (default) | download | open — see usePrintDocument. */
    mode?: PrintDocumentArgs['mode']
    /** Download filename (mode="download"). */
    filename?: string
    /** Called if the fetch/print fails (surface it to a toast in the host). */
    onError?: (err: unknown) => void
    /** Rendered while the PDF is being fetched, in place of children. */
    pendingLabel?: React.ReactNode
    children?: React.ReactNode
}

export function PrintDocumentButton({
    model,
    id,
    documentKey,
    mode,
    filename,
    onError,
    pendingLabel,
    children,
    disabled,
    onClick,
    ...rest
}: PrintDocumentButtonProps) {
    const printDocument = usePrintDocument()
    const [busy, setBusy] = useState(false)

    const handleClick = useCallback(
        async (e: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(e)
            if (e.defaultPrevented) return
            setBusy(true)
            try {
                await printDocument({ model, id, key: documentKey, mode, filename })
            } catch (err) {
                onError?.(err)
            } finally {
                setBusy(false)
            }
        },
        [printDocument, model, id, documentKey, mode, filename, onError, onClick],
    )

    return (
        <button
            type="button"
            {...rest}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            onClick={handleClick}
        >
            {busy && pendingLabel != null ? pendingLabel : children}
        </button>
    )
}
