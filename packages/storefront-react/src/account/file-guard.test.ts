import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoiceFileResponse } from './server.js'
import { resetFileGuard } from './file-guard.js'

const file = { filename: 'f.pdf', content_type: 'application/pdf', content_base64: btoa('%PDF-1.4 hello') }
const client = (impl: (...a: unknown[]) => Promise<unknown>) => ({ customer: { invoiceFile: impl } }) as never
beforeEach(() => resetFileGuard())

describe('invoiceFileResponse guard', () => {
  it('shares one upstream call between identical concurrent requests and remembers it', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const upstream = vi.fn(async () => (await gate, file))
    const sf = client(upstream)
    const opts = { storefront: sf, orderId: 'o1', invoiceId: 'i1', kind: 'pdf', guard: { buyer: 'tok-A' } }
    const all = Promise.all([1, 2, 3, 4, 5].map(() => invoiceFileResponse(opts)))
    release()
    const res = await all
    expect(res.every((r) => r.status === 200)).toBe(true)
    expect(upstream).toHaveBeenCalledTimes(1)
    await invoiceFileResponse(opts) // inside the 60 s: from memory
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(res[0]!.headers.get('Cache-Control')).toContain('no-store') // the browser never caches it
  })

  it('never serves one buyer from another buyer\'s memory', async () => {
    const upstream = vi.fn(async () => file)
    const sf = client(upstream)
    await invoiceFileResponse({ storefront: sf, orderId: 'o1', invoiceId: 'i1', kind: 'pdf', guard: { buyer: 'tok-A' } })
    await invoiceFileResponse({ storefront: sf, orderId: 'o1', invoiceId: 'i1', kind: 'pdf', guard: { buyer: 'tok-B' } })
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('answers 429 with Retry-After after 6 requests a minute and does not reach OPS', async () => {
    const upstream = vi.fn(async () => file)
    let t = 1_000_000
    const opts = { storefront: client(upstream), orderId: 'o1', invoiceId: 'i1', kind: 'xml', guard: { buyer: 'tok-A', now: () => t, cacheMs: 0 } }
    for (let i = 0; i < 6; i++) expect((await invoiceFileResponse(opts)).status).toBe(200)
    const calls = upstream.mock.calls.length
    const res = await invoiceFileResponse(opts)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    const body = await res.json()
    expect(body.error.message).toContain('Estamos preparando tu factura')
    expect(JSON.stringify(body)).not.toMatch(/o1|i1|base64/)
    expect(upstream.mock.calls.length).toBe(calls)
    t += 61_000
    expect((await invoiceFileResponse(opts)).status).toBe(200)
  })

  it('does not cache failures and is off without a buyer', async () => {
    const upstream = vi.fn(async () => file)
    const opts = { storefront: client(upstream), orderId: 'o1', invoiceId: 'i1', kind: 'pdf' }
    await invoiceFileResponse(opts)
    await invoiceFileResponse(opts)
    expect(upstream).toHaveBeenCalledTimes(2)
    const bad = vi.fn(async () => {
      throw new Error('x')
    })
    const g = { buyer: 'tok-C' }
    expect((await invoiceFileResponse({ storefront: client(bad), orderId: 'o', invoiceId: 'i', kind: 'pdf', guard: g })).status).toBe(502)
    expect((await invoiceFileResponse({ storefront: client(upstream), orderId: 'o', invoiceId: 'i', kind: 'pdf', guard: g })).status).toBe(200)
  })
})
