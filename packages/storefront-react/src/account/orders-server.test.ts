import { describe, expect, it } from 'vitest'
import { createStorefrontClient, StorefrontError } from '@asteby/storefront'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL } from '@asteby/storefront/mock'
import { invoiceFileResponse, pendingVoucherResponse } from './server.js'

async function buyer() {
  const mock = createMockStorefront()
  const base = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  await base.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const s = await base.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
  return { storefront: base.withCustomerToken(s.token), anonymous: base, mock }
}

describe('invoiceFileResponse', () => {
  it('streams the file as an attachment with no-store and no way to render it under the store origin', async () => {
    const { storefront } = await buyer()
    const res = await invoiceFileResponse({ storefront, orderId: 'ord_seed_shipped', invoiceId: 'inv_seed_1', kind: 'pdf' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="factura-inv_seed_1.pdf"')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("sandbox")
    expect(await res.text()).toContain('%PDF')
    const xml = await invoiceFileResponse({ storefront, orderId: 'ord_seed_shipped', invoiceId: 'inv_seed_1_nc', kind: 'xml' })
    expect(xml.headers.get('content-type')).toBe('application/xml')
    expect(xml.headers.get('content-disposition')).toContain('nota-de-credito-inv_seed_1_nc.xml')
  })

  it('takes the content type from the kind, never from the API', async () => {
    const { storefront } = await buyer()
    const evil = { ...storefront, customer: { ...storefront.customer, invoiceFile: async () => ({ filename: '../../x"\r\nSet-Cookie: a=b.html', content_type: 'text/html', content_base64: btoa('<script>alert(1)</script>') }) } } as typeof storefront
    const res = await invoiceFileResponse({ storefront: evil, orderId: 'o', invoiceId: 'i', kind: 'pdf' })
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const disposition = res.headers.get('content-disposition')!
    expect(disposition).not.toMatch(/[\r\n]|\.\.|\/|\\/)
    expect(disposition.slice('attachment; filename="'.length, -1)).not.toContain('"')
    expect(disposition.endsWith('.pdf"')).toBe(true)
  })

  it('404s a bad kind, a missing document and someone else\'s order; 401 without a session; generic 502 otherwise', async () => {
    const { storefront, anonymous } = await buyer()
    for (const kind of ['exe', undefined, '../pdf']) expect((await invoiceFileResponse({ storefront, orderId: 'ord_seed_shipped', invoiceId: 'inv_seed_1', kind })).status).toBe(404)
    expect((await invoiceFileResponse({ storefront, orderId: 'ord_seed_shipped', invoiceId: 'nope', kind: 'pdf' })).status).toBe(404)
    expect((await invoiceFileResponse({ storefront, orderId: 'ord_nope', invoiceId: 'inv_seed_1', kind: 'pdf' })).status).toBe(404)
    expect((await invoiceFileResponse({ storefront: anonymous, orderId: 'ord_seed_shipped', invoiceId: 'inv_seed_1', kind: 'pdf' })).status).toBe(401)
    const boom = { customer: { invoiceFile: async () => { throw new StorefrontError({ status: 500, code: 'server_error', message: 'secret upstream detail https://pac.example.com' }) } } } as never
    const res = await invoiceFileResponse({ storefront: boom, orderId: 'o', invoiceId: 'i', kind: 'pdf' })
    expect(res.status).toBe(502)
    expect(await res.text()).not.toMatch(/secret|pac\.example/)
    const limited = { customer: { invoiceFile: async () => { throw new StorefrontError({ status: 429, code: 'rate_limited', message: 'x', retryAfter: 12.2 }) } } } as never
    const r429 = await invoiceFileResponse({ storefront: limited, orderId: 'o', invoiceId: 'i', kind: 'pdf' })
    expect([r429.status, r429.headers.get('retry-after')]).toEqual([429, '13'])
  })
})

describe('pendingVoucherResponse', () => {
  it('serves the printable voucher of one of the buyer\'s pending payments with a locked-down CSP', async () => {
    const { storefront } = await buyer()
    const res = await pendingVoucherResponse({ storefront, id: 'chk_seed_oxxo', shopName: 'Tienda', timeZone: 'UTC' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    const csp = res.headers.get('content-security-policy')!
    expect(csp).toContain("default-src 'none'")
    const nonce = /nonce-([^']+)'/.exec(csp)![1]!
    const html = await res.text()
    expect(html).toContain(`nonce="${nonce}"`)
    expect(html).toContain('12345678901234')
    expect(res.headers.get('content-disposition')).toBeNull()
  })

  it('delivers a file on request, and 404s an id that is not the buyer\'s', async () => {
    const { storefront } = await buyer()
    const dl = await pendingVoucherResponse({ storefront, id: 'chk_seed_oxxo', download: true })
    expect(dl.headers.get('content-disposition')).toBe('attachment; filename="ficha-de-pago-chkseedo.html"')
    expect(await dl.text()).not.toContain('<script')
    expect((await pendingVoucherResponse({ storefront, id: 'chk_someone_else' })).status).toBe(404)
  })

  it('401s without a session', async () => {
    const { anonymous } = await buyer()
    expect((await pendingVoucherResponse({ storefront: anonymous, id: 'chk_seed_oxxo' })).status).toBe(401)
  })
})
