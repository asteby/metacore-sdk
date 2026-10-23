import { createServer, type IncomingMessage, type Server } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStorefrontClient, diagnose, isStorefrontError, maskToken } from './index.js'
import { createMockStorefront } from './mock/index.js'
import { connectStore, createFileTokenSource, redeemConnectionCode, storefrontTokenFromEnv, writeFileAtomic } from './node.js'
import { runCli, upsertEnv } from './cli.js'

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
// Fake OPS
// ---------------------------------------------------------------------------

type Fake = { server: Server; url: string; hits: { path: string; auth?: string; body: unknown }[]; setRedeem: (fn: (body: any) => { status: number; json: unknown }) => void; setRotate: (r: unknown) => void }

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const t = Buffer.concat(chunks).toString()
  return t ? JSON.parse(t) : {}
}

async function startFake(): Promise<Fake> {
  const hits: Fake['hits'] = []
  let redeem: (b: any) => { status: number; json: unknown } = () => ({ status: 200, json: okRedeem(SECRET) })
  let rotate: unknown = okRedeem('sk_live_rotated_000000009999')
  const server = createServer(async (req, res) => {
    const b = await body(req)
    hits.push({ path: req.url ?? '', ...(req.headers.authorization ? { auth: req.headers.authorization } : {}), body: b })
    const send = (status: number, j: unknown) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(j)))
    if (req.url === '/api/connect/v1/redeem') {
      const r = redeem(b)
      return send(r.status, r.json)
    }
    if (req.url === '/api/connect/v1/rotate') return send(200, rotate)
    if (req.url === '/api/connect/v1/heartbeat') return send(200, { ok: true })
    if (req.url === '/api/gw/_token') return send(200, { kind: 'secret', environment: 'sandbox', scopes: ['a'], missing_scopes: [], connection_id: 'c1', expires_at: null })
    send(404, {})
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  return { server, url: `http://127.0.0.1:${port}`, hits, setRedeem: (f) => void (redeem = f), setRotate: (r) => void (rotate = r) }
}

function okRedeem(secret: string, rotateAfter = new Date(Date.now() + 86_400_000).toISOString()) {
  return { ops_url: 'http://ops.invalid', connection_id: 'c1', environment: 'sandbox', secret_token: secret, scopes: ['catalog:read', 'customer:write', 'cart:write'], rotate_after: rotateAfter }
}

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

  it('redeems, writes the token 0600 and only OPS_URL + STOREFRONT_TOKEN_FILE to the env file', async () => {
    fake.setRedeem(() => ({ status: 200, json: { ...okRedeem(SECRET), ops_url: fake.url } }))
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
    expect(readFileSync(tf + '.json', 'utf8')).not.toContain(SECRET)
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
    const redeem = fake.hits.find((h) => h.path.endsWith('/redeem'))!
    expect(redeem.body).toMatchObject({ code: 'K7QM-2XPA', client_info: { sdk_version: expect.any(String), hostname: expect.any(String) } })
    expect(fake.hits.some((h) => h.path === '/api/gw/_token' && h.auth === `Bearer ${SECRET}`)).toBe(true)
  })

  it('reports an expired or used code and writes nothing', async () => {
    fake.setRedeem(() => ({ status: 410, json: { error: { code: 'code_expired' } } }))
    const r = await run(['connect', '--ops', fake.url])
    expect(r.status).toBe(1)
    expect(r.err).toContain('no es válido, ya se usó o venció')
    expect(existsSync(join(dir, 'storefront_token'))).toBe(false)
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

  it('upsertEnv keeps other lines', () => {
    expect(upsertEnv('A=1\n', { OPS_URL: 'x' })).toBe('A=1\nOPS_URL=x\n')
  })

  it('redeemConnectionCode rejects a malformed answer', async () => {
    fake.setRedeem(() => ({ status: 200, json: { nope: true } }))
    await expect(redeemConnectionCode({ opsUrl: fake.url, code: 'X' })).rejects.toMatchObject({ kind: 'invalid_response' })
  })
})

describe('connectStore.keepFresh', () => {
  it('heartbeats and rotates once rotate_after passes, atomically', async () => {
    const fake = await startFake()
    try {
      const dir = mkdtempSync(join(tmpdir(), 'sf-rot-'))
      const tf = join(dir, 'storefront_token')
      fake.setRedeem(() => ({ status: 200, json: { ...okRedeem(SECRET, new Date(Date.now() - 1000).toISOString()), ops_url: fake.url } }))
      const out: string[] = []
      await runCli(['connect', '--ops', fake.url, '--token-file', tf], { stdout: (l) => out.push(l), stderr: () => {}, promptCode: async () => 'K7QM-2XPA', env: {} })
      fake.setRotate({ ...okRedeem('sk_live_rotated_000000009999'), ops_url: fake.url })
      const errors: string[] = []
      const store = connectStore({ tokenFile: tf, onError: (m) => errors.push(m) })
      expect(await store.tick()).toBe('rotated')
      expect(readFileSync(tf, 'utf8').trim()).toBe('sk_live_rotated_000000009999')
      expect(statSync(tf).mode & 0o777).toBe(0o600)
      const rot = fake.hits.find((h) => h.path.endsWith('/rotate'))!
      expect(rot.auth).toBe(`Bearer ${SECRET}`)
      expect(errors).toEqual([])
      expect(await store.tick()).toBe('ok') // new rotate_after is in the future
    } finally {
      fake.server.close()
    }
  })

  it('reports failures without a token and without throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-fail-'))
    const tf = join(dir, 'storefront_token')
    writeFileSync(tf, SECRET)
    const errors: string[] = []
    const store = connectStore({ tokenFile: tf, opsUrl: 'http://127.0.0.1:1', onError: (m) => errors.push(m) })
    expect(await store.tick()).toBe('failed')
    expect(errors.join()).not.toContain(SECRET)
    expect(errors.join()).toContain('sk_…a91f')
  })
})
