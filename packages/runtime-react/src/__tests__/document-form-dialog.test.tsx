// @vitest-environment happy-dom
// FAC-12 (#1022): alta guiada por tipo de documento.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    // Stable references: a fresh `t` per render would retrigger effects that depend on it.
    const i18n = { language: 'es' }
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    const value = { t, i18n }
    return { useTranslation: () => value }
})

import { DocumentFormDialog, resolveDocumentForms } from '../document-form-dialog'
import { DynamicCRUDPage } from '../dynamic-crud-page'
import { useMetadataCache } from '../metadata-cache'
import { ApiProvider, type ApiClient } from '../api-context'
import { OrgRuntimeProvider } from '../org-runtime-provider'
import type { DocumentFormsManifest } from '../types'

afterEach(cleanup)

const forms: DocumentFormsManifest = {
    type_field: 'type',
    types: [
        {
            key: 'invoice',
            label: 'Factura',
            description: 'Ingreso (I)',
            value: 'I',
            fields: [
                { key: 'customer_name', label: 'Cliente', type: 'text', required: true },
                { key: 'payment_method', label: 'Método de pago', type: 'text' },
            ],
            lines: { columns: ['tax'] },
        },
        {
            key: 'credit_note',
            label: 'Nota de crédito',
            value: 'E',
            fields: [
                { key: 'customer_name', label: 'Cliente', type: 'text', required: true },
                { key: 'origin_invoice', label: 'Factura origen', type: 'text', required: true },
            ],
        },
    ],
}

function api(post: ApiClient['post']): ApiClient {
    return { get: vi.fn().mockResolvedValue({ data: {} }), post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
}

function setup(manifest: DocumentFormsManifest, post: ApiClient['post'] = vi.fn().mockResolvedValue({ data: { success: true, data: { id: '1' } } })) {
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    render(
        <ApiProvider client={api(post)}>
            <DocumentFormDialog open onOpenChange={onOpenChange} model="fiscal_documents" forms={manifest} onSaved={onSaved} />
        </ApiProvider>,
    )
    return { post: post as ReturnType<typeof vi.fn>, onOpenChange, onSaved }
}

describe('DocumentFormDialog', () => {
    it('con dos tipos muestra tarjetas; elegir «Nota de crédito» muestra sus campos y no los de factura', () => {
        setup(forms)
        expect(screen.getByText('Factura')).toBeTruthy()
        expect(screen.getByText('Nota de crédito')).toBeTruthy()
        expect(screen.queryByText('Factura origen')).toBeNull()
        fireEvent.click(screen.getByText('Nota de crédito'))
        expect(screen.getByText('Factura origen')).toBeTruthy()
        expect(screen.queryByText('Método de pago')).toBeNull()
    })

    it('un solo tipo se salta el selector', () => {
        setup({ ...forms, types: [forms.types[1]] })
        expect(screen.queryByRole('radiogroup')).toBeNull()
        expect(screen.getByText('Factura origen')).toBeTruthy()
    })

    it('envía el valor del tipo y los campos al endpoint del modelo', async () => {
        const { post, onSaved, onOpenChange } = setup(forms)
        fireEvent.click(screen.getByText('Nota de crédito'))
        const inputs = document.querySelectorAll('input')
        fireEvent.change(inputs[0], { target: { value: 'ACME' } })
        fireEvent.change(inputs[1], { target: { value: 'FAC-1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        expect(post.mock.calls[0][0]).toBe('/dynamic/fiscal_documents')
        expect(post.mock.calls[0][1]).toMatchObject({ type: 'E', customer_name: 'ACME', origin_invoice: 'FAC-1' })
        await waitFor(() => expect(onSaved).toHaveBeenCalled())
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('el paso de renglones usa el editor del SDK y los serializa', async () => {
        const { post } = setup({ ...forms, types: [forms.types[0]] })
        fireEvent.change(document.querySelectorAll('input')[0], { target: { value: 'ACME' } })
        fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
        // Sin renglones no guarda: banner en el diálogo.
        await screen.findByRole('button', { name: 'Renglón libre' })
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await screen.findByRole('alert')
        expect(post).not.toHaveBeenCalled()
        // Con un renglón válido, viajan serializados en `lines`.
        fireEvent.click(screen.getByRole('button', { name: 'Renglón libre' }))
        fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Servicio' } })
        fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '100' } })
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        const body = post.mock.calls[0][1] as any
        expect(body.type).toBe('I')
        expect(body.lines).toEqual([expect.objectContaining({ description: 'Servicio', quantity: 1, unit_price: 100 })])
    })

    it('un 422 se muestra dentro del diálogo y no lo cierra', async () => {
        const post = vi.fn().mockRejectedValue({
            response: { status: 422, data: { success: false, message: 'validation failed', errors: { origin_invoice: ['La factura origen no existe'] } } },
        })
        const { onOpenChange, onSaved } = setup({ ...forms, types: [forms.types[1]] }, post)
        const inputs = document.querySelectorAll('input')
        fireEvent.change(inputs[0], { target: { value: 'ACME' } })
        fireEvent.change(inputs[1], { target: { value: 'X' } })
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        const banner = await screen.findByRole('alert')
        expect(banner.textContent).toContain('La factura origen no existe')
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
        expect(onSaved).not.toHaveBeenCalled()
    })
})

// Retest Pitsline 05/10: Facturas → Crear guardaba la factura en $0 porque el
// host (DynamicCRUDPage / ops) no pasa `searchProducts` y el paso de renglones
// solo ofrecía «Renglón libre» sin precio.
describe('DocumentFormDialog: buscador de catálogo por defecto', () => {
    const invoiceOnly: DocumentFormsManifest = { ...forms, types: [forms.types[0]] }
    const catalogRow = {
        id: 'prod-1',
        name: 'Llanta 205/55R16',
        sku: 'LL-205',
        unit_price: '1500.00',
        cost_price: '900',
        unit_of_measure: 'pza',
        product_type: 'product',
        fiscal_data: { mx_clave_prod_serv: '25172504', mx_clave_unidad: 'H87' },
    }

    function mount(opts: { searchProducts?: any; taxRate?: number } = {}) {
        const get = vi.fn().mockResolvedValue({ data: { success: true, data: [catalogRow] } })
        const post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'inv-1' } } })
        const client = { get, post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <OrgRuntimeProvider taxRate={opts.taxRate}>
                    <DocumentFormDialog
                        open
                        onOpenChange={vi.fn()}
                        model="customers.Invoice"
                        forms={invoiceOnly}
                        searchProducts={opts.searchProducts}
                    />
                </OrgRuntimeProvider>
            </ApiProvider>,
        )
        return { get, post }
    }

    async function pickFirstProduct(query: string, name: RegExp) {
        fireEvent.change(document.querySelectorAll('input')[0], { target: { value: 'ACME' } })
        fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
        fireEvent.change(await screen.findByLabelText('Buscar producto'), { target: { value: query } })
        fireEvent.click(await waitFor(() => screen.getByRole('button', { name }), { timeout: 2000 }))
    }

    it('sin searchProducts del host busca en el catálogo y el renglón entra con precio, cantidad 1, unidad, SKU e IVA de la org', async () => {
        const { get, post } = mount({ taxRate: 0.16 })
        await pickFirstProduct('llanta', /Llanta 205\/55R16/)
        expect(get).toHaveBeenCalledWith(
            '/data/products.Product',
            expect.objectContaining({ params: expect.objectContaining({ search: 'llanta' }) }),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        const [line] = (post.mock.calls[0][1] as any).lines
        expect(line).toMatchObject({
            product_id: 'prod-1',
            sku: 'LL-205',
            description: 'Llanta 205/55R16',
            quantity: 1,
            unit_price: 1500,
            tax_rate: 0.16,
            unit: 'pza',
            fiscal_data: { mx_clave_prod_serv: '25172504', mx_clave_unidad: 'H87' },
        })
        expect(line.unit_price).toBeGreaterThan(0)
    })

    it('si el host pasa searchProducts, se usa ese y no el catálogo', async () => {
        const searchProducts = vi.fn(async () => [{ id: 'h1', name: 'Servicio host', price: 250, tax_rate: 0.08 }])
        const { get, post } = mount({ searchProducts })
        await pickFirstProduct('serv', /Servicio host/)
        expect(searchProducts).toHaveBeenCalled()
        expect(get).not.toHaveBeenCalledWith('/data/products.Product', expect.anything())
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        expect((post.mock.calls[0][1] as any).lines[0]).toMatchObject({ product_id: 'h1', quantity: 1, unit_price: 250, tax_rate: 0.08 })
    })
})

describe('resolveDocumentForms', () => {
    it('sin manifest (o sin tipos) devuelve undefined: el alta genérica sigue igual', () => {
        expect(resolveDocumentForms(null)).toBeUndefined()
        expect(resolveDocumentForms({} as any)).toBeUndefined()
        expect(resolveDocumentForms({ document_forms: { types: [] } } as any)).toBeUndefined()
    })
    it('la prop gana sobre el metadata', () => {
        expect(resolveDocumentForms({ document_forms: { types: [forms.types[0]] } } as any, forms)).toBe(forms)
        expect(resolveDocumentForms({ document_forms: forms } as any)).toBe(forms)
    })
})

describe('DynamicCRUDPage + document_forms', () => {
    const meta = (extra: Record<string, unknown>) =>
        ({
            title: 'Notas de crédito',
            endpoint: '/data/x',
            columns: [],
            actions: [],
            perPageOptions: [10],
            defaultPerPage: 10,
            searchPlaceholder: 'Buscar',
            enableCRUDActions: true,
            hasActions: false,
            canExport: false,
            canImport: false,
            ...extra,
        }) as any

    const mount = (m: any) => {
        useMetadataCache.getState().setMetadata('fiscal_documents', m)
        const client = {
            get: vi.fn(async (url: string) =>
                url.startsWith('/metadata/') ? { data: { success: true, data: m } } : { data: { success: true, data: [], meta: { total: 0 } } },
            ),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <DynamicCRUDPage model="fiscal_documents" />
            </ApiProvider>,
        )
    }

    it('con document_forms, Crear abre el selector de tipo en vez del formulario genérico', async () => {
        mount(meta({ document_forms: forms }))
        fireEvent.click((await screen.findByText(/New Nota/)).closest('button')!)
        expect(await screen.findByRole('radiogroup')).toBeTruthy()
        expect(screen.getByText('Nota de crédito')).toBeTruthy()
    })

    it('sin document_forms no aparece el selector (alta genérica)', async () => {
        mount(meta({}))
        fireEvent.click((await screen.findByText(/New Nota/)).closest('button')!)
        await new Promise((r) => setTimeout(r, 50))
        expect(screen.queryByRole('radiogroup')).toBeNull()
    })
})
