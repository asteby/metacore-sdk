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
// Connection protocol
// ---------------------------------------------------------------------------

export type RedeemResponse = {
  ops_url: string
  connection_id: string
  environment: string
  secret_token: string
  publishable_token?: string
  scopes: string[]
  /** ISO time from which the token should be rotated. */
  rotate_after: string
}

export type ConnectClientInfo = { sdk_version: string; hostname: string; site_url?: string }

/** Why a connection call failed, in terms an operator can act on. */
export type ConnectErrorKind = 'invalid_code' | 'rate_limited' | 'network' | 'unauthorized' | 'server' | 'invalid_response'

export class ConnectError extends Error {
  override readonly name = 'ConnectError'
  constructor(
    readonly kind: ConnectErrorKind,
    message: string,
    readonly status = 0,
  ) {
    super(message)
  }
}

const trimSlash = (u: string) => u.replace(/\/+$/, '')

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
  if (!res.ok) {
    if (res.status === 429) throw new ConnectError('rate_limited', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 429)
    if (res.status === 401 || res.status === 403) throw new ConnectError('unauthorized', 'OPS rechazó la credencial de esta tienda.', res.status)
    if (res.status >= 500) throw new ConnectError('server', 'OPS no pudo atender la solicitud. Inténtalo de nuevo en un momento.', res.status)
    throw new ConnectError('invalid_code', 'El código no es válido, ya se usó o venció. Genera uno nuevo en OPS → Conexiones y API.', res.status)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ConnectError('invalid_response', 'OPS respondió algo que no entendimos.', res.status)
  }
}

function assertRedeem(r: unknown): asserts r is RedeemResponse {
  const o = r as Partial<RedeemResponse> | undefined
  if (!o || typeof o.secret_token !== 'string' || !o.secret_token || typeof o.connection_id !== 'string' || !Array.isArray(o.scopes)) {
    throw new ConnectError('invalid_response', 'OPS respondió algo que no entendimos.')
  }
}

export type RedeemOptions = { opsUrl: string; code: string; siteUrl?: string; fetch?: FetchLike }

/** Exchanges the one-time connection code for the store's token. `POST {ops}/api/connect/v1/redeem`. */
export async function redeemConnectionCode(opts: RedeemOptions): Promise<RedeemResponse> {
  const fetchImpl = opts.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike)
  const client_info: ConnectClientInfo = { sdk_version: SDK_VERSION, hostname: hostname(), ...(opts.siteUrl ? { site_url: opts.siteUrl } : {}) }
  const res = await post<unknown>(fetchImpl, `${trimSlash(opts.opsUrl)}/api/connect/v1/redeem`, { code: opts.code.trim(), client_info })
  assertRedeem(res)
  return res
}

/** What is kept next to the token file: everything but the secret. */
export type ConnectionState = {
  ops_url: string
  connection_id: string
  environment: string
  scopes: string[]
  rotate_after: string
}

export const stateFileFor = (tokenFile: string) => `${tokenFile}.json`

/** Saves a redeemed/rotated connection: the token (0600, atomic) and its non-secret state beside it. */
export function saveConnection(tokenFile: string, r: RedeemResponse, opsUrl = r.ops_url): void {
  const state: ConnectionState = { ops_url: trimSlash(r.ops_url || opsUrl), connection_id: r.connection_id, environment: r.environment, scopes: r.scopes, rotate_after: r.rotate_after }
  // State first: if the process dies in between, the old token still works and rotation is just retried.
  writeFileAtomic(stateFileFor(tokenFile), JSON.stringify(state, null, 2) + '\n')
  writeFileAtomic(tokenFile, r.secret_token + '\n')
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
  /** Called with a short message when a heartbeat or rotation fails. It never receives a token. */
  onError?: (message: string) => void
}

export type KeepFreshOptions = {
  /** Heartbeat period (default 10 min). */
  intervalMs?: number
}

/**
 * The store's side of the connection after `connect`: `keepFresh()` sends a heartbeat and, when `rotate_after`
 * passes, rotates the token (`POST /api/connect/v1/rotate`, Bearer = current `sk_`), writes the new file and lets a
 * `createFileTokenSource` client pick it up within its re-read interval. The old token keeps working during a grace
 * period set by OPS. It never throws and never keeps the process alive.
 */
export function connectStore(options: ConnectStoreOptions = {}) {
  const tokenFile = resolve(options.tokenFile ?? process.env.STOREFRONT_TOKEN_FILE ?? 'storefront_token')
  const fetchImpl = options.fetch ?? (globalThis.fetch.bind(globalThis) as FetchLike)
  const now = options.now ?? Date.now
  const report = (m: string) => {
    try {
      options.onError?.(m)
    } catch {
      /* ignore */
    }
  }

  async function tick(): Promise<'ok' | 'rotated' | 'failed'> {
    const state = loadConnectionState(tokenFile)
    const opsUrl = options.opsUrl ?? state?.ops_url
    let token: string
    try {
      token = readFileSync(tokenFile, 'utf8').trim()
    } catch {
      report(`No se pudo leer el archivo del token (${tokenFile}).`)
      return 'failed'
    }
    if (!opsUrl || !token) {
      report('Falta la dirección de OPS o el token: vuelve a ejecutar `npx @asteby/storefront connect`.')
      return 'failed'
    }
    const base = `${trimSlash(opsUrl)}/api/connect/v1`
    try {
      await post<unknown>(fetchImpl, `${base}/heartbeat`, { sdk_version: SDK_VERSION, hostname: hostname() }, token)
      const due = state?.rotate_after ? Date.parse(state.rotate_after) : NaN
      if (!Number.isNaN(due) && now() >= due) {
        const next = await post<unknown>(fetchImpl, `${base}/rotate`, {}, token)
        assertRedeem(next)
        saveConnection(tokenFile, { ...next, ops_url: next.ops_url || opsUrl }, opsUrl)
        return 'rotated'
      }
      return 'ok'
    } catch (err) {
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
      const timer = setInterval(() => void tick(), opts.intervalMs ?? 600_000)
      timer.unref?.()
      void tick()
      return () => clearInterval(timer)
    },
  }
}
