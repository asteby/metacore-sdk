import { describe, expect, it, vi } from 'vitest'
import {
  StorefrontError,
  createStorefrontClient,
  formatMoney,
  isStorefrontError,
  isTokenPublishable,
  normalizeClientIp,
  parseMoney,
  parseProductFilters,
  productListQuery,
  storefrontDomainHeader,
} from './index.js'

type Call = { url: string; init: RequestInit & { headers: Headers } }

function recorder(respond: (call: Call) => Response = () => Response.json({})) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init as Call['init'] }
    calls.push(call)
    return respond(call)
  })
  return { calls, fetch }
}

const base = { baseUrl: 'https://ops.example.com/api/gw/', token: 'sk_test' }

describe('query serialization', () => {
  it('serializes product list params with repeated filter.<attr>', () => {
    const qs = productListQuery({
      first: 12,
      after: 'abc',
      q: 'llanta',
      collection: 'llantas',
      sort: 'price_asc',
      available: true,
      price_min: 100,
      filters: { vendor: ['Marca Norte', 'Marca Sur'], rim: 16, 'filter.width': '205', empty: undefined },
      handles: ['a', 'b'],
    })
    expect(qs.getAll('filter.vendor')).toEqual(['Marca Norte', 'Marca Sur'])
    expect(qs.get('filter.rim')).toBe('16')
    expect(qs.get('filter.width')).toBe('205')
    expect(qs.has('filter.empty')).toBe(false)
    expect(qs.get('handles')).toBe('a,b')
    expect(qs.get('available')).toBe('true')
    expect(qs.get('first')).toBe('12')
    expect(qs.has('price_max')).toBe(false)
    expect(parseProductFilters(qs)).toEqual({ vendor: ['Marca Norte', 'Marca Sur'], rim: ['16'], width: ['205'] })
  })

  it('builds the URL, auth and locale headers', async () => {
    const { calls, fetch } = recorder(() => Response.json({ nodes: [], page_info: { has_next_page: false, end_cursor: null }, facets: [] }))
    const sf = createStorefrontClient({ ...base, fetch, locale: 'es-MX', customerToken: 'jwt', headers: { 'X-Extra': '1' } })
    await sf.products.list({ filters: { rim: [15, 16] }, first: 5 })
    const call = calls[0]!
    expect(call.url).toBe('https://ops.example.com/api/gw/storefront/products?first=5&filter.rim=15&filter.rim=16')
    expect(call.init.method).toBe('GET')
    expect(call.init.headers.get('Authorization')).toBe('Bearer sk_test')
    expect(call.init.headers.get('Accept-Language')).toBe('es-MX')
    expect(call.init.headers.get('X-Customer-Token')).toBe('jwt')
    expect(call.init.headers.get('X-Extra')).toBe('1')
  })

  it('serializes stock skus as repeated params and encodes handles', async () => {
    const { calls, fetch } = recorder(() => Response.json({ nodes: [] }))
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.stock.get(['A', 'B'])
    await sf.products.get('a b/c')
    expect(calls[0]!.url).toMatch(/\/storefront\/stock\?sku=A&sku=B$/)
    expect(calls[1]!.url).toMatch(/\/storefront\/products\/a%20b%2Fc$/)
  })

  it('forwards per-call cache/next options and lets hooks short-circuit', async () => {
    const { calls, fetch } = recorder(() => Response.json({ name: 'net' }))
    const seen: number[] = []
    const sf = createStorefrontClient({
      ...base,
      fetch,
      onRequest: (ctx) => (ctx.options.cache === 'force-cache' ? Response.json({ name: 'cached' }) : undefined),
      onResponse: (ctx) => {
        seen.push(ctx.response.status)
      },
    })
    expect((await sf.shop.get({ cache: 'force-cache' })).name).toBe('cached')
    expect(calls).toHaveLength(0)
    expect((await sf.shop.get({ cache: 'no-store', next: { revalidate: 60 } })).name).toBe('net')
    expect(calls[0]!.init.cache).toBe('no-store')
    expect((calls[0]!.init as { next?: unknown }).next).toEqual({ revalidate: 60 })
    expect(seen).toEqual([200, 200])
  })
})

describe('errors', () => {
  it('maps error bodies to StorefrontError', async () => {
    const { fetch } = recorder(() =>
      Response.json({ error: { code: 'insufficient_stock', message: 'Only 1 left', field: 'lines[0].quantity' } }, { status: 409 }),
    )
    const sf = createStorefrontClient({ ...base, fetch })
    const err = await sf.carts.addLines('c1', [{ variant_id: 'v', quantity: 9 }]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StorefrontError)
    expect(isStorefrontError(err)).toBe(true)
    expect(err).toMatchObject({ status: 409, code: 'insufficient_stock', message: 'Only 1 left', field: 'lines[0].quantity' })
  })

  it('falls back to a status-derived code for non-JSON errors', async () => {
    const { fetch } = recorder(() => new Response('boom', { status: 502 }))
    const sf = createStorefrontClient({ ...base, fetch })
    await expect(sf.shop.get()).rejects.toMatchObject({ status: 502, code: 'server_error' })
  })

  it('returns null on 404 for get-by-handle, throws elsewhere', async () => {
    const { fetch } = recorder(() => Response.json({ error: { code: 'not_found', message: 'nope' } }, { status: 404 }))
    const sf = createStorefrontClient({ ...base, fetch })
    expect(await sf.products.get('missing')).toBeNull()
    expect(await sf.collections.get('missing')).toBeNull()
    expect(await sf.carts.get('missing')).toBeNull()
    expect(await sf.content.page('missing')).toBeNull()
    await expect(sf.products.recommendations('missing')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('wraps network failures and timeouts', async () => {
    const failing = createStorefrontClient({ ...base, fetch: async () => { throw new TypeError('fetch failed') } })
    await expect(failing.shop.get()).rejects.toMatchObject({ status: 0, code: 'network' })

    const hanging = createStorefrontClient({
      ...base,
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    })
    await expect(hanging.shop.get()).rejects.toMatchObject({ status: 0, code: 'timeout' })
  })
})

describe('writes', () => {
  it('sends JSON bodies and an auto-generated Idempotency-Key on checkout', async () => {
    const { calls, fetch } = recorder(() => Response.json({ order: { id: 'o', number: '1' }, payment: { provider: 'x', status: 'pending' } }, { status: 201 }))
    const sf = createStorefrontClient({ ...base, fetch })
    await sf.carts.checkout('c1', { payment_method: 'card', return_url: 'https://shop/thanks' })
    await sf.carts.checkout('c1', { payment_method: 'card', return_url: 'https://shop/thanks' }, { idempotencyKey: 'fixed' })
    const [a, b] = calls
    expect(a!.init.method).toBe('POST')
    expect(a!.url).toMatch(/\/storefront\/carts\/c1\/checkout$/)
    expect(JSON.parse(a!.init.body as string)).toEqual({ payment_method: 'card', return_url: 'https://shop/thanks' })
    expect(a!.init.headers.get('Content-Type')).toBe('application/json')
    expect(a!.init.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(b!.init.headers.get('Idempotency-Key')).toBe('fixed')
  })

  it('resolves undefined on 204', async () => {
    const { fetch } = recorder(() => new Response(null, { status: 204 }))
    const sf = createStorefrontClient({ ...base, fetch })
    await expect(sf.customer.requestOtp({ email: 'a@b.c' })).resolves.toBeUndefined()
  })

  it('password auth: capabilities, register, verify, login, setPassword and reset hit the contract routes', async () => {
    const session = { token: 'ct_1', expires_at: '2027-01-01T00:00:00Z', customer: { id: 'c1', email: 'a@b.co' } }
    const { calls, fetch } = recorder((call) => {
      if (call.url.endsWith('/capabilities')) return Response.json({ password: true, email_verification: true, otp_channels: ['email', 'whatsapp'] })
      if (call.url.endsWith('/register')) {
        const body = JSON.parse(call.init.body as string)
        return body.email === 'new@b.co' ? Response.json({ status: 'verification_required' }, { status: 202 }) : Response.json(session, { status: 201 })
      }
      if (call.url.endsWith('/password') || call.url.endsWith('/reset')) return new Response(null, { status: 204 })
      return Response.json(session, { status: 201 })
    })
    const sf = createStorefrontClient({ ...base, fetch })

    await expect(sf.customer.capabilities()).resolves.toEqual({ password: true, email_verification: true, otp_channels: ['email', 'whatsapp'] })
    expect(calls[0]!.init.method).toBe('GET')
    expect(calls[0]!.url).toMatch(/\/storefront\/customer\/capabilities$/)

    await expect(sf.customer.register({ email: 'new@b.co', password: 'secret123', first_name: 'Ana' })).resolves.toEqual({ status: 'verification_required' })
    expect(calls[1]!.init.method).toBe('POST')
    expect(calls[1]!.url).toMatch(/\/storefront\/customer\/register$/)
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ email: 'new@b.co', password: 'secret123', first_name: 'Ana' })

    await expect(sf.customer.register({ email: 'a@b.co', password: 'secret123' }, { idempotencyKey: 'reg-1' })).resolves.toEqual({ status: 'created', session })
    expect(calls[2]!.init.headers.get('Idempotency-Key')).toBe('reg-1')

    await expect(sf.customer.verifyRegistration({ email: 'new@b.co', code: '000000' })).resolves.toEqual(session)
    expect(calls[3]!.url).toMatch(/\/storefront\/customer\/register\/verify$/)
    expect(JSON.parse(calls[3]!.init.body as string)).toEqual({ email: 'new@b.co', code: '000000' })

    await expect(sf.customer.loginWithPassword({ email: 'a@b.co', password: 'secret123' })).resolves.toEqual(session)
    expect(calls[4]!.init.method).toBe('POST')
    expect(calls[4]!.url).toMatch(/\/storefront\/customer\/login$/)

    await expect(sf.customer.setPassword({ password: 'newsecret1', current_password: 'secret123' }, { customerToken: 'ct_1' })).resolves.toBeUndefined()
    expect(calls[5]!.init.method).toBe('PUT')
    expect(calls[5]!.url).toMatch(/\/storefront\/customer\/password$/)
    expect(calls[5]!.init.headers.get('X-Customer-Token')).toBe('ct_1')
    expect(JSON.parse(calls[5]!.init.body as string)).toEqual({ password: 'newsecret1', current_password: 'secret123' })

    await expect(sf.customer.resetPassword({ email: 'a@b.co', code: '123456', password: 'newsecret1' })).resolves.toBeUndefined()
    expect(calls[6]!.url).toMatch(/\/storefront\/customer\/password\/reset$/)
    expect(calls[6]!.init.headers.has('X-Customer-Token')).toBe(false)
  })

  it('password auth errors surface as StorefrontError', async () => {
    const errs: Record<number, string> = { 401: 'unauthorized', 409: 'conflict', 429: 'rate_limited' }
    for (const [status, code] of Object.entries(errs)) {
      const { fetch } = recorder(() => Response.json({ error: { code, message: 'x' } }, { status: Number(status) }))
      const sf = createStorefrontClient({ ...base, fetch })
      const call = Number(status) === 409 ? sf.customer.register({ email: 'a@b.co', password: 'secret123' }) : sf.customer.loginWithPassword({ email: 'a@b.co', password: 'bad' })
      await expect(call).rejects.toMatchObject({ name: 'StorefrontError', status: Number(status), code })
    }
  })

  it('withCustomerToken returns a client bound to the buyer session', async () => {
    const { calls, fetch } = recorder(() => Response.json({}))
    const sf = createStorefrontClient({ ...base, fetch }).withCustomerToken('jwt-2')
    await sf.customer.get()
    expect(calls[0]!.init.headers.get('X-Customer-Token')).toBe('jwt-2')
  })
})

describe('helpers', () => {
  it('formats and parses money', () => {
    expect(parseMoney({ amount: '1899.50', currency_code: 'MXN' })).toBe(1899.5)
    expect(parseMoney(null)).toBe(0)
    expect(formatMoney({ amount: '1899.00', currency_code: 'MXN' }, 'es-MX')).toBe('$1,899.00')
    expect(formatMoney({ amount: '1899.00', currency_code: 'USD' }, 'en-US', { withoutTrailingZeros: true })).toBe('$1,899')
    expect(formatMoney({ amount: '10.5', currency_code: 'MXN' }, 'es-MX', { withoutCurrency: true })).toBe('10.50')
  })

  it('detects publishable tokens', () => {
    expect(isTokenPublishable('pk_live_1')).toBe(true)
    expect(isTokenPublishable('sk_live_1')).toBe(false)
    expect(isTokenPublishable(undefined)).toBe(false)
  })

  it('reads payment methods of a cart', async () => {
    const { calls, fetch } = recorder(() => Response.json({ methods: [{ key: 'manual', kind: 'builtin', default: true }], market: 'mx' }))
    const sf = createStorefrontClient({ ...base, fetch })
    const res = await sf.carts.paymentMethods('c 1')
    expect(res.methods[0]!.key).toBe('manual')
    expect(res.market).toBe('mx')
    expect(calls[0]!.url).toMatch(/\/storefront\/carts\/c%201\/payment-methods$/)
  })
})

describe('locations', () => {
  const sf = (respond?: (c: Call) => Response) => {
    const r = recorder(respond)
    return { ...r, client: createStorefrontClient({ ...base, fetch: r.fetch }) }
  }

  it('lists with an optional postal_code and gets by id (null on 404)', async () => {
    const { client, calls } = sf((c) => (c.url.includes('/nope') ? new Response('', { status: 404 }) : Response.json({ nodes: [] })))
    await client.locations.list()
    await client.locations.list({ postal_code: '06000' })
    expect(calls[0]!.url).toBe('https://ops.example.com/api/gw/storefront/locations')
    expect(calls[1]!.url).toBe('https://ops.example.com/api/gw/storefront/locations?postal_code=06000')
    expect(await client.locations.get('nope')).toBeNull()
    await client.locations.get('br 1/x')
    expect(calls[3]!.url).toMatch(/\/storefront\/locations\/br%201%2Fx$/)
  })

  it('nearest sends lat/lng, bypasses caches and never logs the point', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { client, calls } = sf(() => Response.json({ nodes: [] }))
    await client.locations.nearest({ lat: 19.4326, lng: -99.1332 })
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe('/api/gw/storefront/locations/nearest')
    expect(url.searchParams.get('lat')).toBe('19.4326')
    expect(url.searchParams.get('lng')).toBe('-99.1332')
    expect(calls[0]!.init.cache).toBe('no-store')
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('nearest rejects invalid points before any request', () => {
    const { client, calls } = sf()
    expect(() => client.locations.nearest({ lat: 91, lng: 0 })).toThrow(TypeError)
    expect(() => client.locations.nearest({ lat: Number.NaN, lng: 1 })).toThrow(TypeError)
    expect(calls).toHaveLength(0)
  })
})

describe('shopper IP (X-Storefront-Client-IP)', () => {
  it('sends the configured IP with a server token', async () => {
    const { calls, fetch } = recorder()
    await createStorefrontClient({ ...base, fetch, clientIp: '203.0.113.7' }).shop.get()
    expect(calls[0]!.init.headers.get('X-Storefront-Client-IP')).toBe('203.0.113.7')
  })

  it('withClientIp binds a new client and a per-call value overrides it', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch }).withClientIp('198.51.100.1')
    await sf.shop.get()
    await sf.shop.get({ clientIp: '2001:db8::1' })
    await sf.shop.get({ clientIp: null })
    expect(calls[0]!.init.headers.get('X-Storefront-Client-IP')).toBe('198.51.100.1')
    expect(calls[1]!.init.headers.get('X-Storefront-Client-IP')).toBe('2001:db8::1')
    expect(calls[2]!.init.headers.has('X-Storefront-Client-IP')).toBe(false)
  })

  it('never sends it with a publishable token', async () => {
    const { calls, fetch } = recorder()
    await createStorefrontClient({ baseUrl: base.baseUrl, token: 'pk_test', fetch, clientIp: '203.0.113.7' }).shop.get()
    expect(calls[0]!.init.headers.has('X-Storefront-Client-IP')).toBe(false)
  })

  it('does not forward the option to fetch and drops invalid values', async () => {
    const { calls, fetch } = recorder()
    const sf = createStorefrontClient({ ...base, fetch })
    for (const bad of ['1.2.3.4, 5.6.7.8', '1.2.3.4:80', 'fe80::1%eth0', 'unknown', '999.1.1.1', '']) {
      await sf.shop.get({ clientIp: bad })
    }
    await sf.shop.get({ clientIp: '203.0.113.7' })
    for (const c of calls.slice(0, -1)) expect(c.init.headers.has('X-Storefront-Client-IP')).toBe(false)
    expect('clientIp' in (calls.at(-1)!.init as object)).toBe(false)
  })

  it('normalizes bracketed IPv6 and IPv4-mapped addresses', () => {
    expect(normalizeClientIp('[2001:db8::1]')).toBe('2001:db8::1')
    expect(normalizeClientIp('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7')
    expect(normalizeClientIp(' 203.0.113.7 ')).toBe('203.0.113.7')
  })
})

describe('domain and market', () => {
  it('sends X-Storefront-Domain with the host, and host#market when a market is given', async () => {
    const { calls, fetch } = recorder()
    await createStorefrontClient({ ...base, fetch, domain: 'godsnutrition.com' }).shop.get()
    await createStorefrontClient({ ...base, fetch, domain: 'godsnutrition.com', market: 'US' }).shop.get()
    expect(calls[0]!.init.headers.get('X-Storefront-Domain')).toBe('godsnutrition.com')
    expect(calls[1]!.init.headers.get('X-Storefront-Domain')).toBe('godsnutrition.com#us')
  })

  it('sends nothing without a domain (a market alone cannot be scoped)', async () => {
    const { calls, fetch } = recorder()
    await createStorefrontClient({ ...base, fetch, market: 'us' }).shop.get()
    expect(calls[0]!.init.headers.has('X-Storefront-Domain')).toBe(false)
  })

  it('drops an invalid market code instead of sending it', () => {
    expect(storefrontDomainHeader('godsnutrition.com', 'us mx')).toBe('godsnutrition.com')
    expect(storefrontDomainHeader('godsnutrition.com', '')).toBe('godsnutrition.com')
    expect(storefrontDomainHeader(' godsnutrition.com ', ' MX ')).toBe('godsnutrition.com#mx')
  })
})
