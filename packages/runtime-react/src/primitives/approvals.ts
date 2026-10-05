// ApprovalInbox — tipos y cliente de la bandeja de aprobaciones del kernel
// (dynamic/approvals.go, rutas /approvals*). Una sola bandeja para TODO lo que
// declare `supervisor_policy`, `approval` o un guard `on_violation:
// request_approval`, sin importar el addon (descuentos, crédito, OC por monto,
// cancelación CFDI, ajustes negativos…).
import type { ApiClient } from '../api-context'

/** Espejo de dynamic.ApprovalRequest (JSON). jsonb llega como string. */
export interface ApprovalRequestDTO {
    id: string
    addon_key: string
    model_key: string
    record_id: string
    action_key: string
    constraint_key: string
    kind: 'constraint' | 'action' | 'explicit' | 'pin'
    label: string
    status: 'pending' | 'approved' | 'applied' | 'failed' | 'rejected' | 'expired'
    requested_by: string
    requested_by_role: string
    requested_at: string
    expires_at: string | null
    roles: string | string[]
    reason_required: boolean
    payload: string | Record<string, unknown>
    snapshot: string | Record<string, unknown>
    violation: string | Record<string, unknown>
    decided_by: string | null
    decided_at: string | null
    reason: string
    error: string
}

export interface ApprovalListQuery {
    status?: ApprovalRequestDTO['status']
    kind?: ApprovalRequestDTO['kind']
    model?: string
    /** Solo las que yo pedí. */
    mine?: boolean
    /** Solo las que mis roles pueden decidir (default de la bandeja). */
    for_me?: boolean
    page?: number
    per_page?: number
}

/** Categoría visible en la bandeja. El mapeo policy → categoría es extensible por addons. */
export interface ApprovalCategory {
    key: string
    label: string
    icon?: string
    /** Coincide si devuelve true (p. ej. por action_key, constraint_key o model_key). */
    match: (r: ApprovalRequestDTO) => boolean
}

const categories: ApprovalCategory[] = []

/** Los addons registran su categoría al cargar (purchases: «Compras», fiscal_mexico: «Cancelación CFDI»…). */
export function registerApprovalCategory(c: ApprovalCategory): () => void {
    categories.push(c)
    return () => {
        const i = categories.indexOf(c)
        if (i >= 0) categories.splice(i, 1)
    }
}

export function categorize(r: ApprovalRequestDTO): string {
    return categories.find(c => c.match(r))?.key ?? 'other'
}

export function groupApprovals(items: readonly ApprovalRequestDTO[]): Record<string, ApprovalRequestDTO[]> {
    const out: Record<string, ApprovalRequestDTO[]> = {}
    for (const r of items) (out[categorize(r)] ??= []).push(r)
    return out
}

export function parseJSONField<T = Record<string, unknown>>(v: string | T | null | undefined): T | null {
    if (v == null || v === '') return null
    if (typeof v !== 'string') return v
    try {
        return JSON.parse(v) as T
    } catch {
        return null
    }
}

/** Cliente fino sobre las rutas del kernel; la UI lo usa vía useApi(). */
export function approvalsClient(api: ApiClient) {
    const qs = (q: ApprovalListQuery) =>
        Object.entries(q)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
    return {
        list: async (q: ApprovalListQuery = { status: 'pending', for_me: true }) => {
            const res = await api.get(`/approvals?${qs(q)}`)
            return { items: (res.data?.data ?? []) as ApprovalRequestDTO[], total: Number(res.data?.meta?.total ?? 0) }
        },
        count: async () => Number((await api.get('/approvals/count')).data?.data?.count ?? 0),
        approve: (id: string, reason?: string) => api.post(`/approvals/${id}/approve`, { reason }),
        reject: (id: string, reason: string) => api.post(`/approvals/${id}/reject`, { reason }),
        approveWithPin: (id: string, pin: string, reason: string) => api.post(`/approvals/${id}/approve-pin`, { pin, reason }),
    }
}
