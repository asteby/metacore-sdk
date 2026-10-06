// @vitest-environment happy-dom
// DocumentEditor (layout: "editor"): una pantalla por secciones, «Opciones
// fiscales» plegadas, una sola acción primaria, prefill desde el origen y
// reparto de cobros con PaymentAllocator.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const t = (k: string, o?: Record<string, any>) => {
        let s: string = o?.defaultValue ?? k
        for (const [key, v] of Object.entries(o ?? {})) s = s.replace(`{{${key}}}`, String(v))
        return s
    }
    const value = { t, i18n }
    return { useTranslation: () => value }
})

import { DocumentEditor } from '../business/document-editor'
import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import { __resetContributions, registerDocumentContribution } from '../primitives/contributions'
import type { DocumentFormsManifest, DocumentFormType } from '../types'

afterEach(() => {
    cleanup()
    __resetContributions()
})

type Routes = Record<string, unknown>

function makeApi(routes: Routes = {}, post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } })) {
    const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
        for (const [prefix, body] of Object.entries(routes)) {
            if (url.startsWith(prefix)) return { data: typeof body === 'function' ? (body as any)(url, cfg) : body }
        }
        return { data: { data: [] } }
    })
    const client = { get, post, put: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'new-1' } } }), delete: vi.fn() }
    return { client: client as unknown as ApiClient, get, post }
}

const invoice: DocumentFormType = {
    key: 'invoice',
    label: 'Factura',
    value: 'I',
    layout: 'editor',
    fields: [
        { key: 'customer_name', label: 'Cliente', type: 'text', required: true },
        { key: 'payment_form', label: 'Forma de pago', type: 'select', required: true, defaultValue: '03', options: [{ value: '03', label: '03 · Transferencia' }, { value: '01', label: '01 · Efectivo' }] },
        { key: 'payment_method', label: 'Método de pago', type: 'select', defaultValue: 'PUE', options: [{ value: 'PUE', label: 'PUE · Una exhibición' }, { value: 'PPD', label: 'PPD · Parcialidades' }] },
        { key: 'sales_order_id', label: 'Venta', type: 'text' },
    ],
    lines: { columns: ['tax'] },
    sources: [{ key: 'sales_order', label: 'Venta', model: 'customers.SalesOrder', lines: 'items', map: { description: 'product_name' }, link_field: 'sales_order_id' }],
    preview: { action: 'preview_cfdi', label: 'Vista previa CFDI' },
    submit_label: 'Guardar factura',
}
const forms: DocumentFormsManifest = { type_field: 'type', types: [invoice] }

function renderEditor(type: DocumentFormType, api: ReturnType<typeof makeApi>, extra: Partial<Parameters<typeof DocumentEditor>[0]> = {}) {
    const onSaved = vi.fn()
    render(
        <ApiProvider client={api.client}>
            <DocumentEditor model="customers.Invoice" forms={{ ...forms, types: [type] }} type={type} onCancel={() => {}} onSaved={onSaved} currency="MXN" {...extra} />
        </ApiProvider>,
    )
    return { onSaved }
}

describe('DocumentEditor — divulgación progresiva', () => {
    it('«Opciones fiscales» arranca plegada: lo esencial a la vista, el método con default adentro', () => {
        renderEditor(invoice, makeApi())
        const toggle = screen.getByRole('button', { name: /Opciones fiscales/ })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
        expect(panel.hidden).toBe(true)
        expect(within(panel).getByText('Método de pago')).toBeTruthy()
        // Esencial: fuera de la sección plegada.
        const essentials = document.querySelector('[data-slot="editor-essentials"]')!
        expect(within(essentials as HTMLElement).getByText('Cliente')).toBeTruthy()
        expect(within(essentials as HTMLElement).getByText('Forma de pago')).toBeTruthy()
        expect(within(essentials as HTMLElement).queryByText('Método de pago')).toBeNull()
        // Resumen de los defaults sin abrir.
        expect(toggle.textContent).toContain('PUE')
        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(panel.hidden).toBe(false)
    })

    it('la vista previa es opcional y está cerrada por defecto', () => {
        renderEditor(invoice, makeApi())
        expect(screen.getByRole('button', { name: /Vista previa CFDI/ }).getAttribute('aria-expanded')).toBe('false')
    })

    it('las etiquetas muestran el código SAT como dato secundario', () => {
        renderEditor(invoice, makeApi())
        expect(screen.getAllByText('Transferencia · 03').length).toBeGreaterThan(0)
    })

    it('una contribución header.fields de otro addon entra en «Opciones fiscales»', () => {
        registerDocumentContribution({
            id: 'fiscal_mexico.header.cfdi',
            kinds: ['invoice'],
            region: 'header.fields',
            requiresAddon: 'fiscal_mexico',
            component: () => <p>Relación CFDI</p>,
        })
        renderEditor(invoice, makeApi())
        const panel = document.querySelector('[data-slot="advanced-options"]')!
        expect(within(panel as HTMLElement).getByText('Relación CFDI')).toBeTruthy()
    })
})

describe('DocumentEditor — una sola acción primaria', () => {
    it('un solo botón primario (submit_label) y sin «Siguiente»', () => {
        renderEditor(invoice, makeApi())
        const primaries = document.querySelectorAll('[data-slot="document-editor"] [data-primary="true"]')
        expect(primaries.length).toBe(1)
        expect(primaries[0].textContent).toBe('Guardar factura')
        expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    })

    it('sin renglones no guarda: validación inline y revisión visible', async () => {
        const api = makeApi()
        renderEditor(invoice, api)
        fireEvent.click(screen.getByRole('button', { name: 'Guardar factura' }))
        await screen.findByText('Agrega al menos un renglón.')
        expect(screen.getAllByText(/Cliente/).length).toBeGreaterThan(1) // etiqueta + error inline
        expect(api.post).not.toHaveBeenCalled()
    })
})

describe('DocumentEditor — prefill desde el documento origen', () => {
    it('initialSource carga los renglones y el vínculo; guarda con el tipo y los renglones serializados', async () => {
        const api = makeApi({
            '/metadata/table/customers.SalesOrder': { data: { relations: [{ name: 'items', kind: 'one_to_many', through: 'customers.SalesOrderItem', foreign_key: 'sales_order_id' }] } },
            '/data/customers.SalesOrderItem': { data: [{ product_id: 'p1', product_name: 'Llanta 205/55R16', quantity: 4, unit_price: 1500, tax_rate: 0.16 }] },
            '/data/customers.SalesOrder': { data: [{ id: 'so-1', customer_name: 'ACME' }] },
        })
        const { onSaved } = renderEditor(
            { ...invoice, sources: [{ ...invoice.sources![0], header: { customer_name: 'customer_name' } }] },
            api,
            { initialSource: { key: 'sales_order', id: 'so-1' } },
        )
        await screen.findByDisplayValue('Llanta 205/55R16')
        await screen.findByDisplayValue('ACME')
        expect(api.get).toHaveBeenCalledWith('/data/customers.SalesOrderItem', expect.objectContaining({ params: expect.objectContaining({ f_sales_order_id: 'eq:so-1' }) }))
        fireEvent.click(screen.getByRole('button', { name: 'Guardar factura' }))
        await waitFor(() => expect(api.post).toHaveBeenCalled())
        const [url, body] = api.post.mock.calls[0] as [string, any]
        expect(url).toBe('/dynamic/customers.Invoice')
        expect(body).toMatchObject({ type: 'I', customer_name: 'ACME', sales_order_id: 'so-1', payment_method: 'PUE', payment_form: '03' })
        expect(body.lines).toEqual([expect.objectContaining({ product_id: 'p1', description: 'Llanta 205/55R16', quantity: 4, unit_price: 1500 })])
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1' })))
    })

    it('default_from_record siembra el encabezado desde el registro de la acción', () => {
        const type: DocumentFormType = {
            ...invoice,
            fields: [{ key: 'customer_name', label: 'Cliente', type: 'text', default_from_record: 'name' } as any],
        }
        renderEditor(type, makeApi(), { record: { id: 'c1', name: 'Taller Pérez' } })
        expect(screen.getByDisplayValue('Taller Pérez')).toBeTruthy()
    })
})

describe('DocumentEditor — cobro / REP (lines.kind: allocation)', () => {
    const payment: DocumentFormType = {
        key: 'payment',
        label: 'Registrar cobro',
        layout: 'editor',
        submit_action: 'collect_multi_payment_create',
        submit_label: 'Registrar cobro',
        party: { field: 'customer_id', model: 'customers.Customer' },
        fields: [
            { key: 'customer_id', label: 'Cliente', type: 'text', required: true, default_from_record: 'customer_id' } as any,
            { key: 'amount', label: 'Monto recibido', type: 'number', required: true },
        ],
        lines: {
            kind: 'allocation',
            open_documents: {
                model: 'customers.Invoice',
                party_field: 'customer_id',
                balance_field: 'amount_due',
                number_field: 'number',
                due_field: 'due_date',
                issued_field: 'issue_date',
                line_document_field: 'invoice_id',
                line_amount_field: 'amount',
            },
        },
    }
    const routes = {
        '/data/customers.Customer': { data: [{ id: 'c1', name: 'Llantas SA' }] },
        '/data/customers.Invoice': {
            data: [
                { id: 'inv-new', number: 'A-2', amount_due: 1000, issue_date: '2026-09-01', due_date: '2026-10-30' },
                { id: 'inv-old', number: 'A-1', amount_due: 300, issue_date: '2026-08-01', due_date: '2026-09-01' },
            ],
        },
    }

    it('lista las facturas abiertas, reparte del más vencido y guarda por la acción con allocations', async () => {
        const api = makeApi(routes)
        renderEditor(payment, api, { record: { customer_id: 'c1' }, today: new Date(2026, 9, 6) })
        await screen.findByText('A-1')
        expect(api.get).toHaveBeenCalledWith('/data/customers.Invoice', expect.objectContaining({ params: expect.objectContaining({ f_customer_id: 'eq:c1' }) }))
        expect(await screen.findByText('Llantas SA')).toBeTruthy()
        fireEvent.change(document.querySelector('[data-slot="editor-essentials"] input[type=number]')!, { target: { value: '500' } })
        await waitFor(() => expect((screen.getByLabelText('Aplicar a A-1') as HTMLInputElement).value).toBe('300'))
        expect((screen.getByLabelText('Aplicar a A-2') as HTMLInputElement).value).toBe('200')
        expect(screen.getByText(/Parcialidad 1/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Registrar cobro' }))
        await waitFor(() => expect(api.post).toHaveBeenCalled())
        const [url, body] = api.post.mock.calls[0] as [string, any]
        expect(url).toBe('/dynamic/customers.Invoice/action/collect_multi_payment_create')
        expect(body).toMatchObject({ customer_id: 'c1', amount: 500 })
        expect(body.allocations).toEqual([
            { invoice_id: 'inv-old', amount: 300 },
            { invoice_id: 'inv-new', amount: 200 },
        ])
        expect(body.type).toBeUndefined()
    })

    it('editar un monto pasa a reparto manual; «Autoaplicar» regresa al automático', async () => {
        const api = makeApi(routes)
        renderEditor(payment, api, { record: { customer_id: 'c1' } })
        await screen.findByText('A-1')
        fireEvent.click(screen.getByRole('button', { name: /Cobrar todo/ }))
        await waitFor(() => expect((screen.getByLabelText('Aplicar a A-2') as HTMLInputElement).value).toBe('1000'))
        fireEvent.change(screen.getByLabelText('Aplicar a A-2'), { target: { value: '400' } })
        expect(screen.getByText('Reparto manual')).toBeTruthy()
        expect((screen.getByLabelText('Aplicar a A-2') as HTMLInputElement).value).toBe('400')
        expect(screen.getByText('Sin aplicar (saldo a favor)')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Autoaplicar' }))
        expect((screen.getByLabelText('Aplicar a A-2') as HTMLInputElement).value).toBe('1000')
    })
})

describe('DocumentFormDialog + layout: editor', () => {
    it('con layout editor abre el DocumentEditor; sin él sigue el wizard', () => {
        const api = makeApi()
        const { unmount } = render(
            <ApiProvider client={api.client}>
                <DocumentFormDialog open onOpenChange={() => {}} model="customers.Invoice" forms={forms} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="document-editor"]')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
        unmount()
        render(
            <ApiProvider client={api.client}>
                <DocumentFormDialog open onOpenChange={() => {}} model="customers.Invoice" forms={{ ...forms, types: [{ ...invoice, layout: undefined, sources: undefined }] }} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="document-editor"]')).toBeNull()
        expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy()
    })

    it('un tipo con sources usa el editor («Cargar desde…») salvo layout: wizard explícito', () => {
        const api = makeApi()
        const { unmount } = render(
            <ApiProvider client={api.client}>
                <DocumentFormDialog open onOpenChange={() => {}} model="customers.Invoice" forms={{ ...forms, types: [{ ...invoice, layout: undefined }] }} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="load-from-source"]')).toBeTruthy()
        unmount()
        render(
            <ApiProvider client={api.client}>
                <DocumentFormDialog open onOpenChange={() => {}} model="customers.Invoice" forms={{ ...forms, types: [{ ...invoice, layout: 'wizard' }] }} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="document-editor"]')).toBeNull()
    })
})

describe('DocumentEditor — «crear desde» con lo pendiente del servidor', () => {
    const tracked: DocumentFormType = {
        ...invoice,
        sources: [{ ...invoice.sources![0], line_link_field: 'sales_order_item_id', exclude_states: ['cancelled'] }],
    }
    const pendingRows = {
        data: [
            { id: 'soi-1', source_line_id: 'soi-1', product_id: 'p1', product_name: 'Llanta 205/55R16', quantity: 4, remaining_quantity: 1, unit_price: 1500, discount: 0, tax_rate: 0.16 },
            { id: 'soi-2', source_line_id: 'soi-2', product_id: 'p2', product_name: 'Balanceo', quantity: 4, remaining_quantity: 0, unit_price: 100, tax_rate: 0.16 },
        ],
    }

    it('precarga lo pendiente (no lo vendido), omite lo ya facturado y guarda el vínculo por renglón', async () => {
        const api = makeApi({
            '/dynamic/customers.Invoice/source-lines': pendingRows,
            '/data/customers.SalesOrder': { data: [{ id: 'so-1' }] },
        })
        renderEditor(tracked, api, { initialSource: { key: 'sales_order', id: 'so-1' } })
        await screen.findByDisplayValue('Llanta 205/55R16')
        expect(screen.queryByDisplayValue('Balanceo')).toBeNull()
        expect(api.get).toHaveBeenCalledWith('/dynamic/customers.Invoice/source-lines', { params: { source: 'sales_order', id: 'so-1' } })
        expect(await screen.findByText('1 renglones con lo pendiente · 1 ya cubiertos se omitieron')).toBeTruthy()
    })

    it('si el host aún no sirve source-lines (404) cae a la relación del origen', async () => {
        const api = makeApi({
            '/dynamic/customers.Invoice/source-lines': () => {
                throw { response: { status: 404 } }
            },
            '/metadata/table/customers.SalesOrder': { data: { relations: [{ name: 'items', kind: 'one_to_many', through: 'customers.SalesOrderItem', foreign_key: 'sales_order_id' }] } },
            '/data/customers.SalesOrderItem': { data: [{ id: 'soi-1', product_id: 'p1', product_name: 'Llanta 205/55R16', quantity: 4, unit_price: 1500, tax_rate: 0.16 }] },
        })
        renderEditor(tracked, api, { initialSource: { key: 'sales_order', id: 'so-1' } })
        await screen.findByDisplayValue('Llanta 205/55R16')
    })

    it('si la ruta source-lines contesta 400/500 (host sin la ruta) también cae a la relación', async () => {
        for (const status of [400, 500]) {
            const api = makeApi({
                '/dynamic/customers.Invoice/source-lines': () => {
                    throw { response: { status } }
                },
                '/metadata/table/customers.SalesOrder': { data: { relations: [{ name: 'items', kind: 'one_to_many', through: 'customers.SalesOrderItem', foreign_key: 'sales_order_id' }] } },
                '/data/customers.SalesOrderItem': { data: [{ id: 'soi-1', product_id: 'p1', product_name: 'Llanta 205/55R16', quantity: 4, unit_price: 1500, tax_rate: 0.16 }] },
            })
            renderEditor(tracked, api, { initialSource: { key: 'sales_order', id: 'so-1' } })
            await screen.findByDisplayValue('Llanta 205/55R16')
            cleanup()
        }
    })

    it('el rechazo del servidor por exceso se muestra con su mensaje en español', async () => {
        const post = vi.fn().mockRejectedValue({
            response: {
                status: 422,
                data: {
                    success: false,
                    message: 'validation failed',
                    errors: { 'lines.0.quantity': [{ code: 'exceeds_remaining', message: 'Renglón 1: la cantidad 1 excede lo pendiente de «Venta» (0).' }] },
                },
            },
        })
        const api = makeApi({ '/dynamic/customers.Invoice/source-lines': pendingRows, '/data/customers.SalesOrder': { data: [{ id: 'so-1', customer_name: 'ACME' }] } }, post)
        renderEditor(
            { ...tracked, sources: [{ ...tracked.sources![0], header: { customer_name: 'customer_name' } }] },
            api,
            { initialSource: { key: 'sales_order', id: 'so-1' } },
        )
        await screen.findByDisplayValue('ACME')
        fireEvent.click(screen.getByRole('button', { name: 'Guardar factura' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        const [, body] = post.mock.calls[0] as [string, any]
        expect(body.lines).toEqual([expect.objectContaining({ product_id: 'p1', quantity: 1, sales_order_item_id: 'soi-1' })])
        expect(await screen.findByText(/excede lo pendiente de «Venta»/)).toBeTruthy()
    })
})

describe('DocumentEditor — nota de crédito desde la factura (retest Pitsline r5)', () => {
    const creditNote: DocumentFormType = {
        key: 'credit_note',
        label: 'Nota de crédito',
        layout: 'editor',
        submit_action: 'create_credit_note',
        fields: [
            { key: 'invoice_id', label: 'Factura', type: 'text', required: true },
            { key: 'reason', label: 'Motivo', type: 'text' },
        ],
        lines: { kind: 'credit', columns: ['tax'], required: false, title: 'Renglones a acreditar' },
        sources: [
            { key: 'invoice', label: 'Factura', model: 'customers.Invoice', lines: 'items', link_field: 'invoice_id', line_link_field: 'invoice_item_id', exclude_states: ['cancelled'] },
        ],
    }

    it('una sola tabla editable con el producto nombrado y lo restante por acreditar', async () => {
        const api = makeApi({
            '/dynamic/fiscal_mexico.CreditNote/source-lines': {
                data: [
                    // InvoiceItem: sin descripción; el host resuelve product {value,label}.
                    { id: 'it-1', source_line_id: 'it-1', product_id: 'p1', product: { value: 'p1', label: 'EVERLAND 205/55R16' }, quantity: 2, remaining_quantity: 1, unit_price: 710, tax_amount: 227.2, subtotal: 1420 },
                ],
            },
        })
        render(
            <ApiProvider client={api.client}>
                <DocumentEditor
                    model="fiscal_mexico.CreditNote"
                    forms={{ lines_field: 'lines', types: [creditNote] }}
                    type={creditNote}
                    initialSource={{ key: 'invoice', id: 'inv-15' }}
                    onCancel={() => {}}
                    onSaved={() => {}}
                    currency="MXN"
                />
            </ApiProvider>,
        )
        await screen.findByDisplayValue('EVERLAND 205/55R16')
        expect(screen.getAllByRole('table')).toHaveLength(1)
        expect(screen.getByDisplayValue('1')).toBeTruthy()
        expect(screen.queryByDisplayValue('0')).toBeNull()
    })
})
