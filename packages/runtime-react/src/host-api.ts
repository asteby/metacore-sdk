// createHostApi — the HostApi a host hands to federated pages and panels.
//
// Built on the host's own authenticated ApiClient (axios-like). The wrapper is
// the security boundary between the host transport and remote code:
//   - every method resolves to the response BODY only — never the axios
//     response, whose `config.headers` carries the bearer token;
//   - every failure is re-thrown as a HostApiError with status, server message
//     and server body only — never the axios error, whose `config` and
//     `request` carry the same headers;
//   - the remote can address any API path the operator could (the kernel
//     enforces permissions server-side), but it cannot read or replace the
//     credentials the host attaches.
import { HostApiError } from '@asteby/metacore-sdk'
import type {
    HostApi,
    HostApiRequestOptions,
    HostQueryPart,
} from '@asteby/metacore-sdk'
import type { ApiClient } from './api-context'
import { isAbortError } from '@asteby/metacore-lib/envelope'
import { batchGet } from './query-batch'

export interface CreateHostApiOptions {
    /**
     * Endpoint the host serves capability queries on (`POST`, body
     * `{ capability, input }`, response = the contract's output). The host runs
     * the query with the viewer's permissions. Default `/capabilities/query`.
     */
    capabilityPath?: string
    /**
     * Group `get()` reads into `POST /q` like runtime-react's own reads.
     * Default `false`: remote reads go straight to their GET; `q()` always
     * batches.
     */
    batchGets?: boolean
    /**
     * Ceiling (ms) for a remote's per-call `timeout`. Default 600000 (10 min).
     * A remote asking for more, or for `0`, gets this ceiling. `0` here means
     * the host admits no ceiling (remote `0` = no limit).
     */
    maxTimeoutMs?: number
}

type AxiosLikeError = {
    message?: string
    response?: { status?: number; data?: unknown }
    status?: number
}

function errorMessage(data: unknown, fallback: string): string {
    if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>
        for (const k of ['message', 'error', 'detail']) {
            if (typeof d[k] === 'string' && d[k]) return d[k] as string
        }
    }
    return fallback
}

/** Strip transport details from any error before it reaches remote code. */
export function toHostApiError(e: unknown): HostApiError {
    if (e instanceof HostApiError) return e
    const err = (e ?? {}) as AxiosLikeError
    const status = err.response?.status ?? err.status ?? 0
    const data = err.response?.data
    const message = errorMessage(data, status ? `Request failed with status ${status}` : 'Network error')
    const code =
        data && typeof data === 'object' && typeof (data as { code?: unknown }).code === 'string'
            ? ((data as { code: string }).code)
            : undefined
    return new HostApiError(message, status, { code, data: safeData(data) })
}

// Server bodies are JSON the operator could already see; anything else
// (functions, DOM nodes, a Request) is dropped.
function safeData(data: unknown): unknown {
    if (data === null || data === undefined) return undefined
    if (typeof data !== 'object') return data
    try {
        return JSON.parse(JSON.stringify(data))
    } catch {
        return undefined
    }
}

/**
 * Headers the host owns. A remote may add headers but never set these: they
 * carry the credentials, the tenant scope or transport framing. Compared
 * lowercase.
 */
export const PROTECTED_HOST_HEADERS: ReadonlySet<string> = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'x-organization-id',
    'x-org-id',
    'x-branch-id',
    'accept-language',
    'host',
    'content-length',
    'content-type',
    'transfer-encoding',
    'origin',
    'referer',
    // Reenvio / identidad de origen: el backend arma URLs publicas y decide
    // tenant a partir de ellas.
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-for',
    'x-forwarded-port',
    'forwarded',
    'x-real-ip',
    'x-storefront-domain',
    'x-api-key',
    'x-http-method-override',
])
const PROTECTED_HEADER_PREFIXES = ['proxy-']

/** Drop protected / malformed headers; returns undefined when none remain. */
export function sanitizeRemoteHeaders(
    headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
    if (!headers || typeof headers !== 'object') return undefined
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
        if (typeof value !== 'string') continue
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) continue
        if (/[\r\n]/.test(value)) continue
        const lower = name.toLowerCase()
        if (PROTECTED_HOST_HEADERS.has(lower) || PROTECTED_HEADER_PREFIXES.some((p) => lower.startsWith(p))) continue
        out[name] = value
    }
    return Object.keys(out).length ? out : undefined
}

export const DEFAULT_MAX_TIMEOUT_MS = 600_000

/** Request-config key the host transport reads to bypass its offline cache. */
export const HOST_FRESHNESS_KEY = 'metacoreFreshness'

/**
 * Validate a requested timeout: finite number >= 0 else `undefined` (ignored);
 * clamp to `max` (0 or above max => max; `max === 0` => no ceiling).
 */
export function normalizeTimeout(t: unknown, max: number = DEFAULT_MAX_TIMEOUT_MS): number | undefined {
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return undefined
    if (max > 0 && (t === 0 || t > max)) return max
    return t
}

function toConfig(opts?: HostApiRequestOptions, maxTimeoutMs?: number): Record<string, unknown> | undefined {
    if (!opts) return undefined
    const config: Record<string, unknown> = {}
    if (opts.params) config.params = opts.params
    if (opts.signal) config.signal = opts.signal
    if (opts.responseType === 'blob') config.responseType = 'blob'
    const timeout = normalizeTimeout(opts.timeout, maxTimeoutMs)
    if (timeout !== undefined) config.timeout = timeout
    if (opts.freshness === 'network') config[HOST_FRESHNESS_KEY] = 'network'
    const headers = sanitizeRemoteHeaders(opts.headers)
    if (headers) config.headers = headers
    return config
}

// With `responseType: 'blob'` axios also delivers the error body as a Blob.
// Decode it back to JSON so `code`/`message` survive; non-JSON bodies are dropped.
async function decodeBlobError(e: unknown): Promise<unknown> {
    const resp = (e as AxiosLikeError | null)?.response
    if (!resp || typeof Blob === 'undefined' || !(resp.data instanceof Blob)) return e
    let data: unknown
    try {
        data = JSON.parse(await resp.data.text())
    } catch {
        data = undefined
    }
    return { ...(e as object), response: { ...resp, data } }
}

async function bodyOf<T>(p: Promise<{ data: unknown }>, opts?: HostApiRequestOptions): Promise<T> {
    try {
        const res = await p
        if (opts?.responseType === 'blob') {
            const d = res.data
            if (typeof Blob !== 'undefined' && d instanceof Blob) return d as T
            // Some transports hand back raw bytes; normalize so callers always get a Blob.
            if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) return new Blob([d as BlobPart]) as T
            throw new HostApiError('Expected a binary response', 0)
        }
        return res.data as T
    } catch (e) {
        // A cancelled request stays an abort (callers filter it with isAbortError).
        if (isAbortError(e)) throw e
        throw toHostApiError(opts?.responseType === 'blob' ? await decodeBlobError(e) : e)
    }
}

/** Build the remote-facing {@link HostApi} over the host's ApiClient. */
export function createHostApi(client: ApiClient, options: CreateHostApiOptions = {}): HostApi {
    const capabilityPath = options.capabilityPath ?? '/capabilities/query'
    const withConfig = <A extends unknown[]>(args: A, opts?: HostApiRequestOptions) => {
        const config = toConfig(opts, options.maxTimeoutMs)
        return config ? ([...args, config] as unknown[]) : (args as unknown[])
    }
    const patch = (client as ApiClient & {
        patch?: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>
    }).patch
    return Object.freeze({
        get: <T,>(path: string, opts?: HostApiRequestOptions) => {
            const args = withConfig([path], opts) as [string, { params?: Record<string, unknown> }?]
            // A GET with per-call headers cannot share a POST /q: it goes on its own.
            const batch = options.batchGets && opts?.responseType !== 'blob' && !sanitizeRemoteHeaders(opts?.headers) &&
                opts?.timeout === undefined && opts?.freshness !== 'network'
            return bodyOf<T>(batch ? batchGet(client, ...args) : client.get(...args), opts)
        },
        post: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.post(...(withConfig([path, body], opts) as [string, unknown, unknown?])), opts),
        put: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.put(...(withConfig([path, body], opts) as [string, unknown, unknown?])), opts),
        patch: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) => {
            if (typeof patch !== 'function') {
                return Promise.reject(new HostApiError('PATCH is not supported by this host', 0))
            }
            return bodyOf<T>(patch.call(client, ...(withConfig([path, body], opts) as [string, unknown, unknown?])), opts)
        },
        delete: <T,>(path: string, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.delete(...(withConfig([path], opts) as [string, unknown?])), opts),
        q: async <T,>(path: string, opts?: Pick<HostApiRequestOptions, 'params'>): Promise<HostQueryPart<T>> => {
            try {
                const url = path.startsWith('/') ? path : `/${path}`
                const res = await (opts?.params
                    ? batchGet(client, url, { params: opts.params as Record<string, unknown> })
                    : batchGet(client, url))
                const body = res.data as { success?: boolean; data?: T; meta?: unknown; message?: string }
                return {
                    success: body?.success !== false,
                    data: body?.data as T,
                    meta: body?.meta,
                    message: body?.message,
                }
            } catch (e) {
                throw toHostApiError(e)
            }
        },
        capability: <T,>(key: string, input: Record<string, unknown>) =>
            bodyOf<T>(client.post(capabilityPath, { capability: key, input })),
    }) as HostApi
}
