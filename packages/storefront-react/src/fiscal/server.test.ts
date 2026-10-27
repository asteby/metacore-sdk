import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorefrontClient, type StorefrontClient } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, MOCK_REGION_MX, createMockStorefront, type MockStorefrontOptions } from '@asteby/storefront/mock'
import { NO_FISCAL_CONTEXT, createInvoiceAction, formField, orderInvoiceBody, extractUploadedDocument, invoiceFromForm, loadFiscalContext, parseEvidence, type FiscalActionData } from './server.js'
import { CSF_FISICA_LINES, CSF_MORAL_LINES, CURP_FISICA, LOCKED_PDF_BASE64, RFC_FISICA, RFC_MORAL } from './__fixtures__/csf.js'
import { makeTextPdf } from './__fixtures__/pdf.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const FRESH = new Date('2024-04-01T12:00:00Z')
const SPEC = MOCK_REGION_MX.fiscal_id!.documents![0]!
const MORAL = { 'invoice.want': 'on', 'invoice.tax_id': RFC_MORAL, 'invoice.legal_name': 'EMPRESA DE PRUEBA SA DE CV', 'invoice.tax_regime': '601', 'invoice.use': 'G03', 'invoice.postal_code': '44100' }
const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))

function setup(opts: MockStorefrontOptions = {}) {
  const mock = createMockStorefront(opts)
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  const cookie = { parse: (h: string | null) => /sf_customer=([^;]+)/.exec(h ?? '')?.[1] ?? null }
  const action = createInvoiceAction({ storefront: sf, customerCookie: cookie, now: () => FRESH })
  const post = (fields: Record<string, string | Blob>, headers: Record<string, string> = {}) => {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return action({ request: new Request('https://shop.test/checkout', { method: 'POST', body: form, headers }) })
  }
  const signIn = async () => {
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const s = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
    return { Cookie: `sf_customer=${s.token}`, sf: sf.withCustomerToken(s.token) }
  }
  const cart = async () => {
    const product = (await sf.products.get('playera-basica'))!
    return sf.carts.create({ lines: [{ variant_id: product.variants.find((v) => v.available_for_sale)!.id, quantity: 1 }] })
  }
  return { mock, sf, post, signIn, cart }
}

describe('loadFiscalContext', () => {
  it('reads region and capabilities, with a short cache', async () => {
    const { sf } = setup()
    const spy = vi.spyOn(sf, 'region')
    let t = 1000
    const ctx = await loadFiscalContext(sf, { now: () => t })
    expect(ctx.available).toBe(true)
    expect(ctx.region?.country_code).toBe('MX')
    expect(ctx.invoicing).toMatchObject({ checkout: 'optional', identity_documents: ['MX:csf'] })
    t += 30_000
    await loadFiscalContext(sf, { now: () => t })
    expect(spy).toHaveBeenCalledTimes(1)
    t += 40_000
    await loadFiscalContext(sf, { now: () => t })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('degrades to "no invoicing" and never throws when the server is down or has no region', async () => {
    const down = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: async () => { throw new TypeError('network') } })
    expect(await loadFiscalContext(down)).toEqual(NO_FISCAL_CONTEXT)
    const noRegion = setup({ region: null })
    expect((await loadFiscalContext(noRegion.sf)).available).toBe(false)
    const off = setup({ customerCapabilities: { invoicing: { available: false, countries: [], checkout: 'off', post_purchase: false, identity_documents: [], online_verify: false } } })
    const c = await loadFiscalContext(off.sf)
    expect(c.available).toBe(false)
    expect(c.reason).toBe('off')
    expect(c.invoicing).toBeNull()
  })

  it('an older server without invoicing in capabilities means no invoicing', async () => {
    const { sf } = setup()
    vi.spyOn(sf.customer, 'capabilities').mockResolvedValue({ password: true, email_verification: false, otp_channels: [] })
    const c = await loadFiscalContext(sf)
    expect(c.available).toBe(false)
    // Nothing is known about the store: the page must not say that it does not invoice.
    expect(c.reason).toBe('unknown')
  })

  it('says unreachable when the server cannot be asked', async () => {
    const { sf } = setup()
    vi.spyOn(sf.customer, 'capabilities').mockRejectedValue(new Error('boom'))
    expect((await loadFiscalContext(sf)).reason).toBe('unreachable')
  })

  it('retries soon after a failure', async () => {
    const { sf } = setup()
    const caps = vi.spyOn(sf.customer, 'capabilities').mockRejectedValueOnce(new Error('boom'))
    let t = 0
    expect((await loadFiscalContext(sf, { now: () => t })).available).toBe(false)
    t += 6_000
    expect((await loadFiscalContext(sf, { now: () => t })).available).toBe(true)
    expect(caps).toHaveBeenCalledTimes(2)
  })
})

describe('forms', () => {
  it('invoiceFromForm reads the fields, normalizes the tax id and keeps only known evidence keys', () => {
    const form = new FormData()
    form.set('invoice.tax_id', ' abc 010203-ab1 ')
    form.set('invoice.document', JSON.stringify({ kind: 'MX:csf', source: 'pdf_client', sha256: 'a'.repeat(64), curp: CURP_FISICA, junk: 1, qr_match: true }))
    const inv = invoiceFromForm(form)
    expect(inv.tax_id).toBe('ABC010203AB1')
    expect(inv.document).toEqual({ kind: 'MX:csf', document_id: null, issued_on: null, sha256: 'a'.repeat(64), source: 'pdf_client', qr_match: true })
    expect(JSON.stringify(inv)).not.toContain(CURP_FISICA)
  })
  it('parseEvidence refuses garbage', () => {
    expect(parseEvidence('not json')).toBeUndefined()
    expect(parseEvidence(JSON.stringify({ kind: 'x', source: 'telepathy' }))).toBeUndefined()
    expect(parseEvidence('x'.repeat(5000))).toBeUndefined()
    expect(parseEvidence(JSON.stringify({ kind: 'x', source: 'manual', sha256: 'zz' }))?.sha256).toBeNull()
  })
})

describe('createInvoiceAction set-invoice', () => {
  it('validates against the region and stores the request on the cart', async () => {
    const { post, cart, sf } = setup()
    const c = await cart()
    const res = await post({ intent: 'set-invoice', cart_id: c.id, ...MORAL })
    expect(res).toMatchObject({ ok: true, intent: 'set-invoice', step: 'saved' })
    const got = await sf.carts.get(c.id)
    expect(got?.invoice).toMatchObject({ requested: true, legal_name: 'EMPRESA DE PRUEBA SA DE CV' })
    expect(got?.invoice?.tax_id_masked).not.toContain(RFC_MORAL)
  })

  it('maps a 422 to the exact form field and keeps what the buyer typed', async () => {
    const { post, cart } = setup()
    const c = await cart()
    const res = await post({ intent: 'set-invoice', cart_id: c.id, ...MORAL, 'invoice.tax_regime': '612' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatchObject({ code: 'validation', field: 'invoice.tax_regime' })
    expect(Object.keys(res.fieldErrors!)).toEqual(['invoice.tax_regime'])
    expect(res.values).toMatchObject({ tax_id: RFC_MORAL, tax_regime: '612' })
    const bad = await post({ intent: 'set-invoice', cart_id: c.id, ...MORAL, 'invoice.tax_id': 'NOPE' })
    expect(bad.error?.field).toBe('invoice.tax_id')
  })

  it('withdraws the request when the box is unchecked', async () => {
    const { post, cart, sf } = setup()
    const c = await cart()
    await post({ intent: 'set-invoice', cart_id: c.id, ...MORAL })
    const { 'invoice.want': _w, ...rest } = MORAL
    expect(await post({ intent: 'set-invoice', cart_id: c.id, ...rest })).toMatchObject({ ok: true, step: 'cleared' })
    expect((await sf.carts.get(c.id))?.invoice).toBeNull()
  })

  it('unknown cart is not_found; missing cart_id is validation', async () => {
    const { post } = setup()
    expect((await post({ intent: 'set-invoice', cart_id: 'cart_nope', ...MORAL })).error?.code).toBe('not_found')
    expect((await post({ intent: 'set-invoice', ...MORAL })).error?.code).toBe('validation')
  })
})

describe('createInvoiceAction profile', () => {
  it('needs a session and the buyer\'s consent, then saves; clear deletes (ARCO)', async () => {
    const { post, signIn } = setup()
    expect((await post({ intent: 'save-profile', consent: 'on', ...MORAL })).error?.code).toBe('unauthorized')
    const { Cookie, sf } = await signIn()
    expect((await post({ intent: 'save-profile', ...MORAL }, { Cookie })).error?.code).toBe('consent_required')
    const doc = JSON.stringify({ kind: 'MX:csf', source: 'pdf_client', document_id: '19010203040' })
    const saved = await post({ intent: 'save-profile', consent: 'on', ...MORAL, 'invoice.document': doc }, { Cookie })
    expect(saved).toMatchObject({ ok: true, step: 'saved' })
    const me = await sf.customer.get()
    expect(me.fiscal).toMatchObject({ tax_id: RFC_MORAL, tax_regime: '601', invoice_use: 'G03', postal_code: '44100' })
    expect(me.fiscal?.document).toMatchObject({ kind: 'MX:csf', document_id: '19010203040' })
    expect(await post({ intent: 'clear-profile' }, { Cookie })).toMatchObject({ ok: true, step: 'cleared' })
    expect((await sf.customer.get()).fiscal ?? null).toBeNull()
  })

  it('a 422 while saving points at the invoice field of the form', async () => {
    const { post, signIn } = setup()
    const { Cookie } = await signIn()
    const res = await post({ intent: 'save-profile', consent: 'on', ...MORAL, 'invoice.tax_id': 'NOPE' }, { Cookie })
    expect(res.error).toMatchObject({ code: 'validation', field: 'invoice.tax_id' })
  })
})

describe('createInvoiceAction request-invoice', () => {
  it('needs a session; unknown orders are not_found', async () => {
    const { post, signIn } = setup()
    expect((await post({ intent: 'request-invoice', order_id: 'ord_x', ...MORAL })).error?.code).toBe('unauthorized')
    const { Cookie } = await signIn()
    expect((await post({ intent: 'request-invoice', order_id: 'ord_nope', ...MORAL }, { Cookie })).error?.code).toBe('not_found')
    expect((await post({ intent: 'request-invoice', ...MORAL }, { Cookie })).error?.code).toBe('validation')
  })
})

describe('request-invoice body and field marking', () => {
  it('sends no `requested` flag and names the use `invoice_use`', () => {
    const body = orderInvoiceBody({ requested: true, tax_id: 'URE180429TM6', legal_name: 'X', tax_regime: '601', use: 'G03', postal_code: '86991', document: { kind: 'k', source: 'manual' } as never, save: true })
    expect(body).toEqual({ tax_id: 'URE180429TM6', legal_name: 'X', tax_regime: '601', postal_code: '86991', invoice_use: 'G03', save: true })
  })
  it('marks a control only when the server field maps to one', () => {
    expect(formField('fiscal.invoice_use', 'invoice')).toBe('invoice.use')
    expect(formField('invoice.razon_social', 'invoice')).toBe('invoice.legal_name')
    expect(formField('fiscal.requested', 'invoice')).toBeUndefined()
    expect(formField(undefined, 'invoice')).toBeUndefined()
  })
})

describe('createInvoiceAction safety', () => {
  it('refuses cross-site posts and unknown intents', async () => {
    const { post } = setup()
    expect((await post({ intent: 'clear-profile' }, { 'Sec-Fetch-Site': 'cross-site' })).error?.code).toBe('unsupported')
    expect((await post({ intent: 'clear-profile' }, { Origin: 'https://evil.test' })).error?.code).toBe('unsupported')
    expect((await post({ intent: 'clear-profile' }, { Origin: 'https://shop.test' })).error?.code).toBe('unauthorized') // got past the check
    expect((await post({ intent: 'steal-everything' })).error?.code).toBe('validation')
  })

  it('a store token without scope is reported as a store problem, not as the buyer\'s', async () => {
    const { sf, post, cart } = setup()
    const c = await cart()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { StorefrontError } = await import('@asteby/storefront')
    vi.spyOn(sf.carts, 'setInvoice').mockRejectedValue(new StorefrontError({ status: 403, code: 'insufficient_scope', message: 'x', requiredScopes: ['cart:write'] }))
    expect((await post({ intent: 'set-invoice', cart_id: c.id, ...MORAL })).error?.code).toBe('store_misconfigured')
  })
})

describe('extract-document without JavaScript (multipart)', () => {
  const upload = (post: ReturnType<typeof setup>['post'], file: Uint8Array | string, name = 'constancia.pdf') =>
    post({ intent: 'extract-document', document: new File([file as BlobPart], name, { type: 'application/pdf' }) })

  it('reads a persona física constancia in memory: values for review, evidence, and never the CURP', async () => {
    const { post } = setup()
    const res = (await upload(post, makeTextPdf([CSF_FISICA_LINES]))) as FiscalActionData
    expect(res).toMatchObject({ ok: true, step: 'review' })
    const x = res.extraction!
    expect(x.values).toMatchObject({ tax_id: RFC_FISICA, legal_name: 'JUAN CARLOS PEREZ PEREZ', postal_code: '06600' })
    expect(x.regime_candidates.sort()).toEqual(['605', '612'])
    expect(x.values.tax_regime).toBeUndefined() // two regimes: the buyer chooses
    expect(x.evidence).toMatchObject({ kind: 'MX:csf', source: 'pdf_server', qr_match: null })
    expect(x.evidence.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(res)).not.toContain(CURP_FISICA)
    expect(JSON.stringify(res)).not.toMatch(/REFORMA|JUAREZ/)
  })

  it('reads a persona moral constancia, with its single regime chosen', async () => {
    const { post } = setup()
    const res = await upload(post, makeTextPdf([CSF_MORAL_LINES]))
    expect(res.extraction!.values).toMatchObject({ tax_id: RFC_MORAL, tax_regime: '601', postal_code: '44100' })
    expect(res.extraction!.from_document).toEqual(expect.arrayContaining(['tax_id', 'legal_name', 'postal_code', 'tax_regime']))
  })

  it('a scanned PDF (no text layer) says no_text; a locked one says password; a non-PDF says not_pdf', async () => {
    const { post } = setup()
    expect((await upload(post, makeTextPdf([['']]))).error?.code).toBe('no_text')
    expect((await upload(post, bytes(LOCKED_PDF_BASE64))).error?.code).toBe('password')
    expect((await upload(post, 'GIF89a not a pdf at all')).error?.code).toBe('not_pdf')
    expect((await post({ intent: 'extract-document' })).error?.code).toBe('not_pdf')
  })

  it('refuses a file over 5 MiB (also by Content-Length, before buffering) and a document over the page limit', async () => {
    const { post, sf } = setup()
    expect((await upload(post, new Uint8Array(5 * 1024 * 1024 + 1))).error?.code).toBe('too_large')
    const action = createInvoiceAction({ storefront: sf })
    const r = await action({ request: new Request('https://shop.test/x', { method: 'POST', headers: { 'content-length': String(50 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--' }) })
    expect(r.error?.code).toBe('too_large')
    const seven = makeTextPdf(Array.from({ length: 7 }, (_, i) => [`Pagina ${i + 1}`]))
    expect((await upload(post, seven)).error?.code).toBe('too_large')
  })

  it('does not run when the store does not invoice', async () => {
    const { post } = setup({ region: null })
    expect((await upload(post, makeTextPdf([CSF_MORAL_LINES]))).error?.code).toBe('unsupported')
  })

  it('writes nothing to the console and the error never carries document text', async () => {
    const { post } = setup()
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const res = await upload(post, makeTextPdf([CSF_FISICA_LINES.slice(0, 3)]))
    await upload(post, bytes(LOCKED_PDF_BASE64))
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    expect(JSON.stringify(res)).not.toContain(RFC_FISICA)
    spies.forEach((s) => s.mockRestore())
  })

  it('extractUploadedDocument lets the region lower the limits, never raise them', async () => {
    const pdf = makeTextPdf([CSF_MORAL_LINES])
    await expect(extractUploadedDocument(new Blob([pdf as BlobPart]), { ...SPEC, max_bytes: 100 }, MOCK_REGION_MX)).rejects.toMatchObject({ code: 'too_large' })
    await expect(extractUploadedDocument(new Blob([pdf as BlobPart]), { ...SPEC, max_bytes: 999_999_999 }, MOCK_REGION_MX, { limits: { maxBytes: 100 } })).rejects.toMatchObject({ code: 'too_large' })
  })
})

describe('typing', () => {
  it('the action is usable as a route action', () => {
    const sf = {} as StorefrontClient
    expect(typeof createInvoiceAction({ storefront: sf })).toBe('function')
  })
})
