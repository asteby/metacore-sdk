import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from './index.js'

type Call = { method: string; url: string; body: string | null; customerToken: string | null }

function client(answer: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input instanceof Request ? input.url : String(input), init)
    const call: Call = { method: req.method, url: new URL(req.url).pathname, body: (await req.text()) || null, customerToken: req.headers.get('x-customer-token') }
    calls.push(call)
    const { status = 200, body } = answer(call)
    return new Response(status === 204 || body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }
  return { calls, sf: createStorefrontClient({ baseUrl: 'https://shop.test/api/gw', token: 'sk_test', fetch, customerToken: 'sct_x' }) }
}

describe('customer account settings client', () => {
  it('sessions: list unwraps the nodes; revoke and revokeOthers hit the contract routes', async () => {
    const { sf, calls } = client((c) => (c.method === 'GET' ? { body: { nodes: [{ id: 's1', current: true, device_label: 'Chrome · Windows', login_method: 'password', created_at: 'x' }] } } : { status: 204 }))
    expect(await sf.customer.sessions.list()).toHaveLength(1)
    await sf.customer.sessions.revoke('a/b')
    await sf.customer.sessions.revokeOthers()
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/gw/storefront/customer/sessions',
      'DELETE /api/gw/storefront/customer/sessions/a%2Fb',
      'DELETE /api/gw/storefront/customer/sessions/others',
    ])
    expect(calls.every((c) => c.customerToken === 'sct_x')).toBe(true)
  })

  it('reauth sends exactly the credential given and nothing else', async () => {
    const { sf, calls } = client(() => ({ body: { reauth_at: '2026-10-26T12:00:00Z', valid_for_seconds: 300 } }))
    expect((await sf.customer.reauth({ password: 'p' })).valid_for_seconds).toBe(300)
    await sf.customer.reauth({ otp_code: '123456' })
    expect(calls.map((c) => c.body)).toEqual(['{"password":"p"}', '{"otp_code":"123456"}'])
  })

  it('exportData validates the answer is a file; deleteAccount sends the confirmation in the body', async () => {
    const good = { filename: 'account-data-2026-10-26.json', content_type: 'application/json', content_base64: 'e30=' }
    const ok = client((c) => (c.method === 'POST' ? { body: { ...good, extra: 'ignored' } } : { status: 204 }))
    expect(await ok.sf.customer.exportData()).toEqual(good)
    await ok.sf.customer.deleteAccount({ confirm: 'BORRAR' })
    expect(ok.calls[1]).toMatchObject({ method: 'DELETE', url: '/api/gw/storefront/customer', body: '{"confirm":"BORRAR"}' })

    const bad = client(() => ({ body: { not: 'a file' } }))
    await expect(bad.sf.customer.exportData()).rejects.toMatchObject({ status: 502, code: 'invalid_response' })
  })
})
