/**
 * Server side of the fiscal components (`@asteby/storefront-react/fiscal/server`): `loadFiscalContext` for the loader and
 * `createInvoiceAction` for the action. No React, no router: Web `Request`/`Response` only, so any framework mounts it.
 *
 * The browser never talks to OPS. The action uses the store's `sk_` client and the buyer's session token (read from the
 * store's cookie). A tax document uploaded WITHOUT JavaScript is read in memory here with the same engine the browser
 * uses, and discarded: no disk, no logs, no copy.
 */
import {
  isStorefrontError,
  repairPath,
  type FiscalDocumentEvidence,
  type FiscalIdentityInput,
  type InvoiceRequest,
  type InvoicingCapabilities,
  type Region,
  type StorefrontClient,
} from '@asteby/storefront'
import { normalizeTaxId } from './format.js'
import { extractUploadedDocument, UPLOAD_LIMITS, type UploadLimits } from './server-extract.js'
import type { FiscalActionData, FiscalErrorCode, FiscalIntent } from './types.js'

export type { FiscalActionData, FiscalErrorCode, FiscalIntent } from './types.js'
export { UPLOAD_LIMITS, extractUploadedDocument } from './server-extract.js'
export type { UploadLimits } from './server-extract.js'

// ---- context ---------------------------------------------------------------------------------------------------------

export type FiscalContext = {
  /** The store can invoice: it has a region with a fiscal catalog and `capabilities.invoicing.available`. */
  available: boolean
  region: Region | null
  invoicing: InvoicingCapabilities | null
}

/** What is assumed when the store cannot be asked: no invoicing, nothing breaks. */
export const NO_FISCAL_CONTEXT: Readonly<FiscalContext> = Object.freeze({ available: false, region: null, invoicing: null })

const FAILURE_TTL_MS = 5_000
const cache = new WeakMap<object, { at: number; ok: boolean; value: FiscalContext }>()

export type LoadFiscalContextOptions = {
  /** How long a good answer is reused per client (default 60 s). `0` disables the cache. */
  ttlMs?: number
  signal?: AbortSignal
  now?: () => number
}

/**
 * Asks the store for its region and what invoicing it offers, with a short cache per client. It NEVER throws: when OPS
 * does not answer (older server, outage, token without scope) it returns `NO_FISCAL_CONTEXT` and retries after a few
 * seconds, so a checkout without invoicing keeps working. Use it as the loader: `loader = () => loadFiscalContext(sf)`.
 */
export async function loadFiscalContext(sf: StorefrontClient, options: LoadFiscalContextOptions = {}): Promise<FiscalContext> {
  const now = options.now ?? Date.now
  const ttl = options.ttlMs ?? 60_000
  const hit = cache.get(sf)
  if (hit && now() - hit.at < (hit.ok ? ttl : FAILURE_TTL_MS)) return hit.value
  const opt = options.signal ? { signal: options.signal } : undefined
  const [region, caps] = await Promise.allSettled([sf.region(opt), sf.customer.capabilities(opt)])
  const reg = region.status === 'fulfilled' ? region.value : null
  const invoicing = caps.status === 'fulfilled' ? (caps.value?.invoicing ?? null) : null
  const ok = region.status === 'fulfilled' && caps.status === 'fulfilled'
  const value: FiscalContext = {
    available: !!reg?.fiscal_id && !!invoicing?.available,
    region: reg,
    invoicing: invoicing?.available ? invoicing : null,
  }
  cache.set(sf, { at: now(), ok, value: ok ? value : value.available ? value : NO_FISCAL_CONTEXT })
  return ok || value.available ? value : NO_FISCAL_CONTEXT
}

// ---- action ----------------------------------------------------------------------------------------------------------

/** What the action needs of a cookie to read the buyer's session. React Router's `createCookie(...)` fits as it is. */
export type SessionCookie = { parse(header: string | null): unknown }

export type CreateInvoiceActionOptions = {
  storefront: StorefrontClient
  /** The store's cookie for the buyer session token (`createCookie('sf_customer', ...)`), to know who is asking. */
  customerCookie?: SessionCookie
  /** Alternative to `customerCookie`: returns the buyer's session token, or `null` for a guest. */
  readCustomerToken?: (request: Request) => string | null | undefined | Promise<string | null | undefined>
  /** Shopper IP for the per-shopper rate limit (see `clientIp` of the client). */
  clientIp?: (request: Request) => string | null | undefined
  /** Region + capabilities source, for tests or a shared cache (default `loadFiscalContext`). */
  context?: (sf: StorefrontClient) => Promise<FiscalContext>
  /** Limits of the no-JS upload (defaults: 5 MiB, 6 pages, 3 s). The region's own limits can only lower them. */
  limits?: Partial<UploadLimits>
  /** Clock, for the freshness check. */
  now?: () => Date
  /** Rejects cross-site posts (default `true`): `Origin` and `Sec-Fetch-Site` must match the site. */
  sameSiteOnly?: boolean
  /** Prefix of the form fields (default `invoice`). */
  namePrefix?: string
}

const EVIDENCE_SOURCES = new Set(['pdf_client', 'pdf_server', 'qr', 'manual'])

/** Reads the evidence the reader put in the form, keeping only the known keys (a form is untrusted input). */
export function parseEvidence(raw: unknown): FiscalDocumentEvidence | undefined {
  if (typeof raw !== 'string' || !raw || raw.length > 4096) return undefined
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof o !== 'object' || o === null) return undefined
  const e = o as Record<string, unknown>
  if (typeof e.kind !== 'string' || !e.kind || typeof e.source !== 'string' || !EVIDENCE_SOURCES.has(e.source)) return undefined
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null)
  return {
    kind: e.kind.slice(0, 64),
    document_id: str(e.document_id, 64),
    issued_on: str(e.issued_on, 32),
    sha256: typeof e.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256) ? e.sha256 : null,
    ...(typeof e.extractor === 'string' ? { extractor: e.extractor.slice(0, 64) } : {}),
    source: e.source as FiscalDocumentEvidence['source'],
    qr_match: typeof e.qr_match === 'boolean' ? e.qr_match : null,
  }
}

/** Reads the `invoice.*` fields of a form into the API's `InvoiceRequest`. */
export function invoiceFromForm(form: FormData, prefix = 'invoice'): InvoiceRequest {
  const text = (k: string) => {
    const v = form.get(`${prefix}.${k}`)
    return typeof v === 'string' ? v.trim() : ''
  }
  const evidence = parseEvidence(form.get(`${prefix}.document`))
  const out: InvoiceRequest = {
    requested: true,
    tax_id: normalizeTaxId(text('tax_id')),
    legal_name: text('legal_name'),
    tax_regime: text('tax_regime'),
    use: text('use'),
    postal_code: text('postal_code'),
  }
  if (evidence) out.document = evidence
  if (form.get(`${prefix}.save`)) out.save = true
  return out
}

const fail = (intent: FiscalIntent | undefined, code: FiscalErrorCode, extra: Partial<FiscalActionData> = {}): FiscalActionData => ({
  ok: false,
  ...(intent ? { intent } : {}),
  ...extra,
  error: { code, ...(extra.error?.field ? { field: extra.error.field } : {}), ...(extra.error?.blocked ? { blocked: extra.error.blocked } : {}) },
})

const LOG_EVERY_MS = 60_000
let lastLogAt = -Infinity
function logMisconfigured(scopes: readonly string[]): void {
  const t = Date.now()
  if (t - lastLogAt < LOG_EVERY_MS) return
  lastLogAt = t
  console.error(
    `[@asteby/storefront-react] La credencial de la tienda no tiene permisos${scopes.length ? ` (${scopes.join(', ')})` : ''}; ` +
      `la facturación no funciona hasta repararlo en ${repairPath()}.`,
  )
}

/** `fiscal.tax_regime` (profile) and `invoice.tax_regime` (cart, order) both name the same form control. */
const formField = (field: string | undefined, prefix: string) => (field ? field.replace(/^(fiscal|invoice)\./, `${prefix}.`) : undefined)

function toFailure(err: unknown, intent: FiscalIntent, prefix: string, values?: Partial<FiscalActionData['values']>): FiscalActionData {
  const carry: Partial<FiscalActionData> = values ? { values } : {}
  if (!isStorefrontError(err)) return fail(intent, 'unavailable', carry)
  if (err.code === 'insufficient_scope') {
    logMisconfigured(err.requiredScopes)
    return fail(intent, 'store_misconfigured', carry)
  }
  const details = (err.details ?? {}) as { reason?: unknown; blocked_reason?: unknown }
  switch (err.status) {
    case 401:
      return fail(intent, 'unauthorized', carry)
    case 404:
      return fail(intent, 'not_found', carry)
    case 409: {
      const why = typeof details.reason === 'string' ? details.reason : typeof details.blocked_reason === 'string' ? details.blocked_reason : ''
      return fail(intent, why === 'already_checked_out' ? 'not_found' : 'blocked', { ...carry, ...(why ? { error: { code: 'blocked', blocked: why } } : {}) })
    }
    case 422:
    case 400: {
      const field = formField(err.field, prefix)
      return fail(intent, 'validation', {
        ...carry,
        ...(field ? { fieldErrors: { [field]: err.message || 'invalid' }, error: { code: 'validation', field } } : {}),
      })
    }
    case 429:
      return fail(intent, 'rate_limited', carry)
    case 403:
      return fail(intent, 'unsupported', carry)
    default:
      return fail(intent, 'unavailable', carry)
  }
}

function sameSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
    return new URL(origin).host === host.split(',')[0]!.trim()
  } catch {
    return false
  }
}

/**
 * The invoicing action: one `POST` form with an `intent` field.
 *
 * | intent             | fields                                              | does                                                       |
 * | ------------------ | --------------------------------------------------- | ---------------------------------------------------------- |
 * | `set-invoice`      | cart_id, invoice.* (`invoice.want` unset withdraws) | `carts.setInvoice`: validates against the region BEFORE paying |
 * | `save-profile`     | invoice.*, consent                                  | `customer.update({ fiscal })`, needs a session and consent |
 * | `request-invoice`  | order_id, invoice.*                                 | `customer.requestInvoice` (invoice after the purchase)     |
 * | `clear-profile`    | -                                                   | `customer.update({ fiscal: null })` (the buyer's right to delete) |
 * | `extract-document` | document (file), document_kind?                    | reads the file in memory, discards it, `step: 'review'`    |
 *
 * It never redirects: it returns a `FiscalActionData` for the page to render (`<InvoiceToggle data={...}>`), with 422s
 * mapped to the field (`fieldErrors['invoice.tax_regime']`). The tax id of the buyer is never logged.
 */
export function createInvoiceAction(options: CreateInvoiceActionOptions) {
  const { storefront: sf } = options
  const prefix = options.namePrefix ?? 'invoice'
  const loadContext = options.context ?? ((c: StorefrontClient) => loadFiscalContext(c))
  const limits: UploadLimits = { ...UPLOAD_LIMITS, ...options.limits }

  async function sessionToken(request: Request): Promise<string | null> {
    if (options.readCustomerToken) return (await options.readCustomerToken(request)) || null
    if (!options.customerCookie) return null
    const v = await options.customerCookie.parse(request.headers.get('cookie'))
    return typeof v === 'string' && v ? v : null
  }

  return async function invoiceAction({ request }: { request: Request }): Promise<FiscalActionData> {
    if (options.sameSiteOnly !== false && !sameSite(request)) return fail(undefined, 'unsupported')
    // A file bigger than the limit is refused before it is buffered.
    const declared = Number(request.headers.get('content-length') ?? 0)
    if (declared > limits.maxBytes + 256 * 1024) return fail('extract-document', 'too_large')
    const form = await request.formData().catch(() => null)
    if (!form) return fail(undefined, 'validation')
    const intent = form.get('intent') as FiscalIntent
    const ip = options.clientIp?.(request)
    const token = await sessionToken(request)
    const w = { ...(ip ? { clientIp: ip } : {}), ...(token ? { customerToken: token } : {}) }
    const invoice = invoiceFromForm(form, prefix)
    const echo = { tax_id: invoice.tax_id ?? '', legal_name: invoice.legal_name ?? '', postal_code: invoice.postal_code ?? '', tax_regime: invoice.tax_regime ?? '', use: invoice.use ?? '' }
    const text = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' ? v.trim() : ''
    }

    try {
      switch (intent) {
        case 'set-invoice': {
          const cartId = text('cart_id')
          if (!cartId) return fail(intent, 'validation')
          if (!form.get(`${prefix}.want`) && !form.get(`${prefix}.requested`)) {
            await sf.carts.setInvoice(cartId, null, w)
            return { ok: true, intent, step: 'cleared' }
          }
          await sf.carts.setInvoice(cartId, invoice, w)
          return { ok: true, intent, step: 'saved', values: echo }
        }
        case 'save-profile': {
          if (!token) return fail(intent, 'unauthorized', { values: echo })
          if (!form.get('consent')) return fail(intent, 'consent_required', { values: echo })
          const fiscal: FiscalIdentityInput = {
            tax_id: invoice.tax_id ?? '',
            legal_name: invoice.legal_name ?? '',
            tax_regime: invoice.tax_regime ?? '',
            postal_code: invoice.postal_code ?? '',
            invoice_use: invoice.use ?? '',
            ...(invoice.document ? { document: invoice.document } : {}),
          }
          await sf.customer.update({ fiscal }, w)
          return { ok: true, intent, step: 'saved', values: echo }
        }
        case 'clear-profile': {
          if (!token) return fail(intent, 'unauthorized')
          await sf.customer.update({ fiscal: null }, w)
          return { ok: true, intent, step: 'cleared' }
        }
        case 'request-invoice': {
          if (!token) return fail(intent, 'unauthorized', { values: echo })
          const orderId = text('order_id')
          if (!orderId) return fail(intent, 'validation')
          const result = await sf.customer.requestInvoice(orderId, invoice, w)
          return { ok: true, intent, step: result.status === 'issued' ? 'issued' : 'pending', result, ...(result.invoice ? { invoice: result.invoice } : {}) }
        }
        case 'extract-document': {
          const ctx = await loadContext(sf)
          const region = ctx.region
          const kind = text('document_kind')
          const specs = region?.fiscal_id?.documents ?? []
          const spec = (kind ? specs.find((d) => d.kind === kind) : specs[0]) ?? undefined
          if (!ctx.available || !region || !spec) return fail(intent, 'unsupported')
          const file = form.get('document')
          if (!file || typeof file === 'string' || file.size === 0) return fail(intent, 'not_pdf')
          try {
            const extraction = await extractUploadedDocument(file, spec, region, { limits, ...(options.now ? { now: options.now() } : {}) })
            return { ok: true, intent, step: 'review', extraction }
          } catch (err) {
            const code = (err as { code?: string } | null)?.code
            const known: FiscalErrorCode[] = ['not_pdf', 'too_large', 'no_text', 'password', 'unreadable']
            // Never log the error: it can carry text from the document.
            return fail(intent, known.includes(code as FiscalErrorCode) ? (code as FiscalErrorCode) : 'unreadable')
          }
        }
        default:
          return fail(undefined, 'validation')
      }
    } catch (err) {
      return toFailure(err, intent, prefix, intent === 'clear-profile' ? undefined : echo)
    }
  }
}

export type InvoiceAction = ReturnType<typeof createInvoiceAction>
