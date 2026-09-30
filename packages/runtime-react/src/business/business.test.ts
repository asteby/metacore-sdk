import { describe, expect, it } from 'vitest'
import { createFormatter, formatDate, formatDateTime, formatMoney, roundMoney, toAmount } from './format'
import { mapApiError } from './field-errors'
import {
    computeTotals,
    makeLine,
    parseLineItems,
    serializeLineItems,
    validateLineItems,
} from './line-items'
import { newTender, serializePayment, summarizePayment, validatePayment, type PaymentMethodOption } from './payment'
import { singleDestination, validateRefund } from './refund'
import { parseProductQuery, parseTireSize, productToLine } from './product-search'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('format', () => {
    it('formatea moneda es-MX con símbolo corto y sin mezclar locale (PIT-023)', () => {
        expect(nbsp(formatMoney(1060, { currency: 'MXN' }))).toBe('$1,060.00')
        expect(nbsp(formatMoney(1.06, { currency: 'MXN' }))).toBe('$1.06')
        expect(formatMoney('abc')).toBe('$0.00')
        expect(formatMoney(NaN)).toBe('')
    })
    it('usa la moneda dada, con USD solo como último recurso', () => {
        expect(nbsp(formatMoney(5, { currency: 'EUR' }))).toContain('€')
        expect(nbsp(formatMoney(5))).toBe('US$5.00'.replace('US', ''))
    })
    it('una fecha de calendario no retrocede un día (PIT-025)', () => {
        expect(formatDate('2026-09-29', { timeZone: 'America/Mexico_City' })).toContain('29')
        expect(formatDateTime('2026-09-29T02:00:00Z', { timeZone: 'America/Mexico_City' })).toContain('28')
    })
    it('createFormatter fija locale, moneda y zona', () => {
        const f = createFormatter({ currency: 'MXN', timeZone: 'America/Mexico_City' })
        expect(nbsp(f.money(10))).toBe('$10.00')
        expect(f.locale).toBe('es-MX')
    })
    it('roundMoney y toAmount', () => {
        expect(roundMoney(1.005)).toBe(1.01)
        expect(toAmount('$1,234.50')).toBe(1234.5)
        expect(toAmount('1.234,50')).toBe(1234.5)
    })
})

describe('mapApiError', () => {
    const axiosErr = (status: number, data: unknown) => ({ response: { status, data } })
    it('422 con errors → mensajes por campo', () => {
        const m = mapApiError(axiosErr(422, { errors: { sku: [{ code: 'duplicate' }] } }), { labels: { sku: 'SKU' } })
        expect(m.hasFieldErrors).toBe(true)
        expect(m.fields.sku).toContain('SKU')
    })
    it('409 duplicado que nombra el campo → error del campo', () => {
        const m = mapApiError(axiosErr(409, { message: 'conflict', details: 'Key (sku)=(A1) already exists' }), {
            knownFields: ['sku', 'name'],
            labels: { sku: 'SKU' },
        })
        expect(m.status).toBe(409)
        expect(m.fields.sku).toBe('Ya existe un registro con ese SKU')
    })
    it('409 sin campo → banner general', () => {
        const m = mapApiError(axiosErr(409, { message: 'Estado inválido' }))
        expect(m.hasFieldErrors).toBe(false)
        expect(m.form).toBe('Estado inválido')
    })
    it('red caída → fallback', () => {
        expect(mapApiError(new Error('Network Error'), { fallback: 'Falló' }).form).toContain('Falló')
    })
})

describe('line items', () => {
    it('calcula totales con descuento e impuesto', () => {
        const lines = [makeLine({ quantity: 2, unit_price: 100, discount: 10, tax_rate: 0.16 }), makeLine({ kind: 'section', description: 'Mano de obra' })]
        expect(computeTotals(lines)).toMatchObject({ subtotal: 200, discount: 20, tax: 28.8, total: 208.8, units: 2 })
    })
    it('valida negativos, descuento y sobreventa según política', () => {
        const l = makeLine({ description: 'x', quantity: -1, unit_price: -5, discount: 120 })
        const v = validateLineItems([l])
        expect(v.valid).toBe(false)
        expect(Object.keys(v.errors)).toEqual(expect.arrayContaining(['0.quantity', '0.unit_price', '0.discount']))
        const over = makeLine({ description: 'x', quantity: 5, available: 2 })
        expect(validateLineItems([over], { stockPolicy: 'warn' })).toMatchObject({ valid: true })
        expect(validateLineItems([over], { stockPolicy: 'warn' }).warnings['0.quantity']).toBeTruthy()
        expect(validateLineItems([over], { stockPolicy: 'block' }).valid).toBe(false)
        expect(validateLineItems([over], { stockPolicy: 'allow' }).warnings).toEqual({})
    })
    it('exige al menos un renglón', () => {
        expect(validateLineItems([]).form).toBeTruthy()
        expect(validateLineItems([], { requireItems: false }).valid).toBe(true)
    })
    it('serializa sin cadenas vacías ni claves de UI y round-trip (PIT-018)', () => {
        const out = serializeLineItems([
            makeLine({ description: ' Llanta ', quantity: '2' as unknown as number, unit_price: '' as unknown as number, sku: '', lot: ' L1 ' }),
            makeLine({ kind: 'note', description: 'Nota' }),
        ])
        expect(out[0]).toEqual({ position: 1, kind: 'item', description: 'Llanta', quantity: 2, unit_price: 0, discount: 0, tax_rate: 0, lot: 'L1' })
        expect(out[1]).toEqual({ position: 2, kind: 'note', description: 'Nota' })
        expect(out[0]).not.toHaveProperty('key')
        expect(parseLineItems(out)).toHaveLength(2)
    })
})

describe('payment', () => {
    const methods: PaymentMethodOption[] = [
        { id: 'cash', label: 'Efectivo', cash: true },
        { id: 'card', label: 'Tarjeta', requiresReference: true },
    ]
    it('cambio solo sobre efectivo', () => {
        const s = summarizePayment(100, [newTender('cash', 150)], methods)
        expect(s).toMatchObject({ paid: 150, change: 50, remaining: 0, overpaid: 0, settled: true })
        const o = summarizePayment(100, [newTender('card', 130)], methods)
        expect(o).toMatchObject({ change: 0, overpaid: 30 })
    })
    it('mixto: la tarjeta pide referencia y no se puede exceder', () => {
        const t = [newTender('cash', 40), newTender('card', 60)]
        const v = validatePayment(100, t, methods)
        expect(v.errors['1.reference']).toBeTruthy()
        t[1]!.reference = 'AUTH1'
        expect(validatePayment(100, t, methods).valid).toBe(true)
        expect(validatePayment(100, [newTender('card', 130)], methods).form).toMatch(/efectivo/)
    })
    it('parcial solo con política', () => {
        const t = [newTender('cash', 30)]
        expect(validatePayment(100, t, methods).valid).toBe(false)
        expect(validatePayment(100, t, methods, { allowPartial: true }).valid).toBe(true)
        expect(serializePayment(t, methods, 100)).toMatchObject({ paid: 30, remaining: 70, change: 0 })
    })
})

describe('refund', () => {
    it('un destino cubre todo', () => {
        expect(validateRefund(100, singleDestination('cash', 100)).valid).toBe(true)
    })
    it('respeta topes, no repite destino y exige cuadrar', () => {
        const opts = [
            { kind: 'card' as const, label: 'Tarjeta', maxAmount: 60 },
            { kind: 'cash' as const, label: 'Efectivo' },
            { kind: 'credit_note' as const, label: 'NC', available: false, disabledReason: 'Sin CFDI' },
        ]
        expect(validateRefund(100, [{ kind: 'card', amount: 80 }], opts).errors['0.amount']).toBeTruthy()
        expect(validateRefund(100, [{ kind: 'card', amount: 60 }, { kind: 'cash', amount: 40 }], opts).valid).toBe(true)
        expect(validateRefund(100, [{ kind: 'card', amount: 60 }], opts).form).toMatch(/Falta/)
        expect(validateRefund(100, [{ kind: 'credit_note', amount: 100 }], opts).errors['0.kind']).toBe('Sin CFDI')
    })
})

describe('product search', () => {
    it('clasifica medida, código de barras, y texto', () => {
        expect(parseTireSize('205/55R16')?.normalized).toBe('205/55R16')
        expect(parseTireSize('205 55 16')?.normalized).toBe('205/55R16')
        expect(parseTireSize('225-45-ZR17')?.normalized).toBe('225/45R17')
        expect(parseTireSize('999/99R99')).toBeNull()
        expect(parseProductQuery('7501234567890')).toMatchObject({ kind: 'barcode' })
        expect(parseProductQuery('205/55R16')).toMatchObject({ kind: 'tire_size' })
        expect(parseProductQuery('  ')).toMatchObject({ kind: 'empty' })
        expect(parseProductQuery('michelin')).toMatchObject({ kind: 'text', text: 'michelin' })
    })
    it('producto + variante → renglón con existencia por almacén', () => {
        const line = productToLine(
            { id: 'p1', name: 'Llanta X', price: 1000, tax_rate: 0.16, variants: [] },
            { id: 'v1', label: '205/55R16', price: 1200, stock: [{ warehouse_id: 'a', available: 3 }, { warehouse_id: 'b', available: 9 }] },
            { warehouseId: 'a' },
        )
        expect(line).toMatchObject({ product_id: 'v1', unit_price: 1200, tax_rate: 0.16, available: 3, description: 'Llanta X · 205/55R16' })
    })
})

import { canTransitionRma, computeReturnTotals, creditNoteRelation, returnSteps, serializeReturn, validateReturnChoices, type ReturnableLine } from './return'

describe('return', () => {
    const lines: ReturnableLine[] = [
        { key: 'a', product_id: 'p1', description: 'Llanta', sold: 4, alreadyReturned: 1, unit_price: 1000, tax_rate: 0.16 },
        { key: 'b', description: 'Servicio', sold: 1, unit_price: 200 },
    ]
    const ch = (q: number) => ({ a: { quantity: q, condition: 'sellable' as const, destination: 'stock' as const } })
    it('tope por devolver = vendido − ya devuelto', () => {
        expect(validateReturnChoices(lines, ch(4), 'x').errors['a.quantity']).toBeTruthy()
        expect(validateReturnChoices(lines, ch(3), 'x').valid).toBe(true)
    })
    it('exige renglón y motivo; destino coherente con la condición', () => {
        expect(validateReturnChoices(lines, {}, 'x').valid).toBe(false)
        expect(validateReturnChoices(lines, ch(1), '').valid).toBe(false)
        const bad = { a: { quantity: 1, condition: 'sellable' as const, destination: 'scrap' as const } }
        expect(validateReturnChoices(lines, bad, 'x').errors['a.destination']).toBeTruthy()
    })
    it('totales con IVA y relación 03/01', () => {
        expect(computeReturnTotals(lines, ch(2)).total).toBe(2320)
        expect(creditNoteRelation(lines, ch(2))).toBe('03')
        expect(creditNoteRelation(lines, { b: { quantity: 1, condition: 'sellable', destination: 'stock' } })).toBe('01')
    })
    it('sin almacén, Recibir es un paso; con almacén no', () => {
        expect(returnSteps({ warehouseConnected: false })).toContain('receive')
        expect(returnSteps({ warehouseConnected: true })).not.toContain('receive')
    })
    it('serializeReturn omite renglones en 0 y añade NC solo si hay reembolso a NC', () => {
        const p = serializeReturn({ lines, choices: ch(2), reason: ' defecto ', received: true, refund: [{ kind: 'credit_note', amount: 2320 }] })
        expect(p.lines).toHaveLength(1)
        expect(p.reason).toBe('defecto')
        expect(p.credit_note).toEqual({ relation: '03' })
        expect(serializeReturn({ lines, choices: ch(2), reason: 'x', received: true, refund: [{ kind: 'cash', amount: 2320 }] }).credit_note).toBeUndefined()
    })
})

describe('rma states', () => {
    it('flujo feliz y motivo obligatorio al rechazar/cancelar', () => {
        expect(canTransitionRma('draft', 'authorized').ok).toBe(true)
        expect(canTransitionRma('received', 'settled').ok).toBe(true)
        expect(canTransitionRma('authorized', 'rejected').ok).toBe(false)
        expect(canTransitionRma('authorized', 'rejected', 'no aplica').ok).toBe(true)
        expect(canTransitionRma('closed', 'draft').ok).toBe(false)
    })
})
