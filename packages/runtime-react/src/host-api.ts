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

function toConfig(opts?: HostApiRequestOptions): Record<string, unknown> | undefined {
    if (!opts) return undefined
    const config: Record<string, unknown> = {}
    if (opts.params) config.params = opts.params
    if (opts.signal) config.signal = opts.signal
    return config
}

async function bodyOf<T>(p: Promise<{ data: unknown }>): Promise<T> {
    try {
        const res = await p
        return res.data as T
    } catch (e) {
        throw toHostApiError(e)
    }
}

/** Build the remote-facing {@link HostApi} over the host's ApiClient. */
export function createHostApi(client: ApiClient, options: CreateHostApiOptions = {}): HostApi {
    const capabilityPath = options.capabilityPath ?? '/capabilities/query'
    const withConfig = <A extends unknown[]>(args: A, opts?: HostApiRequestOptions) => {
        const config = toConfig(opts)
        return config ? ([...args, config] as unknown[]) : (args as unknown[])
    }
    const patch = (client as ApiClient & {
        patch?: (url: string, body?: unknown, config?: unknown) => Promise<{ data: unknown }>
    }).patch
    return Object.freeze({
        get: <T,>(path: string, opts?: HostApiRequestOptions) => {
            const args = withConfig([path], opts) as [string, { params?: Record<string, unknown> }?]
            return bodyOf<T>(options.batchGets ? batchGet(client, ...args) : client.get(...args))
        },
        post: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.post(...(withConfig([path, body], opts) as [string, unknown, unknown?]))),
        put: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.put(...(withConfig([path, body], opts) as [string, unknown, unknown?]))),
        patch: <T,>(path: string, body?: unknown, opts?: HostApiRequestOptions) => {
            if (typeof patch !== 'function') {
                return Promise.reject(new HostApiError('PATCH is not supported by this host', 0))
            }
            return bodyOf<T>(patch.call(client, ...(withConfig([path, body], opts) as [string, unknown, unknown?])))
        },
        delete: <T,>(path: string, opts?: HostApiRequestOptions) =>
            bodyOf<T>(client.delete(...(withConfig([path], opts) as [string, unknown?]))),
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
