/**
 * Small, dependency-free helpers of the invoice file buttons (kept apart from the preview dialog, which loads on demand):
 * ask the buyer's route for a file at this moment, read the name the server sent, save the bytes.
 */
export type InvoiceFileErrorKind = 'not_ready' | 'not_found' | 'unauthorized' | 'rate_limited' | 'unavailable'

export type InvoiceFetchResult = { ok: true; blob: Blob; filename: string | null } | { ok: false; code: InvoiceFileErrorKind; status: number }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** `attachment; filename="a.pdf"; filename*=UTF-8''a.pdf` → `a.pdf` (a bare name: no path, nothing else). */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  let raw: string | null = null
  if (star) {
    try {
      raw = decodeURIComponent(star[1]!.trim())
    } catch {
      raw = null
    }
  }
  if (!raw) raw = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim() ?? null
  if (!raw) return null
  const clean = (raw.split(/[\\/]/).pop() ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120)
  return clean || null
}

/** The route's URL for the inline preview of the PDF. */
export function inlineHref(href: string): string {
  if (/[?&]inline=1(?:&|#|$)/.test(href)) return href
  const hash = href.indexOf('#')
  const base = hash >= 0 ? href.slice(0, hash) : href
  return `${base}${base.includes('?') ? '&' : '?'}inline=1${hash >= 0 ? href.slice(hash) : ''}`
}

const CODES: Record<number, InvoiceFileErrorKind> = { 401: 'unauthorized', 404: 'not_found', 409: 'not_ready', 429: 'rate_limited' }

/** Asks the buyer's route for a file at this moment. The answer is the bytes or a coded error (`not_ready` = still being generated). */
export async function fetchInvoiceFile(href: string, opts: { fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<InvoiceFetchResult> {
  const f: FetchLike | undefined = opts.fetch ?? (typeof fetch === 'function' ? (i, init) => fetch(i, init) : undefined)
  if (!f) return { ok: false, code: 'unavailable', status: 0 }
  try {
    const init: RequestInit = { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' }
    if (opts.signal) init.signal = opts.signal
    const res = await f(href, init)
    if (res.ok) {
      // A 200 that is JSON / text is not a file (a proxy page): never saved as one.
      const type = (res.headers.get('content-type') ?? '').toLowerCase()
      if (type.includes('json') || type.startsWith('text/')) return { ok: false, code: 'unavailable', status: res.status }
      return { ok: true, blob: await res.blob(), filename: filenameFromDisposition(res.headers.get('content-disposition')) }
    }
    return { ok: false, code: CODES[res.status] ?? 'unavailable', status: res.status }
  } catch {
    return { ok: false, code: 'unavailable', status: 0 }
  }
}

/** Saves a blob under a name, the way a click on a `download` link would. */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
