/**
 * Coalesces concurrent reads into one POST /api/q.
 *
 * Callers enqueue a batch token (`o:Customer?field=id&q=lop`). Tokens that
 * arrive inside an 8ms window share one request. Each part keeps its own
 * success, data and etag. A failed part does not reject the others.
 */
import type { ApiClient } from './api-context'

export interface QueryPart {
    success: boolean
    data?: unknown
    meta?: unknown
    message?: string
    etag?: string
    not_modified?: boolean
}

const WINDOW_MS = 8
const PART_TTL_MS = 30_000

type Waiter = {
    token: string
    resolve: (part: QueryPart) => void
    reject: (error: Error) => void
}

type CachedPart = { part: QueryPart; at: number }

const partCache = new Map<string, CachedPart>()
let waiters: Waiter[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let transport: ApiClient | null = null

function cacheScope(): string {
    if (typeof localStorage === 'undefined') return ''
    try {
        const raw = localStorage.getItem('auth_user')
        if (!raw) return ''
        return String((JSON.parse(raw) as { organization_id?: string }).organization_id ?? '')
    } catch {
        return ''
    }
}

export function optionsModelFromUrl(url: string): string | null {
    const match = url.match(/^\/options\/([A-Za-z][A-Za-z0-9_]*)$/)
    return match ? match[1] : null
}

export function optionsBatchToken(
    model: string,
    field: string,
    query: string,
    limit: number | undefined,
    filter: string | undefined,
): string {
    const params = new URLSearchParams()
    params.set('field', field)
    if (query) params.set('q', query)
    if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit))
    if (filter) params.set('filter_value', filter)
    return `o:${model}?${params.toString()}`
}

/** Names each distinct token so the server can key the response. */
export function nameBatchTokens(tokens: string[]): { name: string; token: string; plan: string }[] {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const token of tokens) {
        if (seen.has(token)) continue
        seen.add(token)
        unique.push(token)
    }
    return unique.map((token, index) => {
        const name = `q${index + 1}`
        return { name, token, plan: `${name}=${token}` }
    })
}

export function loadQueryPart(api: ApiClient, token: string): Promise<QueryPart> {
    const cached = partCache.get(`${cacheScope()}\n${token}`)
    if (cached && Date.now() - cached.at < PART_TTL_MS && cached.part.success) {
        return Promise.resolve(cached.part)
    }
    return new Promise((resolve, reject) => {
        transport = api
        waiters.push({ token, resolve, reject })
        if (timer == null) timer = setTimeout(() => void flushQueryBatch(), WINDOW_MS)
    })
}

async function flushQueryBatch() {
    timer = null
    const batch = waiters
    waiters = []
    const api = transport
    if (!api || batch.length === 0) return
    const named = nameBatchTokens(batch.map((waiter) => waiter.token))
    const byToken = new Map(named.map((part) => [part.token, part.name]))
    const inm: Record<string, string> = {}
    const scope = cacheScope()
    for (const part of named) {
        const cached = partCache.get(`${scope}\n${part.token}`)
        if (cached?.part.etag) inm[part.name] = cached.part.etag
    }
    try {
        const res = await api.post('/q', { parts: named.map((part) => part.plan), inm })
        const body = res?.data
        if (!body || body.success !== true || !body.parts) {
            throw new Error('batch unavailable')
        }
        for (const waiter of batch) {
            const name = byToken.get(waiter.token)
            const part = name ? (body.parts[name] as QueryPart | undefined) : undefined
            if (!part) {
                waiter.reject(new Error('batch part missing'))
                continue
            }
            if (part.not_modified) {
                const cached = partCache.get(`${scope}\n${waiter.token}`)
                if (cached) {
                    waiter.resolve(cached.part)
                    continue
                }
            }
            if (part.success) {
                partCache.set(`${scope}\n${waiter.token}`, { part, at: Date.now() })
            }
            waiter.resolve(part)
        }
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        for (const waiter of batch) waiter.reject(error)
    }
}
