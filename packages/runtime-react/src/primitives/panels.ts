// Contratos de los paneles del DocumentEditor. Los componentes viven en
// business/ (PartyCard, LinesGrid = DocumentLinesGrid, TotalsPanel,
// PreviewPanel, LoadFromDocument); aquí solo los tipos para que cualquier
// addon remoto los use sin depender de la implementación.
import type { LineItemsTotals } from '../business/line-items'

/** PartyCard: lo que se muestra de la contraparte. */
export interface PartySummary {
    id: string
    name: string
    tax_id?: string
    email?: string
    phone?: string
    currency?: string
    /** Filas extra (incluye las de extensiones `fiscal_data.*`). */
    rows: Array<{ key: string; label: string; value: string; tone?: 'ok' | 'warn' | 'err' }>
    credit?: { limit: number; balance: number; available: number; overdue: number; status?: 'active' | 'suspended' | 'delinquent'; hold_reason?: string }
}

/** TotalsPanel: desglose; los impuestos por tasa los aporta el addon fiscal o el core. */
export interface TotalsBreakdown extends LineItemsTotals {
    taxes: Array<{ label: string; base: number; amount: number }>
    /** Renglones extra (aplicaciones, saldo a favor, sin aplicar…). */
    extra?: Array<{ label: string; amount: number; emphasis?: boolean }>
    amount_in_words?: string
}

/** PreviewPanel: resultado de la acción de vista previa (`analyze: true`, no escribe). */
export interface PreviewResult {
    pdf_base64?: string
    xml?: string
    html?: string
    checks: ValidationCheck[]
}

/** ValidationChecklist: una revisión (local o del servidor). */
export interface ValidationCheck {
    key: string
    severity: 'ok' | 'warning' | 'error'
    message: string
    /** Campo a enfocar al hacer clic. */
    field?: string
    /** Si es error y `approval_policy` está, el botón ofrece «Pedir autorización». */
    approval_policy?: string
}

/** LoadFromDocument: candidato a cargar (venta, cotización, ticket, OT, factura origen de NC). */
export interface LoadCandidate {
    source: string // DocumentFormSource.key
    id: string
    label: string
    party_id?: string
    total?: number
    state?: string
}

export function blockingChecks(checks: readonly ValidationCheck[]): ValidationCheck[] {
    return checks.filter(c => c.severity === 'error' && !c.approval_policy)
}
