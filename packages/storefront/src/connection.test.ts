import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorefrontClient, diagnose, isStorefrontError, maskToken } from './index.js'
import { createMockStorefront } from './mock/index.js'
import { connectStore, createFileTokenSource, loadConnectionState, redeemConnectionCode, storefrontTokenFromEnv, writeFileAtomic } from './node.js'
import { runCli, upsertEnv } from './cli.js'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/connect/${name}.json`, import.meta.url), 'utf8')
const SECRET = 'sk_live_0123456789abcdefa91f'
const BASE = 'https://mock.local/api/gw'

describe('insufficient_scope', () => {
  it('exposes requiredScopes and status from the 403 body', async () => {
    const mock = createMockStorefront({ missingScopes: ['customer:write'] })
    const sf = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: mock.fetch })
    const err = await sf.customer.register({ email: 'a@example.com', password: 'secret1234' }).catch((e) => e)
    expect(isStorefrontError(err)).toBe(true)
    expect(err.status).toBe(403)
    expect(err.code).toBe('insufficient_scope')
    expect(err.requiredScopes).toEqual(['customer:write'])
  })

  it('reads code and required_scopes from the top level of the body too', async () => {
    const fetch = async () => new Response(JSON.stringify({ code: 'insufficient_scope', required_scopes: ['customer:write'] }), { status: 403 })
    const sf = createStorefrontClient({ baseUrl: BASE, token: 'sk_x', fetch })
    const err = await sf.customer.get().catch((e) => e)
    expect(err.code).toBe('insufficient_scope')
    expect(err.requiredScopes).toEqual(['customer:write'])
  })

  it('keeps requiredScopes empty for other errors', async () => {
    const fetch = async () => new Response(JSON.stringify({ error: { code: 'forbidden', message: 'x' } }), { status: 403 })
    const sf = createStorefrontClient({ baseUrl: BASE, token: 'sk_x', fetch })
    const err = await sf.customer.get().catch((e) => e)
    expect(err.code).toBe('forbidden')
    expect(err.requiredScopes).toEqual([])
  })

  it('mock capabilities report unavailable_reason without customer:write', async () => {
    const mock = createMockStorefront({ missingScopes: ['customer:write'] })
    const sf = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: mock.fetch })
    expect(await sf.customer.capabilities()).toMatchObject({ password: false, unavailable_reason: 'missing_scope', missing_scopes: ['customer:write'] })
  })
})

describe('token.introspect and diagnose', () => {
  it('calls GET {base}/_token', async () => {
    const mock = createMockStorefront({ missingScopes: ['customer:write'] })
    const urls: string[] = []
    const sf = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: mock.fetch, onRequest: (c) => void urls.push(c.url) })
    const info = await sf.token.introspect()
    expect(urls).toEqual(['https://mock.local/api/gw/_token'])
    expect(info.missing_scopes).toEqual(['customer:write'])
    expect(info.scopes).not.toContain('customer:write')
  })

  it('logs ONE warning with the repair path and never the full token', async () => {
    const mock = createMockStorefront({ missingScopes: ['customer:write'] })
    const sf = createStorefrontClient({ baseUrl: BASE, token: SECRET, fetch: mock.fetch })
    const log = vi.fn()
    const info = await diagnose(sf, { log, connectionName: 'Tienda' })
    expect(info?.missing_scopes).toEqual(['customer:write'])
    expect(log).toHaveBeenCalledTimes(1)
    const line = String(log.mock.calls[0]![0])
    expect(line).toContain('customer:write')
    expect(line).toContain('OPS → Conexiones y API → Tienda → Reparar permisos')
    expect(line).toContain('sk_…a91f')
    expect(line).not.toContain(SECRET)
  })

  it('is silent when healthy and never throws when OPS fails', async () => {
    const ok = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: createMockStorefront().fetch })
    const log = vi.fn()
    expect((await diagnose(ok, { log }))?.missing_scopes).toEqual([])
    expect(log).not.toHaveBeenCalled()
    const down = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: async () => Promise.reject(new Error('boom')) })
    await expect(diagnose(down, { log })).resolves.toBeNull()
    const old = createStorefrontClient({ baseUrl: BASE, token: 'sk_mock', fetch: async () => new Response('', { status: 404 }) })
    await expect(diagnose(old, { log })).resolves.toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('maskToken keeps only prefix and last four', () => {
    expect(maskToken(SECRET)).toBe('sk_…a91f')
    expect(maskToken('sk_short')).toBe('sk_…')
  })
})

describe('token from file', () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'sf-token-'))))

  it('caches for 30 s and re-reads when the mtime changes', () => {
    const f = join(dir, 'storefront_token')
    writeFileSync(f, 'sk_one\n')
    let t = 1_000
    const src = createFileTokenSource(f, { now: () => t })
    expect(src()).toBe('sk_one')
    writeFileSync(f, 'sk_two_longer\n')
    utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000))
    t += 10_000
    expect(src()).toBe('sk_one') // inside the 30 s window
    t += 25_000
    expect(src()).toBe('sk_two_longer')
  })

  it('keeps the last good token when a re-read fails', () => {
    const f = join(dir, 'storefront_token')
    writeFileSync(f, 'sk_one')
    let t = 0
    const src = createFileTokenSource(f, { now: () => t })
    expect(src()).toBe('sk_one')
    writeFileSync(f, '')
    utimesSync(f, new Date(Date.now() + 9000), new Date(Date.now() + 9000))
    t += 60_000
    expect(src()).toBe('sk_one')
  })

  it('throws only when there was never a token', () => {
    expect(() => createFileTokenSource(join(dir, 'nope'))()).toThrow(/Cannot read/)
  })

  it('resolves env sources in order and keeps the plain variable working', () => {
    const f = join(dir, 'storefront_token')
    writeFileSync(f, 'sk_file')
    const cred = mkdtempSync(join(tmpdir(), 'sf-cred-'))
    writeFileSync(join(cred, 'storefront_token'), 'sk_cred')
    const read = (e: Record<string, string>) => {
      const s = storefrontTokenFromEnv(e)
      return typeof s === 'function' ? s() : s
    }
    expect(read({ STOREFRONT_TOKEN_FILE: f, STOREFRONT_TOKEN: 'sk_env' })).toBe('sk_file')
    expect(read({ CREDENTIALS_DIRECTORY: cred, STOREFRONT_TOKEN: 'sk_env' })).toBe('sk_cred')
    expect(read({ STOREFRONT_TOKEN: 'sk_env' })).toBe('sk_env')
    expect(read({})).toBeUndefined()
  })

  it('a client with a function token sends the rotated token', async () => {
    const f = join(dir, 'storefront_token')
    writeFileSync(f, 'sk_one')
    let t = 0
    const seen: string[] = []
    const sf = createStorefrontClient({
      baseUrl: BASE,
      token: createFileTokenSource(f, { now: () => t }),
      fetch: async (_u, init) => (seen.push(new Headers(init?.headers).get('authorization') ?? ''), new Response('{}')),
    })
    await sf.shop.get()
    writeFileSync(f, 'sk_two_rotated')
    utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000))
    t += 31_000
    await sf.shop.get()
    expect(seen).toEqual(['Bearer sk_one', 'Bearer sk_two_rotated'])
  })
})

describe('writeFileAtomic', () => {
  it('writes mode 0600, replaces whole and leaves no temp file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-atomic-'))
    const f = join(dir, 'storefront_token')
    writeFileAtomic(f, 'one')
    writeFileAtomic(f, 'two')
    expect(readFileSync(f, 'utf8')).toBe('two')
    expect(statSync(f).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['storefront_token'])
  })
})

// ---------------------------------------------------------------------------
// Fake OPS: answers with EXACTLY the shapes in src/fixtures/connect/*.json (the handlers of OPS's connect_public.go)
// ---------------------------------------------------------------------------

type Reply = { status: number; body: string; headers?: Record<string, string> }
type Hit = { path: string; auth?: string; body: any }
type Fake = { server: Server; url: string; hits: Hit[]; on: (path: string, fn: (b: any) => Reply) => void }

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const t = Buffer.concat(chunks).toString()
  return t ? JSON.parse(t) : {}
}

async function startFake(): Promise<Fake> {
  const hits: Hit[] = []
  const handlers = new Map<string, (b: any) => Reply>()
  const server = createServer(async (req, res) => {
    const b = await readBody(req)
    hits.push({ path: req.url ?? '', ...(req.headers.authorization ? { auth: req.headers.authorization } : {}), body: b })
    const h = handlers.get(req.url ?? '')
    const r: Reply = h ? h(b) : { status: 404, body: '{}' }
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...r.headers })
    res.end(r.body)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const f: Fake = { server, url, hits, on: (p, fn) => void handlers.set(p, fn) }
  const sub = (name: string) => fixture(name).replace('__API_BASE__', `${url}/api/gw`)
  f.on('/api/connect/v1/redeem', () => ({ status: 200, body: sub('redeem.ok') }))
  f.on('/api/connect/v1/rotate', () => ({ status: 200, body: sub('rotate.ok') }))
  f.on('/api/connect/v1/heartbeat', () => ({ status: 200, body: sub('heartbeat.ok') }))
  f.on('/api/gw/_token', () => ({ status: 200, body: sub('token.ok') }))
  return f
}

describe('contract fixtures', () => {
  it('redeem.ok has the documented shape (token, connection, scopes, rotation_days, api_base; no planos)', () => {
    const d = JSON.parse(fixture('redeem.ok'))
    expect(d.success).toBe(true)
    expect(Object.keys(d.data).sort()).toEqual(['api_base', 'connection', 'publishable_token', 'rotation_days', 'scopes', 'token'])
    expect(Object.keys(d.data.connection).sort()).toEqual(['environment', 'id', 'kind', 'name', 'profile'])
  })

  it('rotate.ok carries grace_until and no rotation_days / api_base', () => {
    const d = JSON.parse(fixture('rotate.ok')).data
    expect(d.grace_until).toBeTruthy()
    expect(d.rotation_days).toBeUndefined()
    expect(d.api_base).toBeUndefined()
  })

  it('errors are {success:false,error:code,message}', () => {
    for (const n of ['error.invalid_code', 'error.rate_limited', 'error.invalid_token']) {
      const d = JSON.parse(fixture(n))
      expect(d).toMatchObject({ success: false, error: expect.any(String), message: expect.any(String) })
    }
  })

  it('token.introspect unwraps the envelope and also accepts the flat form', async () => {
    const env = createStorefrontClient({ baseUrl: BASE, token: 'sk_x', fetch: async () => new Response(fixture('token.ok')) })
    expect(await env.token.introspect()).toMatchObject({ kind: 'secret', missing_scopes: ['customer:write'], connection_id: '7b0d6a52-3a51-4c1f-9d58-0c1c2a8f4e11', expires_at: null })
    const flat = createStorefrontClient({ baseUrl: BASE, token: 'sk_x', fetch: async () => new Response(JSON.stringify(JSON.parse(fixture('token.ok')).data)) })
    expect((await flat.token.introspect()).missing_scopes).toEqual(['customer:write'])
  })
})

describe('connect CLI against a fake OPS', () => {
  let fake: Fake
  let dir: string
  beforeEach(async () => {
    fake = await startFake()
    dir = mkdtempSync(join(tmpdir(), 'sf-cli-'))
  })
  afterEach(() => void fake.server.close())

  const run = async (args: string[], code = 'K7QM-2XPA') => {
    const out: string[] = []
    const err: string[] = []
    const status = await runCli(args, { stdout: (l) => out.push(l), stderr: (l) => err.push(l), promptCode: async () => code, cwd: dir, env: {} })
    return { status, out: out.join('\n'), err: err.join('\n') }
  }

  it('redeems, writes the key 0600 and only OPS_URL + STOREFRONT_TOKEN_FILE to the env file', async () => {
    writeFileSync(join(dir, '.env'), 'FOO=bar\nOPS_URL=old\n')
    const r = await run(['connect', '--ops', fake.url, '--env-file', '.env'])
    expect(r.status).toBe(0)
    expect(r.out).toContain('Conectada ✓ · 3 alcances · sk_…a91f')
    expect(r.out + r.err).not.toContain(SECRET)
    const tf = join(dir, 'storefront_token')
    expect(readFileSync(tf, 'utf8').trim()).toBe(SECRET)
    expect(statSync(tf).mode & 0o777).toBe(0o600)
    const env = readFileSync(join(dir, '.env'), 'utf8')
    expect(env).toContain('FOO=bar')
    expect(env).toContain(`OPS_URL=${fake.url}`)
    expect(env).toContain(`STOREFRONT_TOKEN_FILE=${tf}`)
    expect(env).not.toContain(SECRET)
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
    const redeem = fake.hits.find((h) => h.path.endsWith('/redeem'))!
    expect(redeem.body).toEqual({ code: 'K7QM-2XPA', client: { name: '@asteby/storefront', version: expect.any(String), runtime: `node ${process.version}`, hostname: expect.any(String) } })
    expect(redeem.body.client_info).toBeUndefined()
    // verifies through api_base with the new key
    expect(fake.hits.some((h) => h.path === '/api/gw/_token' && h.auth === `Bearer ${SECRET}`)).toBe(true)
    // non-secret state: connection + rotation_days + computed rotate_after, no key
    const stateText = readFileSync(tf + '.json', 'utf8')
    expect(stateText).not.toContain(SECRET)
    const st = loadConnectionState(tf)!
    expect(st).toMatchObject({ api_base: `${fake.url}/api/gw`, rotation_days: 90, connection: { name: 'Tienda en línea', environment: 'sandbox' } })
    const days = (Date.parse(st.rotate_after) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(89.9)
    expect(days).toBeLessThan(90.1)
  })

  it('an invalid, expired or used code is one answer, and nothing is written', async () => {
    fake.on('/api/connect/v1/redeem', () => ({ status: 400, body: fixture('error.invalid_code') }))
    const r = await run(['connect', '--ops', fake.url])
    expect(r.status).toBe(1)
    expect(r.err).toContain('El código no es válido o ya venció')
    expect(existsSync(join(dir, 'storefront_token'))).toBe(false)
  })

  it('shows the 429 message', async () => {
    fake.on('/api/connect/v1/redeem', () => ({ status: 429, body: fixture('error.rate_limited'), headers: { 'Retry-After': '30' } }))
    const r = await run(['connect', '--ops', fake.url])
    expect(r.status).toBe(1)
    expect(r.err).toContain('Demasiados intentos')
  })

  it('reports an unreachable OPS', async () => {
    const r = await run(['connect', '--ops', 'http://127.0.0.1:1'])
    expect(r.status).toBe(1)
    expect(r.err).toContain('No pudimos comunicarnos con OPS')
    expect(existsSync(join(dir, 'storefront_token'))).toBe(false)
  })

  it('never takes the code as an argument', async () => {
    const r = await run(['connect', '--ops', fake.url, '--code', 'K7QM-2XPA'])
    expect(r.status).toBe(1)
    expect(r.err).toContain('no como argumento')
    expect(fake.hits).toEqual([])
  })

  it('accepts the flat form too (robustness)', async () => {
    fake.on('/api/connect/v1/redeem', () => ({ status: 200, body: JSON.stringify(JSON.parse(fixture('redeem.ok').replace('__API_BASE__', `${fake.url}/api/gw`)).data) }))
    expect((await run(['connect', '--ops', fake.url])).status).toBe(0)
  })

  it('upsertEnv keeps other lines', () => {
    expect(upsertEnv('A=1\n', { OPS_URL: 'x' })).toBe('A=1\nOPS_URL=x\n')
  })

  it('redeemConnectionCode rejects a malformed answer', async () => {
    fake.on('/api/connect/v1/redeem', () => ({ status: 200, body: JSON.stringify({ success: true, data: { nope: true } }) }))
    await expect(redeemConnectionCode({ opsUrl: fake.url, code: 'X' })).rejects.toMatchObject({ kind: 'invalid_response' })
  })
})

describe('connectStore', () => {
  let fake: Fake
  let tf: string
  beforeEach(async () => {
    fake = await startFake()
    tf = join(mkdtempSync(join(tmpdir(), 'sf-rot-')), 'storefront_token')
    await runCli(['connect', '--ops', fake.url, '--token-file', tf], { stdout: () => {}, stderr: () => {}, promptCode: async () => 'K7QM-2XPA', env: {} })
    fake.hits.length = 0
  })
  afterEach(() => void fake.server.close())

  it('heartbeats with the client block and does not rotate before it is due', async () => {
    const store = connectStore({ tokenFile: tf })
    expect(await store.tick()).toBe('ok')
    const hb = fake.hits.find((h) => h.path.endsWith('/heartbeat'))!
    expect(hb.auth).toBe(`Bearer ${SECRET}`)
    expect(hb.body.client).toMatchObject({ name: '@asteby/storefront', runtime: `node ${process.version}` })
    expect(fake.hits.some((h) => h.path.endsWith('/rotate'))).toBe(false)
    // the heartbeat's next_rotation_at replaces the computed one
    expect(loadConnectionState(tf)!.rotate_after).toBe('2099-01-01T00:00:00Z')
  })

  it('rotates when the heartbeat says rotate_now, keeping rotation_days and api_base', async () => {
    fake.on('/api/connect/v1/heartbeat', () => ({ status: 200, body: fixture('heartbeat.rotate-now') }))
    const errors: string[] = []
    const store = connectStore({ tokenFile: tf, onError: (m) => errors.push(m) })
    expect(await store.tick()).toBe('rotated')
    expect(readFileSync(tf, 'utf8').trim()).toBe('sk_live_rotated_00000000009999')
    expect(statSync(tf).mode & 0o777).toBe(0o600)
    expect(fake.hits.find((h) => h.path.endsWith('/rotate'))).toMatchObject({ auth: `Bearer ${SECRET}`, body: {} })
    const st = loadConnectionState(tf)!
    expect(st).toMatchObject({ rotation_days: 90, api_base: `${fake.url}/api/gw`, grace_until: '2099-01-02T00:00:00Z' })
    expect(errors).toEqual([])
  })

  it('rotates when now passes next_rotation_at', async () => {
    const store = connectStore({ tokenFile: tf, now: () => Date.parse('2100-01-01T00:00:00Z') })
    expect(await store.tick()).toBe('rotated')
  })

  it('a 401 invalid_token is reported with the masked key only', async () => {
    fake.on('/api/connect/v1/heartbeat', () => ({ status: 401, body: fixture('error.invalid_token') }))
    const errors: string[] = []
    const store = connectStore({ tokenFile: tf, onError: (m) => errors.push(m) })
    expect(await store.tick()).toBe('failed')
    expect(errors.join()).toContain('Clave inválida.')
    expect(errors.join()).toContain('sk_…a91f')
    expect(errors.join()).not.toContain(SECRET)
  })

  it('respects Retry-After from a 429 when scheduling the next heartbeat', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      fake.on('/api/connect/v1/heartbeat', () => (++calls === 1 ? { status: 429, body: fixture('error.rate_limited'), headers: { 'Retry-After': '120' } } : { status: 200, body: fixture('heartbeat.ok') }))
      const stop = connectStore({ tokenFile: tf }).keepFresh({ intervalMs: 1000 })
      await vi.waitFor(() => expect(calls).toBe(1), { interval: 10 })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(calls).toBe(1) // 120 s wait, not 1 s
      await vi.advanceTimersByTimeAsync(61_000)
      await vi.waitFor(() => expect(calls).toBe(2), { interval: 10 })
      stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an unreachable OPS without throwing and without the key', async () => {
    const errors: string[] = []
    const store = connectStore({ tokenFile: tf, opsUrl: 'http://127.0.0.1:1', onError: (m) => errors.push(m) })
    expect(await store.tick()).toBe('failed')
    expect(errors.join()).not.toContain(SECRET)
  })
})
