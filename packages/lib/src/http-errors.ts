/**
 * Typed errors for API responses that are not what an API promises.
 *
 * A `/api/...` call that lands on the wrong upstream (a misrouted proxy, a
 * Next.js / SPA catch-all, a Cloudflare or nginx error page) answers with an
 * HTML document. Without a guard the page ends up rendered verbatim in a toast
 * or a modal ("<!DOCTYPE html><html lang=…"). The same happens one hop later
 * when a backend forwards an upstream's HTML body as its own JSON `message`.
 *
 * `HtmlResponseError` is what HTTP clients throw instead: a human message, the
 * technical detail (status, URL, a text snippet) kept apart for a collapsible
 * "details" section, and a short `correlationId` the user can quote to support.
 *
 * Pure: no React, no DOM, no axios — usable from any fetch/axios client,
 * including federated addon bundles.
 */

export const HTML_RESPONSE_ERROR_CODE = 'html_response'

const DEFAULT_HUMAN_MESSAGE =
  'The service answered with a web page instead of data. It may be misconfigured or temporarily unavailable.'

/** True when `value` is (the start of) an HTML document or fragment. */
export function looksLikeHtml(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const head = value.trimStart().slice(0, 512).toLowerCase()
  if (!head.startsWith('<')) return false
  return (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.startsWith('<body') ||
    /<(html|head|body|title|meta|script|div)[\s>/]/.test(head)
  )
}

/** True when a Content-Type header value declares HTML. */
export function isHtmlContentType(contentType: unknown): boolean {
  return typeof contentType === 'string' && /\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(contentType)
}

/** `<title>` of an HTML document, if any — often the only useful bit ("502 Bad Gateway"). */
export function htmlTitle(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
  return title || undefined
}

/** Plain-text excerpt of an HTML body for logs / a details panel (tags, scripts and styles stripped). */
export function htmlSnippet(html: string, max = 240): string {
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Short random id (e.g. `ERR-7K2Q9F`) to correlate what the user sees with logs and fleet reports. */
export function newCorrelationId(prefix = 'ERR'): string {
  let id = ''
  try {
    const bytes = new Uint8Array(4)
    globalThis.crypto.getRandomValues(bytes)
    id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')
  } catch {
    id = Math.random().toString(36).slice(2, 10)
  }
  return `${prefix}-${id.slice(0, 6).toUpperCase()}`
}

export interface HtmlResponseErrorInit {
  /** HTTP status of the response (the outer one when `embedded`). */
  status?: number
  /** `METHOD url` or just the url of the request. */
  url?: string
  /** Response Content-Type, when known. */
  contentType?: string
  /** The HTML that was received (never shown to the user as-is). */
  html?: string
  /**
   * True when the HTML arrived inside a JSON envelope (`{message:"<!DOCTYPE…"}`)
   * — i.e. the backend answered, but forwarded an upstream's page. False when
   * the response body itself was HTML.
   */
  embedded?: boolean
  /** Human message to show instead of the default. */
  message?: string
  correlationId?: string
}

/**
 * Thrown by HTTP clients when an API endpoint answers with HTML. `message` is
 * always human-readable; the raw page stays in `html` / `snippet` / `details()`.
 *
 * For compatibility with code that reads axios-style errors, it also carries a
 * `response` whose `data.message` is the human message (never the HTML).
 */
export class HtmlResponseError extends Error {
  readonly code = HTML_RESPONSE_ERROR_CODE
  readonly status?: number
  readonly url?: string
  readonly contentType?: string
  readonly html: string
  readonly title?: string
  readonly snippet: string
  readonly embedded: boolean
  readonly correlationId: string
  readonly response: {
    status?: number
    data: { success: false; code: string; message: string; correlation_id: string }
  }

  constructor(init: HtmlResponseErrorInit = {}) {
    const message = init.message || DEFAULT_HUMAN_MESSAGE
    super(message)
    this.name = 'HtmlResponseError'
    this.status = init.status
    this.url = init.url
    this.contentType = init.contentType
    this.html = init.html ?? ''
    this.title = this.html ? htmlTitle(this.html) : undefined
    this.snippet = this.html ? htmlSnippet(this.html) : ''
    this.embedded = !!init.embedded
    this.correlationId = init.correlationId || newCorrelationId()
    this.response = {
      status: init.status,
      data: { success: false, code: HTML_RESPONSE_ERROR_CODE, message, correlation_id: this.correlationId },
    }
  }

  /** Multi-line technical detail for a collapsible panel or a bug report. Never includes the full page. */
  details(): string {
    const lines = [
      `code: ${this.code}${this.embedded ? ' (html inside JSON message)' : ''}`,
      `correlation: ${this.correlationId}`,
    ]
    if (this.status !== undefined) lines.push(`status: ${this.status}`)
    if (this.url) lines.push(`request: ${this.url}`)
    if (this.contentType) lines.push(`content-type: ${this.contentType}`)
    if (this.title) lines.push(`page title: ${this.title}`)
    if (this.snippet) lines.push(`body: ${this.snippet}`)
    return lines.join('\n')
  }
}

export function isHtmlResponseError(error: unknown): error is HtmlResponseError {
  return (
    error instanceof HtmlResponseError ||
    (!!error && typeof error === 'object' && (error as { code?: unknown }).code === HTML_RESPONSE_ERROR_CODE &&
      (error as { name?: unknown }).name === 'HtmlResponseError')
  )
}

export interface DetectHtmlInput {
  status?: number
  url?: string
  contentType?: string
  /** Parsed body (object) or raw text. */
  body: unknown
  message?: string
}

/**
 * Inspect a response and return an `HtmlResponseError` when it is HTML — the
 * body itself, or a JSON envelope whose `message`/`error`/`detail` field is an
 * HTML page. Returns `undefined` for anything else (JSON, plain text, empty).
 */
export function detectHtmlResponse(input: DetectHtmlInput): HtmlResponseError | undefined {
  const { body } = input
  if (typeof body === 'string') {
    if (looksLikeHtml(body) || (isHtmlContentType(input.contentType) && body.trim() !== '')) {
      return new HtmlResponseError({ ...input, html: body, embedded: false })
    }
    return undefined
  }
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'title']) {
      const v = o[key]
      const nested = v && typeof v === 'object' ? (v as Record<string, unknown>).message : undefined
      const candidate = looksLikeHtml(v) ? v : looksLikeHtml(nested) ? nested : undefined
      if (typeof candidate === 'string') {
        return new HtmlResponseError({ ...input, html: candidate, embedded: true })
      }
    }
  }
  return undefined
}
