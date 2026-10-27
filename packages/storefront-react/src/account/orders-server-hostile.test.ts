// The resource routes facing a hostile or broken upstream, through the real client (the same door as production).
import { describe, expect, it } from 'vitest'
import { createStorefrontClient, type StorefrontClient } from '@asteby/storefront'
import { invoiceFileResponse, pendingVoucherResponse } from './server.js'

const SECRET = 'https://pac.secret.example/doc?token=abc'
function upstream(handler: (url: URL) => Response | Promise<Response>): StorefrontClient {
  const fetch = async (input: RequestInfo | URL) => handler(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url))
  return createStorefrontClient({ baseUrl: 'https://ops.local/api/gw', token: 'sk_x', fetch: fetch as typeof globalThis.fetch }).withCustomerToken('ct_x')
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const file = (over: Record<string, unknown> = {}) => upstream(() => json({ filename: 'f.pdf', content_type: 'application/pdf', content_base64: btoa('%PDF-1.4'), ...over }))
const ask = (storefront: StorefrontClient, kind: string = 'pdf') => invoiceFileResponse({ storefront, orderId: 'o1', invoiceId: 'i1', kind })

/** Every answer of a buyer route, error or not, carries these. */
function expectLocked(res: Response) {
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('content-security-policy') ?? '').toContain("default-src 'none'")
  expect(res.headers.get('referrer-policy')).toBe('no-referrer')
}

describe('invoiceFileResponse against a hostile upstream', () => {
  it('refuses an oversized file instead of buffering it (generic 502)', async () => {
    const big = 'A'.repeat(24 * 1024 * 1024) // 18 MB decoded
    const res = await ask(file({ content_base64: big }))
    expect(res.status).toBe(502)
    expectLocked(res)
  })

  it('malformed JSON, a non-file body, invalid base64 and odd content types: generic 502 with no upstream text', async () => {
    const cases: StorefrontClient[] = [
      upstream(() => json('{"filename": "x', 200)),
      upstream(() => json({ url: SECRET })),
      file({ content_base64: `not base64 ${SECRET}` }),
      upstream(() => json({ error: { code: 'pac_error', message: SECRET } }, 500)),
      upstream(() => json({ error: { code: 'forbidden', message: SECRET } }, 403)),
    ]
    for (const sf of cases) {
      const res = await ask(sf)
      expect(res.status).toBe(502)
      expectLocked(res)
      const body = await res.text()
      expect(body).not.toMatch(/pac\.secret|token=|filename/)
    }
    const html = await ask(file({ content_type: 'text/html; charset=utf-8' }))
    expect(html.headers.get('content-type')).toBe('application/pdf')
  })

  it('a redirect to the PAC is never followed nor passed on', async () => {
    const res = await ask(upstream(() => new Response(null, { status: 302, headers: { Location: SECRET } })))
    expect(res.status).not.toBe(302)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).not.toContain('pac.secret')
  })

  it('filenames with paths, CRLF, quotes, bidi overrides and unicode are reduced to a safe ASCII name', async () => {
    for (const filename of ['../../etc/passwd', 'a"\r\nSet-Cookie: x=1', 'factura\u202Efdp.exe', '\u0000', 'Ｆａｃｔｕｒａ.pdf', '', '....pdf', 'C:\\x\\y.pdf']) {
      const res = await ask(file({ filename }))
      expect(res.status).toBe(200)
      const cd = res.headers.get('content-disposition')!
      expect(cd).toMatch(/^attachment; filename="[A-Za-z0-9._-]+\.pdf"$/)
      expect(cd).not.toMatch(/\.\.|exe"/)
      expectLocked(res)
    }
  })

  it('401 / 404 / 429 pass with their own text; ids of someone else (404) read the same as missing ones', async () => {
    const missing = await ask(upstream(() => json({ error: { code: 'not_found', message: 'order ord_other belongs to buyer 77' } }, 404)))
    const absent = await ask(upstream(() => json({ error: { code: 'not_found', message: 'nope' } }, 404)))
    expect([missing.status, absent.status]).toEqual([404, 404])
    expect(await missing.text()).toBe(await absent.text())
    expectLocked(missing)
    const expired = await ask(upstream(() => json({ error: { code: 'unauthorized', message: SECRET } }, 401)))
    expect(expired.status).toBe(401)
    expectLocked(expired)
    expect(await expired.text()).not.toContain('pac')
    const slow = await ask(upstream(() => json({ error: { code: 'rate_limited', message: 'x', retry_after: 1e12 } }, 429)))
    expect(slow.status).toBe(429)
    expect(Number(slow.headers.get('retry-after'))).toBeLessThanOrEqual(3600)
    expectLocked(slow)
  })

  it('a bad kind is a 404 with the same locked headers', async () => {
    for (const kind of ['html', 'PDF', '', 'pdf\r\n']) {
      const res = await ask(file(), kind)
      expect(res.status).toBe(404)
      expectLocked(res)
    }
  })
})

const HOSTILE = `</script><script>alert(1)</script>"'><img src=x onerror=alert(2)>`
function pendingUpstream(nodes: unknown[]): StorefrontClient {
  return upstream((url) => (url.pathname.endsWith('/pending-payments') ? json({ nodes, page_info: { has_next_page: false, end_cursor: null } }) : json({ error: { code: 'not_found' } }, 404)))
}
const node = (payment: Record<string, unknown>, id = 'chk_1') => ({ id, number: null, status: 'pending_payment', created_at: '2026-10-01T00:00:00Z', total: { amount: '10.00', currency_code: 'MXN' }, expires_at: null, payment })

describe('pendingVoucherResponse against hostile data', () => {
  it('escapes every field (reference, CLABE, instructions, method, shop name, locale) and the barcode label', async () => {
    const sf = pendingUpstream([node({ method: HOSTILE, reference: HOSTILE, barcode: HOSTILE, clabe: HOSTILE, instructions: HOSTILE, amount: { amount: '10', currency_code: HOSTILE } })])
    const res = await pendingVoucherResponse({ storefront: sf, id: 'chk_1', shopName: HOSTILE, locale: `es-MX"><script>alert(3)</script>` })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).not.toMatch(/<img|<script>alert/)
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;')
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it('a gateway method named like an Object internal prints as text, never a 502', async () => {
    for (const method of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const res = await pendingVoucherResponse({ storefront: pendingUpstream([node({ method, reference: '123456' })]), id: 'chk_1' })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain(method)
    }
  })

  it('a fresh nonce per response; the download has no script at all', async () => {
    const sf = pendingUpstream([node({ method: 'oxxo', reference: '12345678901234' })])
    const nonces = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const res = await pendingVoucherResponse({ storefront: sf, id: 'chk_1' })
      nonces.add(/nonce-([^']+)'/.exec(res.headers.get('content-security-policy')!)![1]!)
    }
    expect(nonces.size).toBe(5)
    const dl = await pendingVoucherResponse({ storefront: sf, id: 'chk_1', download: true })
    expect(dl.headers.get('content-security-policy')).toContain("script-src 'none'")
    expect(await dl.text()).not.toContain('<script')
  })

  it('the PDF of hostile data is still a well-formed file with the locked headers', async () => {
    const sf = pendingUpstream([node({ method: HOSTILE, reference: HOSTILE, barcode: { format: 'code128', value: HOSTILE }, clabe: HOSTILE, beneficiary: HOSTILE, bank: HOSTILE, instructions: HOSTILE.repeat(50) })])
    const res = await pendingVoucherResponse({ storefront: sf, id: 'chk_1', format: 'pdf', shopName: HOSTILE })
    expect(res.status).toBe(200)
    expectLocked(res)
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer())
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.endsWith('%%EOF\n')).toBe(true)
  })

  it('a PDF request for an id that is not the buyer\'s reads like a missing one', async () => {
    const sf = pendingUpstream([node({ reference: '1' }, 'chk_mine')])
    const other = await pendingVoucherResponse({ storefront: sf, id: 'chk_someone_else', format: 'pdf' })
    const none = await pendingVoucherResponse({ storefront: pendingUpstream([]), id: 'chk_mine', format: 'pdf' })
    expect([other.status, none.status]).toEqual([404, 404])
    expect(await other.text()).toBe(await none.text())
    expectLocked(other)
  })

  it('an id outside the buyer\'s list reads exactly like a missing one, with the locked headers', async () => {
    const sf = pendingUpstream([node({ reference: '1' }, 'chk_mine')])
    const other = await pendingVoucherResponse({ storefront: sf, id: 'chk_someone_else' })
    const none = await pendingVoucherResponse({ storefront: pendingUpstream([]), id: 'chk_mine' })
    expect([other.status, none.status]).toEqual([404, 404])
    expect(await other.text()).toBe(await none.text())
    expectLocked(other)
  })
})
