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
    sourceLoadSummary,
    sourceTracksRemaining,
    overdueDays,
    partyDefaults,
    partySummaryRows,
    splitEditorFields,
    toOpenDocuments,
} from '../business/document-editor-model'
import { makeLine, serializeLineItems, validateLineItems } from '../business/line-items'
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
        // Un tipo con «Cargar desde…» usa el editor salvo wizard explícito.
        const src = [{ key: 'sale', label: 'Venta', model: 'customers.SalesOrder', lines: 'items' }]
        expect(isEditorLayout({ sources: src })).toBe(true)
        expect(isEditorLayout({ layout: 'wizard', sources: src })).toBe(false)
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
    it('carga parcial: el descuento en importe se prorratea a lo pendiente (no supera el importe)', () => {
        // Cotización 4 llantas × $1,000 con $400 de descuento; 3 ya facturadas.
        const rows = [{ id: 'q1', description: 'Llanta', quantity: 4, unit_price: 1000, discount_amount: 400, tax_rate: 16, source_quantity: 4, remaining_quantity: 1 }]
        const [l] = linesFromSource(rows, { discount: 'discount_amount' }, { discountMode: 'amount' })
        expect(l).toMatchObject({ quantity: 1, max_quantity: 1, discount: 100, discount_kind: 'amount' })
        expect(validateLineItems([l]).errors).toEqual({})
        // Sin lo pendiente servido (o completo) el importe queda intacto.
        const [full] = linesFromSource([{ ...rows[0], remaining_quantity: 4 }], { discount: 'discount_amount' }, { discountMode: 'amount' })
        expect(full.discount).toBe(400)
        // Un porcentaje no depende de la cantidad.
        const [pct] = linesFromSource([{ ...rows[0], discount_pct: 10 }], { discount: 'discount_pct' })
        expect(pct.discount).toBe(10)
    })
    it('NC (credit): la cantidad queda topada en lo facturado', () => {
        const [l] = linesFromSource([{ description: 'Llanta', quantity: 4, unit_price: 1500, tax_rate: 0.16 }], {}, { kind: 'credit' })
        expect(l.max_quantity).toBe(4)
    })
})

describe('linesFromSource — renglón de origen sin descripción (retest Pitsline r5)', () => {
    it('InvoiceItem solo trae el producto: se nombra con su etiqueta y conserva el id', () => {
        const [l] = linesFromSource(
            [{ id: 'it-1', product_id: { value: 'p1', label: 'EVERLAND 205/55R16' }, quantity: 1, unit_price: 710, subtotal: 710, tax_amount: 113.6 }],
            {},
            { kind: 'credit' },
        )
        expect(l.product_id).toBe('p1')
        expect(l.description).toBe('EVERLAND 205/55R16')
        expect(l.quantity).toBe(1)
        expect(l.max_quantity).toBe(1)
        expect(l.tax_rate).toBe(0.16)
        expect(l.source_line_id).toBe('it-1')
    })
    it('con la relación resuelta como objeto hermano `product`', () => {
        const [l] = linesFromSource([{ id: 'it-1', product_id: 'p1', product: { id: 'p1', name: 'Balanceo' }, quantity: 2, unit_price: 100 }])
        expect(l.product_id).toBe('p1')
        expect(l.description).toBe('Balanceo')
    })
})

describe('localIssues', () => {
    it('un renglón con producto y sin texto no bloquea el guardado; uno libre sin texto sí', () => {
        expect(localIssues([makeLine({ product_id: 'p1', description: '', unit_price: 10 })]).filter((i) => i.severity === 'error')).toEqual([])
        expect(localIssues([makeLine({ description: '', unit_price: 10 })])).toEqual([
            expect.objectContaining({ severity: 'error', message: 'Renglón 1: elige un producto o escribe la descripción.' }),
        ])
    })
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

describe('linesFromSource con lo pendiente («crear desde»)', () => {
    it('la cantidad sugerida y el tope son remaining_quantity; lo ya cubierto se omite; guarda el renglón origen', () => {
        const rows = [
            { id: 'a', source_line_id: 'a', product_id: 'p1', product_name: 'Llanta', quantity: 4, remaining_quantity: 1, unit_price: 1500, discount: 5, tax_rate: 0.16 },
            { id: 'b', source_line_id: 'b', product_name: 'Balanceo', quantity: 2, remaining_quantity: 0, unit_price: 100 },
        ]
        const lines = linesFromSource(rows, { description: 'product_name' })
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ product_id: 'p1', description: 'Llanta', quantity: 1, max_quantity: 1, unit_price: 1500, discount: 5, tax_rate: 0.16, source_line_id: 'a' })
        expect(sourceLoadSummary(rows)).toEqual({ loaded: 1, covered: 1 })
    })
    it('sin remaining_quantity conserva la cantidad del origen y usa su id como vínculo', () => {
        const [l] = linesFromSource([{ id: 'x', description: 'Servicio', quantity: 3, unit_price: 10 }])
        expect(l.quantity).toBe(3)
        expect(l.max_quantity).toBeUndefined()
        expect(l.source_line_id).toBe('x')
    })
    it('localIssues marca la cantidad que excede lo pendiente', () => {
        const l = { ...makeLine({ description: 'Llanta', quantity: 3, unit_price: 10 }), max_quantity: 2 }
        expect(localIssues([l]).some((i) => i.severity === 'error' && i.message.includes('excede lo pendiente'))).toBe(true)
    })
    it('sourceTracksRemaining: solo con line_link_field, remaining_qty_field o remaining_endpoint', () => {
        expect(sourceTracksRemaining({ line_link_field: 'sales_order_item_id' })).toBe(true)
        expect(sourceTracksRemaining({ remaining_endpoint: '/x' })).toBe(true)
        expect(sourceTracksRemaining({})).toBe(false)
    })
})


describe('serializeLineItems con vínculo al renglón origen', () => {
    it('escribe source_line_id en la columna line_link_field y no en renglones libres', () => {
        const linked = { ...makeLine({ description: 'Llanta', quantity: 1, unit_price: 10 }), source_line_id: 'soi-1' }
        const free = makeLine({ description: 'Flete', quantity: 1, unit_price: 50 })
        const [a, b] = serializeLineItems([linked, free], { sourceLineField: 'sales_order_item_id' })
        expect(a.sales_order_item_id).toBe('soi-1')
        expect(b.sales_order_item_id).toBeUndefined()
        expect(serializeLineItems([linked])[0].sales_order_item_id).toBeUndefined()
    })
    it('lleva subtotal e impuesto calculados (modelos de renglón sin tasa)', () => {
        const l = { ...makeLine({ description: 'Llanta', quantity: 2, unit_price: 100, discount: 20, tax_rate: 0.16 }), discount_kind: 'amount' as const }
        expect(serializeLineItems([l])[0]).toMatchObject({ subtotal: 180, tax_amount: 28.8, discount: 20, discount_kind: 'amount' })
    })
    it('linesFromSource con discount_mode amount conserva el descuento como importe', () => {
        const [l] = linesFromSource([{ id: 'a', quantity: 2, unit_price: 100, discount: 20, remaining_quantity: 2 }], {}, { discountMode: 'amount' })
        expect(l.discount_kind).toBe('amount')
    })
})
