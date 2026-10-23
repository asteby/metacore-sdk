/**
 * Node-only helpers (`@asteby/storefront/node`): read the store's token from a file that can rotate, and the
 * connection protocol with OPS (`connectStore`). Nothing here runs in browsers or edge runtimes.
 */
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { maskToken } from './diagnose.js'
import type { FetchLike } from './client.js'

declare const __SDK_VERSION__: string | undefined
export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : 'dev'

// ---------------------------------------------------------------------------
// Token from a file
// ---------------------------------------------------------------------------

export type FileTokenSourceOptions = {
  /** How often the file is checked again (default 30 s). Between checks the cached token is returned. */
  ttlMs?: number
  /** Clock, for tests. */
  now?: () => number
}

/**
 * A `() => string` for `createStorefrontClient({ token })` that reads `file`, caches it and looks again every
 * `ttlMs` (30 s): the file is read only when its mtime or size changed. A failed re-read keeps the last good token
 * (a rotation in progress never takes the store down); only a first read that fails throws.
 */
export function createFileTokenSource(file: string, options: FileTokenSourceOptions = {}): () => string {
  const ttl = options.ttlMs ?? 30_000
  const now = options.now ?? Date.now
  let token = ''
  let stamp = ''
  let checkedAt = -Infinity
  return () => {
    if (token && now() - checkedAt < ttl) return token
    checkedAt = now()
    try {
      const st = statSync(file)
      const next = `${st.mtimeMs}:${st.size}`
      if (!token || next !== stamp) {
        const text = readFileSync(file, 'utf8').trim()
        if (text) {
          token = text
          stamp = next
        } else if (!token) {
          throw new Error('token file is empty')
        }
      }
    } catch (err) {
      if (!token) throw new Error(`Cannot read the storefront token file ${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return token
  }
}

export type TokenEnv = Record<string, string | undefined>

/**
 * The store's token from the environment, in this order:
 * 1. `STOREFRONT_TOKEN_FILE` (path),
 * 2. `$CREDENTIALS_DIRECTORY/storefront_token` (systemd `LoadCredential=`),
 * 3. `STOREFRONT_TOKEN` (the plain variable, as before).
 * Files come back as a rotating source (re-read every 30 s); the variable as a plain string. `undefined` when
 * nothing is configured.
 */
export function storefrontTokenFromEnv(env: TokenEnv = process.env, options: FileTokenSourceOptions = {}): string | (() => string) | undefined {
  const file = env.STOREFRONT_TOKEN_FILE?.trim()
  if (file) return createFileTokenSource(file, options)
  const dir = env.CREDENTIALS_DIRECTORY?.trim()
  if (dir) {
    const f = join(dir, 'storefront_token')
    if (existsSync(f)) return createFileTokenSource(f, options)
  }
  const plain = env.STOREFRONT_TOKEN?.trim()
  return plain || undefined
}

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

/** Writes `content` to `file` atomically (temp file in the same directory, fsync, rename) with mode 0600. */
export function writeFileAtomic(file: string, content: string, mode = 0o600): void {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.${file.split('/').pop()}.${process.pid}.${Date.now().toString(36)}.tmp`)
  const fd = openSync(tmp, 'wx', mode)
  try {
    writeSync(fd, content)
    fsyncSync(fd)
  } catch (err) {
    closeSync(fd)
    try {
      unlinkSync(tmp)
    } catch {
      /* best effort */
    }
    throw err
  }
  closeSync(fd)
  try {
    chmodSync(tmp, mode) // umask can only remove bits at creation; make it exact
    renameSync(tmp, file)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* best effort */
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Connection protocol (OPS: docs/STOREFRONT-GATEWAY.md, "Conexión de tienda")
// ---------------------------------------------------------------------------

/** The connection a key belongs to, as OPS describes it. */
export type ConnectionBrief = { id: string; name: string; kind: string; profile: string; environment: string }

/** What `redeem` and `rotate` hand over (inside `data`). `rotate` carries no `rotation_days` or `api_base`. */
export type ConnectionGrant = {
  token: string
  /** Always `null` today. */
  publishable_token: string | null
  connection: ConnectionBrief
  scopes: string[]
  rotation_days?: number
  /** `{OPS}/api/gw`: the base URL for `createStorefrontClient`. */
  api_base?: string
  /** After a rotation: until when the previous key still works. */
  grace_until?: string | null
}

/** `POST /heartbeat` answer (inside `data`). */
export type HeartbeatResult = {
  status: string
  scopes: string[]
  missing_scopes: string[]
  next_rotation_at?: string | null
  rotate_now?: boolean
  server_time?: string
}

/** `client` block of `redeem` and `heartbeat` requests. */
export type ConnectClientInfo = { name: string; version: string; runtime: string; hostname: string }

export function connectClientInfo(): ConnectClientInfo {
  return { name: '@asteby/storefront', version: SDK_VERSION, runtime: `node ${process.version}`, hostname: hostname() }
}

/** Why a connection call failed, in terms an operator can act on. */
export type ConnectErrorKind = 'invalid_code' | 'rate_limited' | 'network' | 'unauthorized' | 'server' | 'invalid_response'

export class ConnectError extends Error {
  override readonly name = 'ConnectError'
  constructor(
    readonly kind: ConnectErrorKind,
    message: string,
    readonly status = 0,
    /** `Retry-After` of a 429, in seconds. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

const trimSlash = (u: string) => u.replace(/\/+$/, '')
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The kernel envelope `{success:true,data}` is unwrapped; a flat object is accepted as is. */
export function unwrapEnvelope(body: unknown): unknown {
  return isObj(body) && typeof body.success === 'boolean' && 'data' in body ? body.data : body
}

async function post<T>(fetchImpl: FetchLike, url: string, body: unknown, bearer?: string): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ConnectError('network', 'No pudimos comunicarnos con OPS. Revisa la dirección y tu conexión a internet.')
  }
  const text = await res.text().catch(() => '')
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }
  if (!res.ok) {
    // Errors: `{success:false, error:"<code>", message:"<es-MX>"}` (or `error:{code,message}`).
    const o = isObj(json) ? json : {}
    const e = isObj(o.error) ? o.error : undefined
    const code = typeof o.error === 'string' ? o.error : typeof e?.code === 'string' ? e.code : ''
    const message = typeof o.message === 'string' ? o.message : typeof e?.message === 'string' ? e.message : ''
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After'))
      throw new ConnectError('rate_limited', message || 'Demasiados intentos. Espera un momento y vuelve a intentarlo.', 429, Number.isFinite(ra) && ra > 0 ? ra : undefined)
    }
    if (res.status === 401 || code === 'invalid_token') throw new ConnectError('unauthorized', message || 'Clave inválida.', res.status)
    if (code === 'invalid_code') throw new ConnectError('invalid_code', message || 'El código no es válido o ya venció. Genera uno nuevo desde OPS.', res.status)
    if (res.status >= 500) throw new ConnectError('server', message || 'OPS no pudo atender la solicitud. Inténtalo de nuevo en un momento.', res.status)
    throw new ConnectError('server', message || `OPS respondió ${res.status}.`, res.status)
  }
  if (json === undefined) throw new ConnectError('invalid_response', 'OPS respondió algo que no entendimos.', res.status)
  return unwrapEnvelope(json) as T
}

function assertGrant(r: unknown): asserts r is ConnectionGrant {
  const o = r as Partial<ConnectionGrant> | undefined
  if (!isObj(o) || typeof o.token !== 'string' || !o.token || !isObj(o.connection) || typeof o.connection.id !== 'string' || !Array.isArray(o.scopes)) {
    throw new ConnectError('invalid_response', 'OPS respondió algo que no entendimos.')
  }
}

export type RedeemOptions = { opsUrl: string; code: string; fetch?: FetchLike }

/** Exchanges the one-time connection code for the store's key. `POST {ops}/api/connect/v1/redeem`. */
export async function redeemConnectionCode(opts: RedeemOptions): Promise<ConnectionGrant> {
  const fetchImpl = opts.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike)
  const res = await post<unknown>(fetchImpl, `${trimSlash(opts.opsUrl)}/api/connect/v1/redeem`, { code: opts.code.trim(), client: connectClientInfo() })
  assertGrant(res)
  return res
}

/** What is kept next to the token file: everything but the secret. */
export type ConnectionState = {
  ops_url: string
  api_base: string
  connection: ConnectionBrief
  scopes: string[]
  rotation_days: number
  /** ISO time from which the key should be rotated (`now + rotation_days`, or the heartbeat's `next_rotation_at`). */
  rotate_after: string
  grace_until?: string | null
}

export const stateFileFor = (tokenFile: string) => `${tokenFile}.json`

const DEFAULT_ROTATION_DAYS = 90
const DAY_MS = 86_400_000

/** Builds the state after a redeem/rotate; a rotation keeps the `rotation_days` and `api_base` it does not carry. */
export function stateFromGrant(g: ConnectionGrant, opsUrl: string, prev: ConnectionState | null, now = Date.now()): ConnectionState {
  const days = g.rotation_days && g.rotation_days > 0 ? g.rotation_days : (prev?.rotation_days ?? DEFAULT_ROTATION_DAYS)
  return {
    ops_url: trimSlash(opsUrl),
    api_base: g.api_base || prev?.api_base || `${trimSlash(opsUrl)}/api/gw`,
    connection: g.connection,
    scopes: g.scopes,
    rotation_days: days,
    rotate_after: new Date(now + days * DAY_MS).toISOString(),
    ...(g.grace_until ? { grace_until: g.grace_until } : {}),
  }
}

/** Saves a redeemed/rotated connection: the key (0600, atomic) and its non-secret state beside it. */
export function saveConnection(tokenFile: string, g: ConnectionGrant, state: ConnectionState): void {
  // State first: if the process dies in between, the old key still works and rotation is just retried.
  writeFileAtomic(stateFileFor(tokenFile), JSON.stringify(state, null, 2) + '\n')
  writeFileAtomic(tokenFile, g.token + '\n')
}

export function loadConnectionState(tokenFile: string): ConnectionState | null {
  try {
    return JSON.parse(readFileSync(stateFileFor(tokenFile), 'utf8')) as ConnectionState
  } catch {
    return null
  }
}

export type ConnectStoreOptions = {
  /** OPS base URL (`https://ops.example.com`). Defaults to the one saved by `connect`. */
  opsUrl?: string
  /** File `connect` wrote (default: `STOREFRONT_TOKEN_FILE`, then `./storefront_token`). */
  tokenFile?: string
  fetch?: FetchLike
  /** Clock, for tests. */
  now?: () => number
  /** Called with a short message when a heartbeat or rotation fails. It never receives a key. */
  onError?: (message: string) => void
}

export type KeepFreshOptions = {
  /** Heartbeat period (default 10 min). A `429 Retry-After` longer than this delays the next one. */
  intervalMs?: number
}

export type TickResult = 'ok' | 'rotated' | 'failed'

/**
 * The store's side of the connection after `connect`: `keepFresh()` sends a heartbeat and rotates the key when OPS
 * says `rotate_now`, or `next_rotation_at` / `rotate_after` has passed (`POST /api/connect/v1/rotate`, Bearer = current
 * `sk_`). It writes the new file; a `createFileTokenSource` client picks it up within its re-read interval, and the
 * old key keeps working during OPS's grace period. It never throws and never keeps the process alive.
 */
export function connectStore(options: ConnectStoreOptions = {}) {
  const tokenFile = resolve(options.tokenFile ?? process.env.STOREFRONT_TOKEN_FILE ?? 'storefront_token')
  const fetchImpl = options.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike)
  const now = options.now ?? Date.now
  let retryAfterMs = 0
  const report = (m: string) => {
    try {
      options.onError?.(m)
    } catch {
      /* ignore */
    }
  }

  async function tick(): Promise<TickResult> {
    retryAfterMs = 0
    let state = loadConnectionState(tokenFile)
    const opsUrl = options.opsUrl ?? state?.ops_url
    let token: string
    try {
      token = readFileSync(tokenFile, 'utf8').trim()
    } catch {
      report(`No se pudo leer el archivo de la clave (${tokenFile}).`)
      return 'failed'
    }
    if (!opsUrl || !token) {
      report('Falta la dirección de OPS o la clave: vuelve a ejecutar `npx @asteby/storefront connect`.')
      return 'failed'
    }
    const base = `${trimSlash(opsUrl)}/api/connect/v1`
    try {
      const hb = await post<HeartbeatResult>(fetchImpl, `${base}/heartbeat`, { client: connectClientInfo() }, token)
      if (state && hb?.next_rotation_at && hb.next_rotation_at !== state.rotate_after) {
        state = { ...state, rotate_after: hb.next_rotation_at }
        writeFileAtomic(stateFileFor(tokenFile), JSON.stringify(state, null, 2) + '\n')
      }
      const due = Date.parse(hb?.next_rotation_at ?? state?.rotate_after ?? '')
      if (hb?.rotate_now === true || (!Number.isNaN(due) && now() >= due)) {
        const next = await post<unknown>(fetchImpl, `${base}/rotate`, {}, token)
        assertGrant(next)
        saveConnection(tokenFile, next, stateFromGrant(next, opsUrl, state, now()))
        return 'rotated'
      }
      return 'ok'
    } catch (err) {
      if (err instanceof ConnectError && err.retryAfterSeconds) retryAfterMs = err.retryAfterSeconds * 1000
      report(err instanceof ConnectError ? `${err.message} (${maskToken(token)})` : `Falló el latido de la conexión (${maskToken(token)}).`)
      return 'failed'
    }
  }

  return {
    tokenFile,
    /** One heartbeat (+ rotation when due). Resolves, never rejects. */
    tick,
    /** Starts the periodic heartbeat; returns `stop()`. */
    keepFresh(opts: KeepFreshOptions = {}): () => void {
      const interval = opts.intervalMs ?? 600_000
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const loop = async () => {
        await tick()
        if (stopped) return
        timer = setTimeout(() => void loop(), Math.max(interval, retryAfterMs))
        timer.unref?.()
      }
      void loop()
      return () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    },
  }
}
