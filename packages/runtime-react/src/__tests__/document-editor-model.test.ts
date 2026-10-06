import { describe, expect, it } from 'vitest'
import {
    allocationAmountField,
    allocationIssueMessages,
    allocationPayload,
    creditStatus,
    editorLinesConfig,
    friendlyOptionLabel,
    isEditorLayout,
    linesFromSource,
    localIssues,
    overdueDays,
    partyDefaults,
    partySummaryRows,
    splitEditorFields,
    toOpenDocuments,
} from '../business/document-editor-model'
import { makeLine } from '../business/line-items'
import { allocatePayment, validateAllocation } from '../primitives/allocation'
import type { ActionFieldDef, DocumentFormOpenDocuments } from '../types'

describe('divulgación progresiva (splitEditorFields)', () => {
    const fields: ActionFieldDef[] = [
        { key: 'customer_id', label: 'Cliente', type: 'dynamic_select', required: true },
        { key: 'payment_form', label: 'Forma de pago', type: 'select', required: true, options: [{ value: '03', label: '03 · Transferencia' }] },
        { key: 'method', label: 'Método', type: 'select', defaultValue: 'PUE', options: [{ value: 'PUE', label: 'PUE · Una exhibición' }] },
        { key: 'series', label: 'Serie', type: 'text', section: 'fiscal' },
        { key: 'notes', label: 'Notas', type: 'textarea' },
    ]
    const ext: ActionFieldDef[] = [{ key: 'fiscal_data.uso_cfdi', label: 'Uso CFDI', type: 'select' }]

    it('a la vista: contraparte y lo obligatorio; plegado: extensiones, section fiscal y catálogos con default', () => {
        const g = splitEditorFields(fields, { partyField: 'customer_id', extensionFields: ext })
        expect(g.party?.key).toBe('customer_id')
        expect(g.essential.map((f) => f.key)).toEqual(['payment_form'])
        expect(g.advanced.map((f) => f.key)).toEqual(['method', 'series', 'fiscal_data.uso_cfdi'])
        expect(g.notes.map((f) => f.key)).toEqual(['notes'])
    })

    it('essentialKeys gana (monto del cobro, campo de vínculo del origen)', () => {
        const g = splitEditorFields(fields, { essentialKeys: ['method'] })
        expect(g.essential.map((f) => f.key)).toContain('method')
    })

    it('el código SAT queda como dato secundario', () => {
        expect(friendlyOptionLabel('03 · Transferencia electrónica')).toBe('Transferencia electrónica · 03')
        expect(friendlyOptionLabel('G03 · Gastos en general')).toBe('Gastos en general · G03')
        expect(friendlyOptionLabel('PUE · Pago en una sola exhibición')).toBe('PUE · Pago en una sola exhibición')
        expect(friendlyOptionLabel('Efectivo')).toBe('Efectivo')
    })
})

describe('layout y renglones', () => {
    it('isEditorLayout solo con layout: editor', () => {
        expect(isEditorLayout({ layout: 'editor' })).toBe(true)
        expect(isEditorLayout({ layout: 'wizard' })).toBe(false)
        expect(isEditorLayout({})).toBe(false)
    })
    it('allocation usa `allocations` por defecto; el manifest manda', () => {
        const base = { key: 'p', label: 'P', fields: [] }
        expect(editorLinesConfig({ ...base, lines: { kind: 'allocation' } }, {})?.field).toBe('allocations')
        expect(editorLinesConfig({ ...base, lines: true }, { lines_field: 'items' })?.field).toBe('items')
        expect(editorLinesConfig(base, {})).toBeUndefined()
    })
})

describe('contraparte', () => {
    const customer = { name: 'Llantas SA', currency_code: 'MXN', tax_id: 'XAXX010101000', fiscal_data: { uso_cfdi: 'G03', regimen: '601' } }
    it('copia extensiones con la misma clave y no pisa lo capturado', () => {
        const keys = ['customer_id', 'fiscal_data.uso_cfdi', 'fiscal_data.metodo_pago']
        expect(partyDefaults(customer, keys, {})).toEqual({ 'fiscal_data.uso_cfdi': 'G03', currency_code: 'MXN' })
        expect(partyDefaults(customer, keys, { 'fiscal_data.uso_cfdi': 'S01', currency_code: 'USD' })).toEqual({})
    })
    it('tarjeta: resumen + extensiones con etiqueta legible', () => {
        const rows = partySummaryRows(customer, ['tax_id'], { 'fiscal_data.uso_cfdi': 'Uso CFDI' })
        expect(rows.map((r) => r.key)).toEqual(['tax_id', 'fiscal_data.uso_cfdi', 'fiscal_data.regimen'])
        expect(rows[1].label).toBe('Uso CFDI')
    })
    const cols = { limit: 'credit_limit', balance: 'balance_due', overdue: 'overdue_amount', hold_reason: 'credit_hold_reason' }
    it('crédito: bloquea si el total supera lo disponible, avisa con vencido, null sin columnas', () => {
        expect(creditStatus({ credit_limit: 10000, balance_due: 9000 }, cols, 2000)?.level).toBe('block')
        expect(creditStatus({ credit_limit: 10000, balance_due: 100, overdue_amount: 50 }, cols, 100)?.level).toBe('warn')
        expect(creditStatus({ name: 'x' }, cols, 1)).toBeNull()
    })
})

describe('linesFromSource', () => {
    it('SalesOrderItem: product_name → description y tasa derivada de tax/subtotal', () => {
        const [l] = linesFromSource([{ product_id: 'p1', product_name: 'Llanta 205/55R16', quantity: 4, unit_price: 1500, subtotal: 6000, tax_amount: 960 }])
        expect(l).toMatchObject({ description: 'Llanta 205/55R16', tax_rate: 0.16, quantity: 4, product_id: 'p1' })
    })
    it('map traduce nombres (discount_pct) y la tasa 16 se normaliza a 0.16', () => {
        const [l] = linesFromSource([{ description: 'Balanceo', quantity: 1, unit_price: 100, discount_pct: 10, tax_rate: 16 }], { discount: 'discount_pct' })
        expect(l.discount).toBe(10)
        expect(l.tax_rate).toBe(0.16)
    })
    it('NC (credit): la cantidad queda topada en lo facturado', () => {
        const [l] = linesFromSource([{ description: 'Llanta', quantity: 4, unit_price: 1500, tax_rate: 0.16 }], {}, { kind: 'credit' })
        expect(l.max_quantity).toBe(4)
    })
})

describe('localIssues', () => {
    it('sin renglones es error; precio en cero es aviso; sin ruido por renglón libre', () => {
        expect(localIssues([]).some((i) => i.severity === 'error')).toBe(true)
        const w = localIssues([makeLine({ description: 'Servicio' })])
        expect(w).toEqual([expect.objectContaining({ severity: 'warning', message: 'Renglón 1: precio en cero.' })])
        expect(localIssues([], { requireLines: false })).toEqual([])
    })
})

describe('cobro / REP (allocation)', () => {
    const cfg: DocumentFormOpenDocuments = {
        model: 'customers.Invoice',
        party_field: 'customer_id',
        balance_field: 'amount_due',
        number_field: 'number',
        total_field: 'total',
        due_field: 'due_date',
        issued_field: 'issue_date',
        method_field: 'fiscal_data.metodo_pago',
        line_document_field: 'invoice_id',
        line_amount_field: 'amount',
        option_filter: [{ field: 'status', not_in: ['cancelled'] }],
    }
    const rows = [
        { id: 'a', number: 'A-2', total: 1000, amount_due: 1000, issue_date: '2026-09-01', due_date: '2026-10-01', status: 'open', fiscal_data: { metodo_pago: 'PPD' } },
        { id: 'b', number: 'A-1', total: 500, amount_due: 300, issue_date: '2026-08-01', due_date: '2026-09-01', status: 'open' },
        { id: 'c', number: 'A-0', total: 800, amount_due: 0, issue_date: '2026-07-01', status: 'paid' },
        { id: 'd', number: 'A-9', total: 900, amount_due: 900, issue_date: '2026-07-01', status: 'cancelled' },
    ]

    it('toOpenDocuments: solo con saldo y que pasan el option_filter', () => {
        const docs = toOpenDocuments(rows, cfg, 'MXN')
        expect(docs.map((d) => d.id)).toEqual(['a', 'b'])
        expect(docs[0]).toMatchObject({ number: 'A-2', balance: 1000, total: 1000, due_at: '2026-10-01', payment_method: 'PPD', currency: 'MXN' })
    })

    it('reparte del más vencido y arma el payload con los campos de la acción', () => {
        const docs = toOpenDocuments(rows, cfg, 'MXN')
        const r = allocatePayment(800, docs)
        expect(r.allocations.map((a) => [a.document_id, a.amount])).toEqual([['b', 300], ['a', 500]])
        expect(allocationPayload(r.allocations, cfg)).toEqual([
            { invoice_id: 'b', amount: 300 },
            { invoice_id: 'a', amount: 500 },
        ])
    })

    it('mensajes claros con el número del documento', () => {
        const docs = toOpenDocuments(rows, cfg, 'MXN')
        const issues = validateAllocation(100, 'MXN', docs, [{ document_id: 'b', amount: 400, balance_before: 300, balance_after: 0, installment: 1 }])
        const msgs = allocationIssueMessages(issues, docs).map((m) => m.message)
        expect(msgs).toContain('A-1: Se aplica más que el saldo del documento.')
        expect(msgs).toContain('Lo aplicado supera el monto recibido.')
    })

    it('campo del monto: `amount` o el primer numérico', () => {
        expect(allocationAmountField([{ key: 'x', label: '', type: 'text' }, { key: 'amount', label: '', type: 'number' }])).toBe('amount')
        expect(allocationAmountField([{ key: 'total_paid', label: '', type: 'number' }])).toBe('total_paid')
    })

    it('días de atraso', () => {
        expect(overdueDays({ due_at: '2026-10-01' }, new Date(2026, 9, 6))).toBe(5)
        expect(overdueDays({ due_at: '2026-10-30' }, new Date(2026, 9, 6))).toBe(0)
        expect(overdueDays({ due_at: null })).toBe(0)
    })
})
