// PaymentAllocator — reglas puras para aplicar un pago a varios documentos
// abiertos (CxC: facturas del cliente; CxP: facturas del proveedor).
//
// Lo usan: cobro multi-factura + REP (customers / fiscal_mexico), CxC
// «Registrar abono», CxP «Aplicar pago», abonos de apartado. Sin React y sin
// host: la UI (PaymentAllocator) y el backend (wasm) pueden validar con lo mismo.
import { roundMoney } from '../business/format'

/** Documento abierto con saldo. `installments_paid` = parcialidades previas vigentes. */
export interface OpenDocument {
    id: string
    number: string
    issued_at: string // ISO date
    due_at?: string | null
    total: number
    balance: number
    currency: string
    /** `PPD` / `PUE` u otro: el núcleo no lo interpreta; fiscal_mexico sí. */
    payment_method?: string | null
    installments_paid?: number
    /** Extensiones de país (UUID, serie…). Pasan intactas a la línea. */
    extra?: Record<string, unknown>
}

export interface Allocation {
    document_id: string
    amount: number
    /** Saldo anterior / pagado / insoluto: lo que pide el DoctoRelacionado del REP y el estado de cuenta. */
    balance_before: number
    balance_after: number
    /** Número de parcialidad de ESTE pago para el documento (1-based). */
    installment: number
}

export type AllocationStrategy = 'oldest_due_first' | 'oldest_issued_first' | 'manual'

export interface AllocationResult {
    allocations: Allocation[]
    applied: number
    unapplied: number
}

function sortKey(d: OpenDocument, s: AllocationStrategy): string {
    return s === 'oldest_issued_first' ? d.issued_at : (d.due_at ?? d.issued_at)
}

/** Reparte `amount` sobre `docs` según la estrategia. `manual` respeta `manual[id]`. */
export function allocatePayment(
    amount: number,
    docs: readonly OpenDocument[],
    strategy: AllocationStrategy = 'oldest_due_first',
    manual: Readonly<Record<string, number>> = {},
): AllocationResult {
    let left = roundMoney(Math.max(0, amount))
    const ordered = strategy === 'manual' ? [...docs] : [...docs].sort((a, b) => sortKey(a, strategy).localeCompare(sortKey(b, strategy)))
    const allocations: Allocation[] = []
    for (const d of ordered) {
        if (left <= 0) break
        const balance = roundMoney(d.balance)
        if (balance <= 0) continue
        const want = strategy === 'manual' ? roundMoney(manual[d.id] ?? 0) : balance
        const pay = roundMoney(Math.min(want, balance, left))
        if (pay <= 0) continue
        allocations.push({
            document_id: d.id,
            amount: pay,
            balance_before: balance,
            balance_after: roundMoney(balance - pay),
            installment: (d.installments_paid ?? 0) + 1,
        })
        left = roundMoney(left - pay)
    }
    const applied = roundMoney(allocations.reduce((s, a) => s + a.amount, 0))
    return { allocations, applied, unapplied: roundMoney(Math.max(0, amount) - applied) }
}

export interface AllocationIssue {
    code: 'over_balance' | 'over_amount' | 'currency_mismatch' | 'unapplied' | 'non_positive'
    document_id?: string
    severity: 'error' | 'warning'
}

/** Revisión previa a guardar (la UI la pinta en ValidationChecklist; el backend la repite). */
export function validateAllocation(
    amount: number,
    currency: string,
    docs: readonly OpenDocument[],
    allocations: readonly Allocation[],
    opts: { allowUnapplied?: boolean } = {},
): AllocationIssue[] {
    const byId = new Map(docs.map(d => [d.id, d]))
    const issues: AllocationIssue[] = []
    if (amount <= 0) issues.push({ code: 'non_positive', severity: 'error' })
    for (const a of allocations) {
        const d = byId.get(a.document_id)
        if (!d) continue
        if (a.amount > roundMoney(d.balance) + 0.005) issues.push({ code: 'over_balance', document_id: d.id, severity: 'error' })
        if (d.currency !== currency) issues.push({ code: 'currency_mismatch', document_id: d.id, severity: 'error' })
    }
    const applied = roundMoney(allocations.reduce((s, a) => s + a.amount, 0))
    if (applied > roundMoney(amount) + 0.005) issues.push({ code: 'over_amount', severity: 'error' })
    else if (applied < roundMoney(amount) - 0.005) issues.push({ code: 'unapplied', severity: opts.allowUnapplied ? 'warning' : 'error' })
    return issues
}
