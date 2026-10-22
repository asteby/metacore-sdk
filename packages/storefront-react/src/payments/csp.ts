import type { PaymentClient } from '@asteby/storefront'

export type PaymentCspOptions = {
  /** Per-request nonce; also set it on the inserted `<script>` and on `<Scripts nonce>`. */
  nonce?: string
  /** Extra origins by directive (e.g. your image CDN). */
  extra?: { script?: string[]; frame?: string[]; connect?: string[]; img?: string[]; form?: string[] }
  /** `report-uri` / `report-to` target for the report-only rollout. */
  reportUri?: string
  /** Inline scripts allowed by hash (`'sha256-…'`), e.g. a theme bootstrap that runs before paint. */
  scriptHashes?: string[]
  /** Allow any https image source (product photos from a CDN). */
  imgHttps?: boolean
}

/** One origin source: `https://host`, `https://*.host`, optional port. Anything else (`;`, spaces, `'unsafe-eval'`) is dropped. */
const ORIGIN = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i

function origins(...lists: (readonly string[] | undefined)[]): string[] {
  const out = new Set<string>()
  for (const list of lists) for (const o of list ?? []) if (ORIGIN.test(o)) out.add(o)
  return [...out]
}

/**
 * Builds the Content-Security-Policy for the payment routes from what each provider declares
 * (`PaymentClient.csp`), so the shop never hard-codes provider hosts. Meant for `/pagar` only,
 * never for the whole site. Roll out as `Content-Security-Policy-Report-Only` first.
 *
 * No SRI on purpose: provider SDK URLs are unversioned and a hash would break payments on any update.
 */
export function paymentCsp(clients: readonly (PaymentClient | null | undefined)[], options: PaymentCspOptions = {}): string {
  const list = clients.filter((c): c is PaymentClient => !!c)
  const pick = (k: keyof NonNullable<PaymentClient['csp']>) => list.map((c) => c.csp?.[k])
  const nonce = options.nonce && /^[A-Za-z0-9+/=_-]+$/.test(options.nonce) ? options.nonce : undefined
  const sdkOrigins = list.flatMap((c) => {
    try {
      const u = new URL(c.sdk_url)
      return u.protocol === 'https:' ? [u.origin] : []
    } catch {
      return []
    }
  })
  const dir = (name: string, values: string[]) => `${name} ${values.join(' ')}`
  const parts = [
    "default-src 'self'",
    dir('script-src', ["'self'", ...(options.scriptHashes ?? []).filter((h) => /^'sha(256|384|512)-[A-Za-z0-9+/=]+'$/.test(h)), ...(nonce ? [`'nonce-${nonce}'`] : []), ...origins(sdkOrigins, ...pick('script'), options.extra?.script)]),
    dir('frame-src', origins(...pick('frame'), options.extra?.frame).length ? origins(...pick('frame'), options.extra?.frame) : ["'none'"]),
    dir('connect-src', ["'self'", ...origins(...pick('connect'), options.extra?.connect)]),
    dir('img-src', ["'self'", 'data:', ...(options.imgHttps ? ['https:'] : []), ...origins(...pick('img'), options.extra?.img)]),
    "style-src 'self' 'unsafe-inline'",
    dir('form-action', ["'self'", ...origins(...pick('form'), options.extra?.form)]),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ]
  if (options.reportUri && /^(https:\/\/|\/)[^\s;,]+$/.test(options.reportUri)) parts.push(`report-uri ${options.reportUri}`)
  return parts.join('; ')
}

/** `Content-Security-Policy` or, during the rollout week, `Content-Security-Policy-Report-Only`. */
export function paymentCspHeaderName(reportOnly: boolean): string {
  return reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
}

export type PaymentCspMode = 'off' | 'report-only' | 'enforce'

/** `PAYMENT_CSP`-style value: `off`, `report-only` or `enforce`. Unset: report-only in production, off elsewhere (dev servers inject scripts). */
export function paymentCspMode(value: string | null | undefined, production: boolean): PaymentCspMode {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === 'off' || raw === 'report-only' || raw === 'enforce') return raw
  return production ? 'report-only' : 'off'
}

/** Fresh per-request nonce (128 bits, base64). Works in Node, edge and browsers. */
export function paymentNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Header ready for the response (`{}` when `off`): policy from the providers' `client.csp`, never the whole site. */
export function paymentCspHeaders(
  clients: readonly (PaymentClient | null | undefined)[],
  options: PaymentCspOptions & { mode: PaymentCspMode },
): Record<string, string> {
  if (options.mode === 'off') return {}
  return { [paymentCspHeaderName(options.mode === 'report-only')]: paymentCsp(clients, options) }
}

/** The nonce the route left in the CSP header, to hand to `ServerRouter` / `<Scripts>`. */
export function paymentNonceFromHeaders(headers: Headers): string | undefined {
  const csp = headers.get('Content-Security-Policy') ?? headers.get('Content-Security-Policy-Report-Only') ?? ''
  return /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(csp)?.[1]
}
