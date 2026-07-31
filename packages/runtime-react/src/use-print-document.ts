// usePrintDocument — THE standard primitive for printing/downloading a
// server-rendered document (ticket, receipt, order) from any federated addon or
// host surface, without each addon reimplementing PDF fetching.
//
// The host (ops) renders documents declared in an addon's
// `contributions.documents[]` via a country/business-agnostic engine
// (pdf_chrome + document_render + org branding) and serves them at:
//
//   GET /api/data/:model/:id/documents/:key.pdf  → application/pdf
//
// The endpoint is auth-gated (Bearer), so we CANNOT just window.open the URL —
// that request carries no Authorization header and 401s. Instead we fetch the
// PDF through the injected ApiClient (which carries the token), turn the bytes
// into a blob URL, and print/download/open that. Re-printing is just calling
// this again — the render is an idempotent GET.
//
// The ApiClient is a PEER via <ApiProvider> (same one useAddonSettings uses), so
// this hook constructs no client of its own.
import { useCallback } from 'react'
import { useApi } from './api-context'

export interface PrintDocumentArgs {
    /** The model KEY the document is declared against (e.g. "SalesOrder"). */
    model: string
    /** The record id. */
    id: string
    /** The document key from contributions.documents[].key (e.g. "sale_ticket"). */
    key: string
    /**
     * print  → open the PDF in a hidden iframe and fire the browser print dialog
     *          (default; best for thermal tickets — one click to the printer).
     * download → save the PDF to disk.
     * open   → open the PDF in a new tab (user prints from the viewer).
     */
    mode?: 'print' | 'download' | 'open'
    /** Filename for the download mode (defaults to "<key>.pdf"). */
    filename?: string
}

/**
 * Returns a `printDocument(args)` callback. Resolves once the PDF has been
 * fetched and the browser action (print/download/open) has been kicked off;
 * rejects if the fetch fails (surface the error to a toast). Returns the blob
 * URL created, revoked automatically after a minute.
 */
export function usePrintDocument() {
    const api = useApi()
    return useCallback(
        async ({
            model,
            id,
            key,
            mode = 'print',
            filename,
        }: PrintDocumentArgs): Promise<string> => {
            const url = `/data/${encodeURIComponent(model)}/${encodeURIComponent(
                id,
            )}/documents/${encodeURIComponent(key)}.pdf`
            const res = await api.get(url, { responseType: 'blob' })
            const blob =
                res.data instanceof Blob
                    ? res.data
                    : new Blob([res.data], { type: 'application/pdf' })
            const blobUrl = URL.createObjectURL(blob)
            const cleanup = () => setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)

            if (mode === 'download') {
                const a = document.createElement('a')
                a.href = blobUrl
                a.download = filename || `${key}.pdf`
                document.body.appendChild(a)
                a.click()
                a.remove()
                cleanup()
                return blobUrl
            }

            if (mode === 'open') {
                window.open(blobUrl, '_blank')
                cleanup()
                return blobUrl
            }

            // mode === 'print': hidden iframe + contentWindow.print(). This is the
            // reliable cross-browser way to auto-open the print dialog for a PDF
            // blob (window.open + print() is blocked by the PDF viewer in Chrome).
            const iframe = document.createElement('iframe')
            iframe.style.position = 'fixed'
            iframe.style.right = '0'
            iframe.style.bottom = '0'
            iframe.style.width = '0'
            iframe.style.height = '0'
            iframe.style.border = '0'
            iframe.src = blobUrl
            iframe.onload = () => {
                try {
                    iframe.contentWindow?.focus()
                    iframe.contentWindow?.print()
                } catch {
                    // Popup/print blocked — fall back to opening the PDF.
                    window.open(blobUrl, '_blank')
                }
                // Keep the iframe around long enough for the print dialog to read it.
                setTimeout(() => iframe.remove(), 60_000)
                cleanup()
            }
            document.body.appendChild(iframe)
            return blobUrl
        },
        [api],
    )
}
