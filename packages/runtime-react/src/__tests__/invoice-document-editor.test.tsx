// @vitest-environment happy-dom
// Facturas → Crear (P0 UX Acxel, 2026-10-06): el tipo factura con
// `layout: "editor"` abre el DocumentEditor a pantalla completa, no el wizard
// «Datos → Siguiente». A la vista solo cliente (con su tarjeta fiscal), método
// y forma de pago, renglones y totales; lo demás en «Opciones fiscales»
// plegada, una sola acción primaria y la vista previa plegada. «Cargar desde»
// OT de taller y cotización precarga lo que queda por facturar.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const dict: Record<string, string> = { 'customers.field.tax_id': 'RFC' }
    const t = (k: string, o?: Record<string, any>) => {
        let s: string = dict[k] ?? o?.defaultValue ?? k
        for (const [key, v] of Object.entries(o ?? {})) s = s.replace(`{{${key}}}`, String(v))
        return s
    }
    const value = { t, i18n }
    return { useTranslation: () => value }
})

import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import { TaxRateContext } from '../org-runtime-context'
import { linesFromSource, splitEditorFields } from '../business/document-editor-model'
import type { DocumentFormsManifest, DocumentFormType } from '../types'

afterEach(cleanup)

// Espejo del tipo `invoice` de customers.Invoice (addons, manifest.json).
const invoice: DocumentFormType = {
    key: 'invoice',
    label: 'Factura',
    value: 'I',
    layout: 'editor',
    party: {
        field: 'customer_id',
        model: 'customers.Customer',
        summary: ['tax_id', 'fiscal_data.regimen_receptor', 'fiscal_data.codigo_postal', 'fiscal_data.uso_cfdi'],
        credit: { limit: 'credit_limit', balance: 'balance_due', overdue: 'overdue_amount', hold_reason: 'credit_hold_reason' },
    },
    fields: [
        { key: 'customer_id', label: 'Cliente', type: 'text', required: true },
        { key: 'invoice_date', label: 'Fecha de emisión', type: 'date', required: true, defaultValue: '$today' },
        { key: 'due_date', label: 'Vencimiento', type: 'date' },
        { key: 'currency_code', label: 'Moneda', type: 'select', defaultValue: 'MXN', options: [{ value: 'MXN', label: 'Peso mexicano · MXN' }, { value: 'USD', label: 'Dólar · USD' }] },
        { key: 'fiscal_data.metodo_pago', label: 'Método de pago', type: 'select', required: true, defaultValue: 'PUE', options: [{ value: 'PUE', label: 'Pago en una sola exhibición · PUE' }, { value: 'PPD', label: 'Pago en parcialidades o diferido · PPD' }] },
        { key: 'fiscal_data.forma_pago', label: 'Forma de pago', type: 'select', required: true, defaultValue: '01', options: [{ value: '01', label: 'Efectivo · 01' }, { value: '03', label: 'Transferencia electrónica · 03' }] },
        { key: 'notes', label: 'Notas', type: 'textarea' },
    ],
    lines: { columns: ['discount', 'tax'], discount_mode: 'amount', title: 'Renglones' },
    sources: [
        { key: 'sales_order', label: 'Venta', model: 'customers.SalesOrder', lines: 'items', map: { description: 'product_name' }, header: { customer_id: 'customer_id' }, link_field: 'sales_order_id', line_link_field: 'sales_order_item_id', exclude_states: ['cancelled', 'void'] },
        { key: 'work_order', label: 'Orden de trabajo', model: 'workshop.WorkOrder', lines: 'items', header: { customer_id: 'customer_id' }, link_field: 'work_order_id', line_link_field: 'work_order_item_id', exclude_states: ['cancelled', 'void'] },
        { key: 'quote', label: 'Cotización', model: 'quotes.Quote', lines: 'items', map: { discount: 'discount_amount' }, header: { customer_id: 'customer_id', currency_code: 'currency_code' }, link_field: 'quote_id', line_link_field: 'quote_item_id', exclude_states: ['cancelled', 'void'] },
    ],
    submit_label: 'Crear factura',
}
const forms: DocumentFormsManifest = { lines_field: 'items', types: [invoice] }

const customer = {
    id: 'c-1',
    name: 'Transportes del Bajío',
    tax_id: 'TBA850312KJ9',
    credit_limit: 100000,
    balance_due: 15750,
    fiscal_data: { regimen_receptor: '601', codigo_postal: '37000', uso_cfdi: 'G03' },
}

// Lo pendiente lo sirve el runtime (kernel source-lines): cantidad − lo ya facturado.
const workOrderLines = {
    data: [
        { id: 'woi-1', source_line_id: 'woi-1', kind: 'labor', description: 'Alineación eje direccional', quantity: 1, remaining_quantity: 1, unit_price: 650 },
        { id: 'woi-2', source_line_id: 'woi-2', kind: 'part', product_id: 'p-valv', description: 'Válvula de alta presión', quantity: 6, remaining_quantity: 2, unit_price: 95 },
        { id: 'woi-3', source_line_id: 'woi-3', kind: 'labor', description: 'Montaje y balanceo', quantity: 6, remaining_quantity: 0, unit_price: 180 },
    ],
}
const quoteLines = {
    data: [
        { id: 'qi-1', source_line_id: 'qi-1', product_id: 'p-llanta', description: 'Llanta 295/80R22.5', quantity: 6, remaining_quantity: 4, unit_price: 5890, discount_amount: 1200, tax_rate: 0.16, tax_amount: 5462.4, subtotal: 34140 },
    ],
}

function makeApi(sourceLines: Record<string, unknown> = {}, post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'inv-1' } } })) {
    const get = vi.fn(async (url: string, cfg?: { params?: Record<string, any> }) => {
        if (url === '/metadata/modal/customers.Customer') {
            return { data: { data: { fields: [{ key: 'tax_id', label: 'customers.field.tax_id' }, { key: 'fiscal_data.regimen_receptor', label: 'Régimen fiscal' }, { key: 'fiscal_data.codigo_postal', label: 'CP fiscal' }, { key: 'fiscal_data.uso_cfdi', label: 'Uso CFDI' }] } } }
        }
        if (url === '/data/customers.Customer') return { data: { data: [customer] } }
        if (url.endsWith('/source-lines')) return { data: sourceLines[cfg?.params?.source] ?? { data: [] } }
        if (url === '/data/workshop.WorkOrder') return { data: { data: [{ id: 'wo-1', customer_id: 'c-1' }] } }
        if (url === '/data/quotes.Quote') return { data: { data: [{ id: 'q-1', customer_id: 'c-1', currency_code: 'MXN' }] } }
        return { data: { data: [] } }
    })
    const client = { get, post, put: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'inv-1' } } }), delete: vi.fn() }
    return { client: client as unknown as ApiClient, get, post }
}

function renderInvoice(api: ReturnType<typeof makeApi>, initialSource?: { key: string; id: string }) {
    return render(
        <ApiProvider client={api.client}>
            <TaxRateContext.Provider value={0.16}>
                <DocumentFormDialog
                    open
                    onOpenChange={() => {}}
                    model="customers.Invoice"
                    forms={forms}
                    initialType={initialSource ? 'invoice' : undefined}
                    initialSource={initialSource}
                    currency="MXN"
                />
            </TaxRateContext.Provider>
        </ApiProvider>,
    )
}

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`) as HTMLElement

describe('Factura con layout editor — pantalla única', () => {
    it('abre el DocumentEditor a pantalla completa, no el wizard', () => {
        renderInvoice(makeApi())
        const dialog = slot('document-editor-dialog')
        expect(dialog.getAttribute('data-fullscreen')).toBe('true')
        expect(dialog.style.height).toBe('calc(100dvh - 2rem)')
        expect(slot('document-editor').getAttribute('data-layout')).toBe('fullscreen')
        expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
        expect(document.querySelector('[data-slot="document-form-dialog"]')).toBeNull()
    })

    it('secciones: lo esencial a la vista, «Opciones fiscales» plegada, totales y vista previa al lado', () => {
        renderInvoice(makeApi())
        const main = slot('editor-main')
        const essentials = within(slot('editor-essentials'))
        for (const label of ['Cliente', 'Fecha de emisión', 'Vencimiento', 'Método de pago', 'Forma de pago']) {
            expect(essentials.getByText(label)).toBeTruthy()
        }
        // Etiqueta clara con el código SAT como dato secundario.
        expect(screen.getAllByText('Pago en una sola exhibición · PUE').length).toBeGreaterThan(0)
        expect(within(main).getByText('Cargar desde…')).toBeTruthy()
        expect(within(main).getByText('Renglones')).toBeTruthy()

        const toggle = screen.getByRole('button', { name: /Opciones fiscales/ })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
        expect(panel.hidden).toBe(true)
        expect(within(panel).getByText('Moneda')).toBeTruthy()
        expect(essentials.queryByText('Moneda')).toBeNull()

        const aside = within(slot('editor-aside'))
        const totals = slot('editor-aside').querySelector(':scope > div > [data-slot="totals"]') as HTMLElement
        expect(within(totals).getByText('Total')).toBeTruthy()
        const preview = aside.getByRole('button', { name: /Vista previa/ })
        expect(preview.getAttribute('aria-expanded')).toBe('false')
    })

    it('una sola acción primaria: «Crear factura»', () => {
        renderInvoice(makeApi())
        const primaries = document.querySelectorAll('[data-slot="document-editor"] [data-primary="true"]')
        expect(primaries.length).toBe(1)
        expect(primaries[0].textContent).toBe('Crear factura')
    })

    it('«Cargar desde» ofrece venta, OT y cotización como opciones', () => {
        renderInvoice(makeApi())
        const group = screen.getByRole('radiogroup', { name: 'Documento de origen' })
        expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Venta', 'Orden de trabajo', 'Cotización'])
        fireEvent.click(within(group).getByRole('radio', { name: 'Orden de trabajo' }))
        expect(within(group).getByRole('radio', { name: 'Orden de trabajo' }).getAttribute('aria-checked')).toBe('true')
        expect(document.querySelector('[data-source="work_order"]')).toBeTruthy()
    })
})

describe('Factura — «Cargar desde» OT y cotización con lo restante', () => {
    it('OT: cliente, renglones con lo pendiente (omite lo ya facturado), IVA de la org y vínculos', async () => {
        const api = makeApi({ work_order: workOrderLines })
        renderInvoice(api, { key: 'work_order', id: 'wo-1' })
        await screen.findByDisplayValue('Válvula de alta presión')
        expect(screen.getByDisplayValue('Alineación eje direccional')).toBeTruthy()
        expect(screen.queryByDisplayValue('Montaje y balanceo')).toBeNull()
        expect(api.get).toHaveBeenCalledWith('/dynamic/customers.Invoice/source-lines', { params: { source: 'work_order', id: 'wo-1' } })
        expect(await screen.findByText('2 renglones con lo que falta · 1 ya completos (omitidos)')).toBeTruthy()

        // La tarjeta del cliente: datos fiscales con etiquetas del modelo.
        await waitFor(() => expect(slot('party-card')).toBeTruthy())
        const card = slot('party-card')
        expect(within(card).getByText('Transportes del Bajío')).toBeTruthy()
        expect(within(card).getByText('RFC')).toBeTruthy()
        expect(within(card).getByText('TBA850312KJ9')).toBeTruthy()
        expect(within(card).getByText('Uso CFDI')).toBeTruthy()
        expect(within(card).getByText('G03')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Crear factura' }))
        await waitFor(() => expect(api.post).toHaveBeenCalled())
        const [url, body] = api.post.mock.calls[0] as [string, any]
        expect(url).toBe('/dynamic/customers.Invoice')
        expect(body.customer_id).toBe('c-1')
        expect(body.work_order_id).toBe('wo-1')
        expect(body['fiscal_data.metodo_pago']).toBe('PUE')
        expect(body['fiscal_data.forma_pago']).toBe('01')
        expect(body.items).toEqual([
            expect.objectContaining({ description: 'Alineación eje direccional', quantity: 1, unit_price: 650, tax_rate: 0.16, work_order_item_id: 'woi-1' }),
            expect.objectContaining({ product_id: 'p-valv', quantity: 2, unit_price: 95, tax_rate: 0.16, work_order_item_id: 'woi-2' }),
        ])
    })

    it('cotización: lo pendiente, su IVA y descuento, moneda y vínculo', async () => {
        const api = makeApi({ quote: quoteLines })
        renderInvoice(api, { key: 'quote', id: 'q-1' })
        await screen.findByDisplayValue('Llanta 295/80R22.5')
        fireEvent.click(screen.getByRole('button', { name: 'Crear factura' }))
        await waitFor(() => expect(api.post).toHaveBeenCalled())
        const [, body] = api.post.mock.calls[0] as [string, any]
        expect(body.quote_id).toBe('q-1')
        expect(body.currency_code).toBe('MXN')
        // El descuento ($1,200 de las 6 piezas) se prorratea a las 4 pendientes.
        expect(body.items).toEqual([
            expect.objectContaining({ product_id: 'p-llanta', quantity: 4, unit_price: 5890, discount: 800, tax_rate: 0.16, quote_item_id: 'qi-1' }),
        ])
        expect(body.items[0]).not.toHaveProperty('work_order_item_id')
    })

    it('exceso: la cantidad no pasa de lo pendiente y el rechazo del servidor se muestra inline', async () => {
        const post = vi.fn().mockRejectedValue({
            response: {
                status: 422,
                data: {
                    success: false,
                    message: 'validation failed',
                    errors: { 'items.1.quantity': [{ code: 'exceeds_remaining', message: 'Renglón 2: la cantidad 2 excede lo pendiente de «Orden de trabajo» (1). Ajusta la cantidad; lo demás ya está registrado en otro documento.' }] },
                },
            },
        })
        const api = makeApi({ work_order: workOrderLines }, post)
        renderInvoice(api, { key: 'work_order', id: 'wo-1' })
        await screen.findByDisplayValue('Válvula de alta presión')
        // El editor topa la cantidad en lo pendiente (2 de 6).
        const qty = screen.getAllByLabelText('Cant.').filter((el) => el.tagName === 'INPUT')[1] as HTMLInputElement
        fireEvent.change(qty, { target: { value: '5' } })
        expect(qty.value).toBe('2')
        // Si otro documento consumió lo pendiente mientras tanto, el servidor rechaza.
        fireEvent.click(screen.getByRole('button', { name: 'Crear factura' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        expect(await screen.findByText(/excede lo pendiente de «Orden de trabajo»/)).toBeTruthy()
        expect(slot('document-editor-dialog')).toBeTruthy()
    })
})

describe('reglas puras del editor de factura', () => {
    it('lo obligatorio que el tipo declara queda a la vista aunque sea fiscal_data.*; las extensiones del metadata se pliegan', () => {
        const g = splitEditorFields(invoice.fields, {
            partyField: 'customer_id',
            extensionFields: [{ key: 'fiscal_data.uso_cfdi', label: 'Uso CFDI', type: 'select', required: true, options: [{ value: 'G03', label: 'G03' }] }],
        })
        expect(g.party?.key).toBe('customer_id')
        expect(g.essential.map((f) => f.key)).toEqual(['invoice_date', 'due_date', 'fiscal_data.metodo_pago', 'fiscal_data.forma_pago'])
        expect(g.advanced.map((f) => f.key)).toEqual(['currency_code', 'fiscal_data.uso_cfdi'])
        expect(g.notes.map((f) => f.key)).toEqual(['notes'])
    })

    it('un origen sin dato de impuesto toma la tasa de la org; uno con impuesto conserva el suyo', () => {
        const [wo] = linesFromSource([{ id: 'a', description: 'Mano de obra', quantity: 1, unit_price: 100 }], {}, { defaultTaxRate: 0.16 })
        expect(wo.tax_rate).toBe(0.16)
        const [exempt] = linesFromSource([{ id: 'b', description: 'Exento', quantity: 1, unit_price: 100, subtotal: 100, tax_amount: 0 }], {}, { defaultTaxRate: 0.16 })
        expect(exempt.tax_rate).toBe(0)
    })
})
