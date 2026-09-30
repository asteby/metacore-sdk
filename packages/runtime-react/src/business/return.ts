// Devolución de mercancía (ReturnWizard: POS, Pedido, Factura, RMA, OT, devolución
// a proveedor). Lógica pura, sin endpoints: cada consumidor cablea el envío.
// Flujo (benchmark §8.2): renglones → condición y destino → recepción → reembolso o NC.
import { roundMoney, toAmount } from './format'
import { validateRefund, type RefundAllocation, type RefundDestinationOption } from './refund'

/** Estado físico de lo que regresa. */
export type ReturnCondition = 'sellable' | 'defective'
/** A dónde va la mercancía: stock vendible, merma o garantía (reclamo al proveedor). */
export type ReturnStockDestination = 'stock' | 'scrap' | 'warranty'

export const RETURN_CONDITION_DESTINATIONS: Record<ReturnCondition, ReturnStockDestination[]> = {
    sellable: ['stock'],
    defective: ['scrap', 'warranty'],
}

/** Destino por defecto de una condición (vendible → stock, defectuoso → merma). */
export function defaultStockDestination(condition: ReturnCondition): ReturnStockDestination {
    return RETURN_CONDITION_DESTINATIONS[condition][0]
}

/** Renglón devolvible: lo vendido menos lo ya devuelto. */
export interface ReturnableLine {
    key: string
    product_id?: string
    description: string
    sold: number
    alreadyReturned?: number
    /** Precio unitario neto de descuento tal como se vendió (congelado). */
    unit_price: number
    /** Fracción (0.16). */
    tax_rate?: number
}

export interface ReturnLineChoice {
    quantity: number
    condition: ReturnCondition
    destination: ReturnStockDestination
}

export type ReturnChoices = Record<string, ReturnLineChoice>

export function returnableQty(l: ReturnableLine): number {
    return Math.max(0, roundMoney(l.sold - (l.alreadyReturned ?? 0), 4))
}

export interface ReturnTotals {
    base: number
    tax: number
    total: number
    goodsLines: number
}

export function computeReturnTotals(lines: ReturnableLine[], choices: ReturnChoices): ReturnTotals {
    let base = 0
    let tax = 0
    let goodsLines = 0
    for (const l of lines) {
        const c = choices[l.key]
        const q = c ? toAmount(c.quantity) : 0
        if (q <= 0) continue
        goodsLines += 1
        const b = roundMoney(q * l.unit_price)
        base += b
        tax += roundMoney(b * (l.tax_rate ?? 0))
    }
    base = roundMoney(base)
    tax = roundMoney(tax)
    return { base, tax, total: roundMoney(base + tax), goodsLines }
}

/**
 * Relación SAT (c_TipoRelacion) de la NC: 03 «devolución de mercancía» si regresan
 * renglones con producto; 01 «nota de crédito de los documentos relacionados» si es
 * solo ajuste de importe. Misma regla que aplica el backend al proyectar la NC.
 */
export function creditNoteRelation(lines: ReturnableLine[], choices: ReturnChoices): '01' | '03' {
    return lines.some((l) => !!l.product_id && toAmount(choices[l.key]?.quantity) > 0) ? '03' : '01'
}

export interface ReturnValidation {
    errors: Record<string, string>
    form?: string
    valid: boolean
}

export function validateReturnChoices(lines: ReturnableLine[], choices: ReturnChoices, reason?: string, requireReason = true): ReturnValidation {
    const errors: Record<string, string> = {}
    let any = false
    for (const l of lines) {
        const c = choices[l.key]
        const q = c ? toAmount(c.quantity) : 0
        if (q === 0) continue
        if (q < 0) errors[`${l.key}.quantity`] = 'La cantidad no puede ser negativa'
        else if (q > returnableQty(l)) errors[`${l.key}.quantity`] = `Máximo ${returnableQty(l)} por devolver`
        else any = true
        if (c && !RETURN_CONDITION_DESTINATIONS[c.condition]?.includes(c.destination)) {
            errors[`${l.key}.destination`] = 'Ese destino no aplica a la condición elegida'
        }
    }
    let form: string | undefined
    if (!any && Object.keys(errors).length === 0) form = 'Elige al menos un renglón a devolver'
    else if (requireReason && !(reason ?? '').trim()) form = 'Indica el motivo de la devolución'
    return { errors, form, valid: !form && Object.keys(errors).length === 0 }
}

/** Pasos visibles. Sin almacén, «Recibir» es un paso del mismo asistente (PIT-021). */
export type ReturnStep = 'lines' | 'condition' | 'receive' | 'refund'

export function returnSteps(opts: { warehouseConnected: boolean }): ReturnStep[] {
    // Con almacén, la recepción la confirma almacén fuera del asistente: no es paso.
    return opts.warehouseConnected ? ['lines', 'condition', 'refund'] : ['lines', 'condition', 'receive', 'refund']
}

export interface ReturnSubmitPayload {
    reason: string
    notes?: string
    /** true cuando el asistente confirmó la recepción (sin almacén). */
    received: boolean
    lines: { key: string; product_id?: string; quantity: number; condition: ReturnCondition; destination: ReturnStockDestination }[]
    refund: RefundAllocation[]
    /** Presente solo si el reembolso incluye una NC CFDI. */
    credit_note?: { relation: '01' | '03' }
    totals: ReturnTotals
}

/** Única puerta de salida hacia el backend: solo renglones con cantidad > 0. */
export function serializeReturn(args: {
    lines: ReturnableLine[]
    choices: ReturnChoices
    reason: string
    notes?: string
    received: boolean
    refund: RefundAllocation[]
}): ReturnSubmitPayload {
    const lines = args.lines
        .filter((l) => toAmount(args.choices[l.key]?.quantity) > 0)
        .map((l) => {
            const c = args.choices[l.key]
            return { key: l.key, ...(l.product_id ? { product_id: l.product_id } : {}), quantity: toAmount(c.quantity), condition: c.condition, destination: c.destination }
        })
    const notes = (args.notes ?? '').trim()
    return {
        reason: args.reason.trim(),
        ...(notes ? { notes } : {}),
        received: args.received,
        lines,
        refund: args.refund.map((a) => ({ ...a, amount: roundMoney(a.amount) })),
        ...(args.refund.some((a) => a.kind === 'credit_note') ? { credit_note: { relation: creditNoteRelation(args.lines, args.choices) } } : {}),
        totals: computeReturnTotals(args.lines, args.choices),
    }
}

/** Valida el paso de reembolso contra el total de la devolución. */
export function validateReturnRefund(total: number, refund: RefundAllocation[], options?: RefundDestinationOption[]) {
    return validateRefund(total, refund, options)
}

// ---- Estados de la RMA ---------------------------------------------------------
// Borrador → Autorizada → Recibida (total o parcial) → Liquidada → Cerrada, y
// Rechazada o Cancelada con motivo obligatorio (benchmark §8.2).
export type RmaState = 'draft' | 'authorized' | 'received' | 'settled' | 'closed' | 'rejected' | 'cancelled'

export const RMA_TRANSITIONS: Record<RmaState, RmaState[]> = {
    draft: ['authorized', 'rejected', 'cancelled'],
    authorized: ['received', 'rejected', 'cancelled'],
    received: ['settled', 'cancelled'],
    settled: ['closed'],
    closed: [],
    rejected: [],
    cancelled: [],
}

/** Estados a los que se llega con motivo obligatorio. */
export const RMA_REASON_REQUIRED: RmaState[] = ['rejected', 'cancelled']

export function canTransitionRma(from: RmaState, to: RmaState, reason?: string): { ok: boolean; error?: string } {
    if (!RMA_TRANSITIONS[from]?.includes(to)) return { ok: false, error: `No se puede pasar de ${from} a ${to}` }
    if (RMA_REASON_REQUIRED.includes(to) && !(reason ?? '').trim()) return { ok: false, error: 'Indica el motivo' }
    return { ok: true }
}
