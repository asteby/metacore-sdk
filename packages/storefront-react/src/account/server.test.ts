import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorefrontClient } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront, type MockStorefrontOptions } from '@asteby/storefront/mock'
import { SAFE_AUTH_CAPABILITIES, createAuthAction, loadAuthCapabilities, safeNextPath } from './server.js'

const cookie = { serialize: (value: string, o?: { expires?: Date }) => `sf_customer=${value}; Path=/${o?.expires ? '; Expires=set' : ''}` }

function setup(opts: MockStorefrontOptions = {}) {
  const mock = createMockStorefront(opts)
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  const action = createAuthAction({ storefront: sf, customerCookie: cookie })
  const post = (fields: Record<string, string>) =>
    action({ request: new Request('https://shop.test/account', { method: 'POST', body: new URLSearchParams(fields) }) })
  return { mock, sf, post }
}

const redirectOf = (res: unknown) => {
  expect(res).toBeInstanceOf(Response)
  const r = res as Response
  expect(r.status).toBe(303)
  return { location: r.headers.get('Location'), cookie: r.headers.get('Set-Cookie') }
}

describe('loadAuthCapabilities', () => {
  it('reads the store capabilities and caches them briefly per client', async () => {
    const { sf } = setup({ customerCapabilities: { otp_channels: ['email', 'whatsapp'] } })
    const spy = vi.spyOn(sf.customer, 'capabilities')
    let t = 1000
    const now = () => t
    expect(await loadAuthCapabilities(sf, { now })).toEqual({ password: true, email_verification: true, otp_channels: ['email', 'whatsapp'] })
    t += 30_000
    await loadAuthCapabilities(sf, { now })
    expect(spy).toHaveBeenCalledTimes(1)
    t += 31_000
    await loadAuthCapabilities(sf, { now })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('degrades to the safe default when OPS fails, and retries after a few seconds', async () => {
    const { sf } = setup()
    const spy = vi.spyOn(sf.customer, 'capabilities').mockRejectedValueOnce(new Error('down'))
    let t = 0
    const now = () => t
    expect(await loadAuthCapabilities(sf, { now })).toEqual({ password: true, email_verification: false, otp_channels: [] })
    expect(SAFE_AUTH_CAPABILITIES.otp_channels).toEqual([])
    t += 1000
    await loadAuthCapabilities(sf, { now })
    expect(spy).toHaveBeenCalledTimes(1)
    t += 6000
    expect((await loadAuthCapabilities(sf, { now })).email_verification).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('offers nothing on a token without scope (403 insufficient_scope), and says why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mock = createMockStorefront()
    const pk = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: mock.fetch })
    expect(await loadAuthCapabilities(pk)).toEqual({ password: false, email_verification: false, otp_channels: [], unavailable_reason: 'missing_scope', missing_scopes: ['customer:read'] })
    log.mockRestore()
  })
})

describe('safeNextPath', () => {
  it('keeps same-site paths and rejects everything else', () => {
    expect(safeNextPath('/orders?x=1')).toBe('/orders?x=1')
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, undefined, '/a\nb']) {
      expect(safeNextPath(bad as string)).toBe('/account')
    }
    expect(safeNextPath('//x', '/home')).toBe('/home')
  })
})

describe('createAuthAction', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('registers with email verification, then verifies with 000000 and redirects with the session cookie', async () => {
    const res = await ctx.post({ intent: 'register', email: 'nueva@example.com', password: 'secret1234', first_name: 'Nora' })
    expect(res).toEqual({ ok: true, step: 'verify', email: 'nueva@example.com' })
    expect(await ctx.post({ intent: 'verify', email: 'nueva@example.com', code: '111111' })).toEqual({
      ok: false,
      step: 'verify',
      email: 'nueva@example.com',
      error: { code: 'invalid_code', field: 'code' },
    })
    const ok = redirectOf(await ctx.post({ intent: 'verify', email: 'nueva@example.com', code: '000000', next: '/orders' }))
    expect(ok.location).toBe('/orders')
    expect(ok.cookie).toMatch(/^sf_customer=ct_.*Expires=set/)
  })

  it('signs in with the password and ignores an unsafe next', async () => {
    await ctx.post({ intent: 'register', email: 'a@example.com', password: 'secret1234' })
    await ctx.post({ intent: 'verify', email: 'a@example.com', code: '000000' })
    expect(redirectOf(await ctx.post({ intent: 'login', email: 'a@example.com', password: 'secret1234', next: '//evil.com' })).location).toBe('/account')
    expect(await ctx.post({ intent: 'login', email: 'a@example.com', password: 'bad' })).toEqual({
      ok: false,
      email: 'a@example.com',
      error: { code: 'invalid_credentials' },
    })
  })

  it('reports an existing email, throttling and validation', async () => {
    await ctx.post({ intent: 'register', email: 'b@example.com', password: 'secret1234' })
    await ctx.post({ intent: 'verify', email: 'b@example.com', code: '000000' })
    expect(await ctx.post({ intent: 'register', email: 'b@example.com', password: 'secret1234' })).toMatchObject({ error: { code: 'email_taken', field: 'email' } })
    expect(await ctx.post({ intent: 'register', email: 'c@example.com', password: 'short' })).toMatchObject({ error: { code: 'validation', field: 'password' } })
    expect(await ctx.post({ intent: 'login', email: '', password: 'x' })).toMatchObject({ error: { code: 'validation', field: 'email' } })
    for (let i = 0; i < 5; i++) await ctx.post({ intent: 'login', email: 'b@example.com', password: 'bad' })
    expect(await ctx.post({ intent: 'login', email: 'b@example.com', password: 'secret1234' })).toMatchObject({ error: { code: 'rate_limited' } })
    expect(await ctx.post({ intent: 'nope', email: 'b@example.com' })).toMatchObject({ error: { code: 'validation' } })
  })

  it('creates the account straight away when the store does not verify emails', async () => {
    const c = setup({ customerCapabilities: { email_verification: false } })
    const r = redirectOf(await c.post({ intent: 'register', email: 'd@example.com', password: 'secret1234' }))
    expect(r.cookie).toMatch(/^sf_customer=ct_/)
  })

  it('signs in with an emailed code', async () => {
    expect(await ctx.post({ intent: 'otp-request', email: MOCK_CUSTOMER_EMAIL })).toEqual({ ok: true, step: 'otp', email: MOCK_CUSTOMER_EMAIL })
    expect(await ctx.post({ intent: 'otp-login', email: MOCK_CUSTOMER_EMAIL, code: '999999' })).toMatchObject({ step: 'otp', error: { code: 'invalid_code' } })
    expect(redirectOf(await ctx.post({ intent: 'otp-login', email: MOCK_CUSTOMER_EMAIL, code: '000000' })).cookie).toMatch(/^sf_customer=ct_/)
  })

  it('recovers a password: forgot never says who has an account, reset signs in with the new one', async () => {
    expect(await ctx.post({ intent: 'forgot', email: 'nadie@example.com' })).toEqual({ ok: true, step: 'reset', email: 'nadie@example.com' })
    expect(await ctx.post({ intent: 'forgot', email: MOCK_CUSTOMER_EMAIL })).toEqual({ ok: true, step: 'reset', email: MOCK_CUSTOMER_EMAIL })
    expect(await ctx.post({ intent: 'reset', email: MOCK_CUSTOMER_EMAIL, code: '123456', password: 'newsecret12' })).toMatchObject({ step: 'reset', error: { code: 'invalid_code' } })
    const r = redirectOf(await ctx.post({ intent: 'reset', email: MOCK_CUSTOMER_EMAIL, code: '000000', password: 'newsecret12' }))
    expect(r.cookie).toMatch(/^sf_customer=ct_/)
    expect(redirectOf(await ctx.post({ intent: 'login', email: MOCK_CUSTOMER_EMAIL, password: 'newsecret12' })).location).toBe('/account')
  })

  it('refuses ways of signing in the store does not offer', async () => {
    const c = setup({ customerCapabilities: { password: false, otp_channels: [] } })
    expect(await c.post({ intent: 'login', email: 'a@example.com', password: 'secret1234' })).toMatchObject({ error: { code: 'unsupported' } })
    expect(await c.post({ intent: 'otp-request', email: 'a@example.com' })).toMatchObject({ error: { code: 'unsupported' } })
    const noOtp = setup()
    const degraded = createAuthAction({ storefront: noOtp.sf, customerCookie: cookie, capabilities: async () => SAFE_AUTH_CAPABILITIES })
    const res = await degraded({ request: new Request('https://shop.test/a', { method: 'POST', body: new URLSearchParams({ intent: 'otp-request', email: 'a@example.com' }) }) })
    expect(res).toMatchObject({ error: { code: 'unsupported' } })
  })

  it('turns insufficient_scope into store_misconfigured, logs the repair path once and does not offer a password', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 3_600_000) // past the once-a-minute log throttle of earlier tests
    const c = setup({ missingScopes: ['customer:write'] })
    // The store announces password:false with its reason, and loadAuthCapabilities keeps both.
    expect(await loadAuthCapabilities(c.sf)).toMatchObject({ password: false, unavailable_reason: 'missing_scope', missing_scopes: ['customer:write'] })
    for (const intent of ['login', 'register'] as const) {
      expect(await c.post({ intent, email: 'a@example.com', password: 'secret1234' })).toMatchObject({ ok: false, error: { code: 'store_misconfigured' } })
    }
    // Even when capabilities claim password:true, a 403 insufficient_scope on the real call gets the same answer.
    const liar = createAuthAction({ storefront: c.sf, customerCookie: cookie, capabilities: async () => ({ password: true, email_verification: false, otp_channels: [] }) })
    const res = await liar({ request: new Request('https://shop.test/a', { method: 'POST', body: new URLSearchParams({ intent: 'register', email: 'a@example.com', password: 'secret1234' }) }) })
    expect(res).toMatchObject({ error: { code: 'store_misconfigured' } })
    expect(log.mock.calls.length).toBeLessThanOrEqual(1)
    expect(String(log.mock.calls[0]?.[0])).toContain('Reparar permisos')
    log.mockRestore()
    vi.useRealTimers()
  })

  it('maps network failures to unavailable and forwards the shopper IP', async () => {
    const down = createStorefrontClient({ baseUrl: 'https://x.test', token: 'sk_x', fetch: async () => { throw new Error('offline') } })
    const a = createAuthAction({ storefront: down, customerCookie: cookie })
    const res = await a({ request: new Request('https://shop.test/a', { method: 'POST', body: new URLSearchParams({ intent: 'login', email: 'a@b.co', password: 'x' }) }) })
    expect(res).toMatchObject({ error: { code: 'unavailable' } })

    const seen: string[] = []
    const mock = createMockStorefront()
    const sf = createStorefrontClient({
      baseUrl: 'https://mock.local/api/gw',
      token: 'sk_mock',
      clientIp: null,
      fetch: (i, init) => {
        seen.push(new Headers(init?.headers).get('X-Storefront-Client-IP') ?? '')
        return mock.fetch(i, init)
      },
    })
    const withIp = createAuthAction({ storefront: sf, customerCookie: cookie, clientIp: () => '203.0.113.7' })
    await withIp({ request: new Request('https://shop.test/a', { method: 'POST', body: new URLSearchParams({ intent: 'login', email: 'a@b.co', password: 'x' }) }) })
    expect(seen.at(-1)).toBe('203.0.113.7')
  })
})
