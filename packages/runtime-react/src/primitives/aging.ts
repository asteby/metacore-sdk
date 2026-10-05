// AgingTable — antigüedad de saldos (CxC y CxP) como función pura.
//
// customers ya guarda aging_1_30 … aging_90_plus por cliente (refresh_credit_file).
// Esta función es la MISMA regla para la UI (drill-down por documento, CxP que
// hoy no la tiene) y para reportes: un solo lugar decide qué es «corriente».
import { roundMoney } from '../business/format'

export interface AgingBucket {
    key: string
    label: string
    /** Días vencidos desde (inclusive). `current` usa -Infinity..0. */
    from: number
    /** Días vencidos hasta (inclusive). `null` = sin tope. */
    to: number | null
}

export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
    { key: 'current', label: 'Corriente', from: Number.NEGATIVE_INFINITY, to: 0 },
    { key: 'd1_30', label: '1–30', from: 1, to: 30 },
    { key: 'd31_60', label: '31–60', from: 31, to: 60 },
    { key: 'd61_90', label: '61–90', from: 61, to: 90 },
    { key: 'd90_plus', label: '90+', from: 91, to: null },
]

export interface AgingDoc {
    party_id: string
    party_name?: string
    due_at: string | null // ISO date; null = vence al emitir
    issued_at: string
    balance: number
}

export interface AgingRow {
    party_id: string
    party_name?: string
    buckets: Record<string, number>
    total: number
    overdue: number
    oldest_overdue_days: number
}

const DAY = 86_400_000

/** Días vencidos al corte (negativo = falta para vencer). Fechas en ISO (día). */
export function daysOverdue(dueISO: string, asOfISO: string): number {
    const due = Date.parse(dueISO.slice(0, 10) + 'T00:00:00Z')
    const asOf = Date.parse(asOfISO.slice(0, 10) + 'T00:00:00Z')
    return Math.round((asOf - due) / DAY)
}

export function bucketFor(days: number, buckets: readonly AgingBucket[] = DEFAULT_AGING_BUCKETS): string {
    for (const b of buckets) if (days >= b.from && (b.to === null || days <= b.to)) return b.key
    return buckets[buckets.length - 1].key
}

/** Agrupa por contraparte y tramo. Saldos ≤ 0 se ignoran (anticipos van aparte). */
export function computeAging(docs: readonly AgingDoc[], asOfISO: string, buckets: readonly AgingBucket[] = DEFAULT_AGING_BUCKETS): { rows: AgingRow[]; totals: Record<string, number>; total: number } {
    const rows = new Map<string, AgingRow>()
    const totals: Record<string, number> = Object.fromEntries(buckets.map(b => [b.key, 0]))
    for (const d of docs) {
        if (d.balance <= 0) continue
        const days = daysOverdue(d.due_at ?? d.issued_at, asOfISO)
        const key = bucketFor(days, buckets)
        const row = rows.get(d.party_id) ?? { party_id: d.party_id, party_name: d.party_name, buckets: Object.fromEntries(buckets.map(b => [b.key, 0])), total: 0, overdue: 0, oldest_overdue_days: 0 }
        row.buckets[key] = roundMoney(row.buckets[key] + d.balance)
        row.total = roundMoney(row.total + d.balance)
        if (days > 0) {
            row.overdue = roundMoney(row.overdue + d.balance)
            row.oldest_overdue_days = Math.max(row.oldest_overdue_days, days)
        }
        totals[key] = roundMoney(totals[key] + d.balance)
        rows.set(d.party_id, row)
    }
    const list = [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.total - a.total)
    return { rows: list, totals, total: roundMoney(list.reduce((s, r) => s + r.total, 0)) }
}
