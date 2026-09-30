// Cobro mixto (POS/Caja, Apartado, Cobranza, Factura «Registrar pago», OT).
// Lógica pura de <PaymentCapture>: resumen (pagado/pendiente/cambio) y validación.
import { roundMoney, toAmount } from './format'

/** Método de pago configurable por org (el catálogo NO se hardcodea en el SDK). */
export interface PaymentMethodOption {
    id: string
    label: string
    /** Efectivo: admite recibir de más y devolver cambio. */
    cash?: boolean
    requiresReference?: boolean
    requiresAccount?: boolean
    /** Tope por método (saldo de cuenta de cliente, monedero). */
    maxAmount?: number
    /** Cuentas/cajas destino elegibles (requiresAccount). */
    accounts?: Array<{ id: string; label: string }>
}

export interface PaymentTender {
    key: string
    method: string
    amount: number
    reference?: string
    account_id?: string
}

export interface PaymentSummary {
    total: number
    paid: number
    /** Lo que falta por cobrar (>= 0). */
    remaining: number
    /** Cambio a entregar: exceso cubierto por efectivo (>= 0). */
    change: number
    /** Exceso en métodos no-efectivo (no se puede devolver): error. */
    overpaid: number
    settled: boolean
}

let seq = 0
export function newTender(method: string, amount = 0): PaymentTender {
    seq += 1
    return { key: `pt_${Date.now().toString(36)}_${seq}`, method, amount }
}

export function summarizePayment(
    total: number,
    tenders: PaymentTender[],
    methods: PaymentMethodOption[],
): PaymentSummary {
    const byId = new Map(methods.map((m) => [m.id, m]))
    let paid = 0
    let cash = 0
    for (const t of tenders) {
        const a = Math.max(0, toAmount(t.amount))
        paid += a
        if (byId.get(t.method)?.cash) cash += a
    }
    paid = roundMoney(paid)
    const tot = roundMoney(total)
    const excess = roundMoney(Math.max(0, paid - tot))
    const change = roundMoney(Math.min(excess, cash))
    return {
        total: tot,
        paid,
        remaining: roundMoney(Math.max(0, tot - paid)),
        change,
        overpaid: roundMoney(excess - change),
        settled: paid >= tot,
    }
}

export interface PaymentValidation {
    /** Errores por renglón de pago `"<índice>.<campo>"`. */
    errors: Record<string, string>
    /** Error general. */
    form?: string
    valid: boolean
}

export interface PaymentPolicy {
    /** Permite cobro parcial (anticipo/abono). Default false. */
    allowPartial?: boolean
}

export function validatePayment(
    total: number,
    tenders: PaymentTender[],
    methods: PaymentMethodOption[],
    policy: PaymentPolicy = {},
): PaymentValidation {
    const byId = new Map(methods.map((m) => [m.id, m]))
    const errors: Record<string, string> = {}
    tenders.forEach((t, i) => {
        const m = byId.get(t.method)
        const a = toAmount(t.amount)
        if (!m) errors[`${i}.method`] = 'Método de pago no disponible'
        if (a <= 0) errors[`${i}.amount`] = 'Captura un monto mayor a cero'
        if (m?.maxAmount != null && a > m.maxAmount) errors[`${i}.amount`] = `El máximo para ${m.label} es ${m.maxAmount}`
        if (m?.requiresReference && !t.reference?.trim()) errors[`${i}.reference`] = 'La referencia es obligatoria'
        if (m?.requiresAccount && !t.account_id) errors[`${i}.account_id`] = 'Elige la cuenta'
    })
    const s = summarizePayment(total, tenders, methods)
    let form: string | undefined
    if (tenders.length === 0) form = 'Agrega al menos un pago'
    else if (s.overpaid > 0) form = 'Solo el efectivo puede exceder el total (se devuelve como cambio)'
    else if (!policy.allowPartial && !s.settled) form = 'El pago no cubre el total'
    return { errors, form, valid: !form && Object.keys(errors).length === 0 }
}

/** Payload hacia el backend: montos reales; el cambio no es un pago. */
export function serializePayment(tenders: PaymentTender[], methods: PaymentMethodOption[], total: number) {
    const s = summarizePayment(total, tenders, methods)
    return {
        payments: tenders.map((t) => ({
            method: t.method,
            // Monto entregado por el cliente; el cambio va aparte en `change`.
            amount: roundMoney(toAmount(t.amount)),
            ...(t.reference?.trim() ? { reference: t.reference.trim() } : {}),
            ...(t.account_id ? { account_id: t.account_id } : {}),
        })),
        paid: s.paid,
        change: s.change,
        remaining: s.remaining,
    }
}
