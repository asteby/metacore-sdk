// Default ViewDataSource over the runtime-react ApiClient, plus the pure
// helpers renderers share (capability input mapping, item extraction, date
// grouping). Light on purpose: this module is in the static graph.
import type { ApiClient } from '../api-context'
import type { WidgetData } from '../dashboard-types'
import type { ChartRequest, ViewDataSource, ViewListParams, ViewRows } from './types'

export interface ApiViewDataSourceOptions {
    /**
     * Endpoint the host serves declared view/panel charts on (`POST`, body
     * {@link ChartRequest} in snake_case, response `{ success, data: WidgetData }`).
     * Default `/views/chart`.
     */
    chartPath?: string
    /** Capability query endpoint (`POST { capability, input }`). Default `/capabilities/query`. */
    capabilityPath?: string
}

type Envelope<T> = { success?: boolean; data?: T; meta?: { total?: number }; message?: string }

function unwrap<T>(body: unknown): { data: T | undefined; total?: number } {
    const env = body as Envelope<T>
    if (env && typeof env === 'object' && 'success' in env) {
        if (env.success === false) throw new Error(env.message || 'request failed')
        return { data: env.data, total: env.meta?.total }
    }
    return { data: body as T }
}

export function createApiViewDataSource(
    api: ApiClient,
    opts: ApiViewDataSourceOptions = {},
): ViewDataSource {
    const chartPath = opts.chartPath ?? '/views/chart'
    const capabilityPath = opts.capabilityPath ?? '/capabilities/query'
    return {
        async list(model: string, params?: ViewListParams): Promise<ViewRows> {
            const res = await api.get(`/data/${encodeURIComponent(model)}`, params ? { params } : undefined)
            const { data, total } = unwrap<Record<string, unknown>[]>(res.data)
            return { rows: Array.isArray(data) ? data : [], total }
        },
        async record(model: string, id: string) {
            const res = await api.get(`/data/${encodeURIComponent(model)}/${encodeURIComponent(id)}`)
            return unwrap<Record<string, unknown>>(res.data).data ?? null
        },
        async chart(req: ChartRequest): Promise<WidgetData> {
            const res = await api.post(chartPath, {
                model: req.model,
                query: req.query,
                relation: req.relation,
                record_id: req.recordId,
                panel_key: req.panelKey,
            })
            return unwrap<WidgetData>(res.data).data ?? {}
        },
        async capability(key: string, input: Record<string, unknown>) {
            const res = await api.post(capabilityPath, { capability: key, input })
            return unwrap<unknown>(res.data).data
        },
    }
}

/**
 * Map a timeline source `input` (`record.<column>` | `const:<literal>`) onto
 * the record. Unknown forms are rejected (the kernel validates them; a host
 * serving something else is a bug, not something to guess at).
 */
export function resolveCapabilityInput(
    input: Record<string, string> | undefined,
    record: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, ref] of Object.entries(input ?? {})) {
        if (ref.startsWith('record.')) out[key] = record[ref.slice('record.'.length)]
        else if (ref.startsWith('const:')) out[key] = ref.slice('const:'.length)
        else throw new Error(`timeline source input "${key}": unsupported reference "${ref}"`)
    }
    return out
}

/** Read the `items` array (dot path) out of a capability output. */
export function pickItems(output: unknown, path: string | undefined): Record<string, unknown>[] {
    let cur: unknown = output
    for (const seg of (path ?? '').split('.').filter(Boolean)) {
        cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined
    }
    return Array.isArray(cur) ? (cur.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []
}

/** Parse a date-ish value (ISO string, epoch ms, Date). */
export function toDate(v: unknown): Date | null {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
    if (typeof v === 'number') return new Date(v)
    if (typeof v === 'string' && v) {
        // Date-only values are calendar days: anchor at local noon so a time
        // zone offset never moves them to the previous day.
        const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v)
        return Number.isNaN(d.getTime()) ? null : d
    }
    return null
}

/** `YYYY-MM-DD` of a date in local time. */
export function dayKey(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Sort entries by a date field, newest first (stable for equal dates). */
export function sortByDate<T extends Record<string, unknown>>(rows: T[], field: string, dir: 'asc' | 'desc' = 'desc'): T[] {
    const k = dir === 'desc' ? -1 : 1
    return rows
        .map((r, i) => ({ r, i, t: toDate(r[field])?.getTime() ?? Number.NEGATIVE_INFINITY }))
        .sort((a, b) => (a.t === b.t ? a.i - b.i : (a.t - b.t) * k))
        .map((x) => x.r)
}

/** Display string of a cell value (renderers show what the server sent). */
export function displayValue(v: unknown): string {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>
        for (const k of ['label', 'name', 'title', 'display']) if (typeof o[k] === 'string') return o[k] as string
        return JSON.stringify(v)
    }
    return String(v)
}
