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
import { toast } from 'sonner'
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
    /**
     * Hint filename for download mode. Prefer leaving this unset: the server
     * expands `{{record.*}}` into Content-Disposition. A raw template string
     * (e.g. "cfdi-{{record.number}}.pdf") must NOT be used as a.download —
     * that is how downloads end up literally named with mustache braces.
     */
    filename?: string
    /**
     * User feedback. Default: a toast while the file is prepared, a success toast
     * when it is ready and an error toast with the server's reason when it fails
     * (a download used to give NO sign of life — PIT «Descargar Factura CFDI»).
     * `false` silences all of it; `{ error: false }` leaves errors to the caller
     * (the promise still rejects either way).
     */
    feedback?: boolean | { progress?: boolean; success?: boolean; error?: boolean }
}

const noun = (mode: 'print' | 'download' | 'open') =>
    mode === 'download' ? 'Descargando documento…' : mode === 'open' ? 'Abriendo documento…' : 'Preparando impresión…'

const readyMessage = (mode: 'print' | 'download' | 'open') =>
    mode === 'download' ? 'Documento descargado' : mode === 'open' ? 'Documento abierto' : 'Documento listo para imprimir'

/** Best-effort message from an error whose body is a Blob (responseType: 'blob'). */
export async function documentErrorMessage(err: unknown): Promise<string> {
    const fallback = 'No se pudo generar el documento. Inténtalo de nuevo.'
    const e = err as { response?: { data?: unknown; status?: number }; message?: unknown } | undefined
    let data = e?.response?.data
    try {
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
            data = JSON.parse(await data.text())
        }
    } catch {
        data = undefined
    }
    const d = data as { message?: unknown; details?: unknown; error?: unknown } | string | undefined
    if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 200)
    if (d && typeof d === 'object') {
        const msg = [d.message, d.details, d.error].find((x) => typeof x === 'string' && x.trim()) as string | undefined
        if (msg) return msg.trim()
    }
    if (e?.response?.status === 404) return 'El documento no está disponible todavía.'
    return fallback
}

/** Parse filename from Content-Disposition (RFC 5987 / quoted). */
export function filenameFromContentDisposition(header: string | undefined | null): string | undefined {
    if (!header) return undefined
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
        } catch {
            return star[1].trim().replace(/^"|"$/g, '')
        }
    }
    const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header)
    const raw = (plain?.[1] ?? plain?.[2] ?? '').trim()
    return raw || undefined
}

/** True when a caller passed an unexpanded mustache template as filename. */
export function looksLikeFilenameTemplate(name: string | undefined): boolean {
    return !!name && /\{\{/.test(name)
}

/**
 * Returns a `printDocument(args)` callback. Resolves once the PDF has been
 * fetched and the browser action (print/download/open) has been kicked off;
 * rejects if the fetch fails (surface the error to a toast). Returns the blob
 * URL created, revoked automatically after a minute.
 */
export function usePrintDocument() {
    const api = useApi()
    const run = useCallback(
        async ({
            model,
            id,
            key,
            mode,
            filename,
        }: Required<Pick<PrintDocumentArgs, 'model' | 'id' | 'key' | 'mode'>> & Pick<PrintDocumentArgs, 'filename'>): Promise<string> => {
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
                const headers = (res as { headers?: Record<string, string> }).headers || {}
                const fromHeader =
                    filenameFromContentDisposition(
                        headers['content-disposition'] || headers['Content-Disposition'],
                    ) || undefined
                // Prefer server-expanded name; never use a raw {{record.*}} template.
                const downloadName =
                    fromHeader ||
                    (!looksLikeFilenameTemplate(filename) ? filename : undefined) ||
                    `${key}.pdf`
                const a = document.createElement('a')
                a.href = blobUrl
                a.download = downloadName
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
    return useCallback(
        async ({
            model,
            id,
            key,
            mode = 'print',
            filename,
            feedback = true,
        }: PrintDocumentArgs): Promise<string> => {
            const fb = feedback === false ? {} : feedback === true ? { progress: true, success: true, error: true } : feedback
            const toastId = fb.progress ? toast.loading(noun(mode)) : undefined
            try {
                const blobUrl = await run({ model, id, key, mode, filename })
                if (toastId !== undefined) toast.dismiss(toastId)
                if (fb.success) toast.success(readyMessage(mode))
                return blobUrl
            } catch (err) {
                if (toastId !== undefined) toast.dismiss(toastId)
                if (fb.error) toast.error(await documentErrorMessage(err))
                throw err
            } finally {
                if (toastId !== undefined) toast.dismiss(toastId)
            }
        },
        [run],
    )
}
