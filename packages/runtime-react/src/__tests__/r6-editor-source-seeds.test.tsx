// @vitest-environment happy-dom
// Retest Pitsline r6 (P0 UX): «Cargar desde» venta/OT/cotización debe dejar el
// CLIENTE elegido (su nombre en el selector y su tarjeta), aunque los renglones
// del origen fallen; y el selector «Factura a abonar» de la NC abierta desde una
// factura muestra el folio, no el UUID. El selector es el dynamic_select real
// (cerrado: no consulta opciones), así que la etiqueta sale de lo que el editor
// ya sabe del registro.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const value = {
        t: (k: string, o?: Record<string, any>) => {
            let s: string = o?.defaultValue ?? k
            for (const [key, v] of Object.entries(o ?? {})) s = s.replace(`{{${key}}}`, String(v))
            return s
        },
        i18n: { language: 'es' },
    }
    return { useTranslation: () => value }
})

import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import { TaxRateContext } from '../org-runtime-context'
import { seedRecord, sourceHeaderSeeds } from '../business/document-editor-model'
import type { DocumentFormsManifest, DocumentFormType } from '../types'

afterEach(cleanup)

const CUSTOMER = '6f1c2a9e-3b7d-4c55-9a51-0d2b8e7f4a10'
const INVOICE = '0b9d7c1e-5a4f-4e2b-8c3d-7f6e5d4c3b2a'

const invoice: DocumentFormType = {
    key: 'invoice',
    label: 'Factura',
    layout: 'editor',
    party: { field: 'customer_id', model: 'customers.Customer', summary: ['tax_id'] },
    fields: [
        { key: 'customer_id', label: 'Cliente', type: 'dynamic_select', ref: 'customers.Customer', required: true } as any,
        { key: 'work_order_id', label: 'Orden de trabajo', type: 'dynamic_select', ref: 'workshop.WorkOrder' } as any,
    ],
    lines: { title: 'Renglones' },
    sources: [
        { key: 'work_order', label: 'Orden de trabajo', model: 'workshop.WorkOrder', lines: 'items', header: { customer_id: 'customer_id' }, link_field: 'work_order_id', line_link_field: 'work_order_item_id' },
    ],
    submit_label: 'Crear factura',
}

const creditNote: DocumentFormType = {
    key: 'credit_note',
    label: 'Nota de crédito',
    layout: 'editor',
    fields: [
        { key: 'invoice_id', label: 'Factura a abonar', type: 'dynamic_select', ref: 'customers.Invoice', required: true, options: { source: 'customers.Invoice', value: 'id', label: 'number' } } as any,
    ],
    lines: { kind: 'credit', title: 'Conceptos' },
    sources: [{ key: 'invoice', label: 'Factura', model: 'customers.Invoice', lines: 'items', link_field: 'invoice_id', line_link_field: 'invoice_item_id' }],
    submit_label: 'Crear nota de crédito',
}

function makeApi(rows: Record<string, unknown[]>) {
    const get = vi.fn(async (url: string) => {
        if (url === '/data/customers.Customer') return { data: { data: [{ id: CUSTOMER, name: 'Transportes del Bajío', tax_id: 'TBA850312KJ9' }] } }
        if (url.startsWith('/data/')) return { data: { data: rows[url.slice(6)] ?? [] } }
        // Los renglones del origen no cargan (host sin source-lines ni relación).
        if (url.endsWith('/source-lines') || url.startsWith('/metadata/table/')) throw new Error('boom')
        return { data: { data: [] } }
    })
    const client = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
    return client as unknown as ApiClient
}

function open(model: string, type: DocumentFormType, api: ApiClient, initialSource: { key: string; id: string }) {
    const forms: DocumentFormsManifest = { lines_field: 'items', types: [type] }
    return render(
        <ApiProvider client={api}>
            <TaxRateContext.Provider value={0.16}>
                <DocumentFormDialog open onOpenChange={() => {}} model={model} forms={forms} initialType={type.key} initialSource={initialSource} currency="MXN" />
            </TaxRateContext.Provider>
        </ApiProvider>,
    )
}

const trigger = (key: string) => document.getElementById(key) as HTMLElement

describe('«Cargar desde» llena el cliente', () => {
    it('OT: el selector muestra el cliente por nombre y su tarjeta carga aunque los renglones fallen', async () => {
        const api = makeApi({ 'workshop.WorkOrder': [{ id: 'wo-1', order_number: 'OT-00031', customer_id: CUSTOMER }] })
        open('customers.Invoice', invoice, api, { key: 'work_order', id: 'wo-1' })
        await waitFor(() => expect(trigger('customer_id').textContent).toContain('Transportes del Bajío'))
        expect(trigger('customer_id').textContent).not.toContain(CUSTOMER)
        expect(document.querySelector('[data-slot="party-card"]')).toBeTruthy()
        expect(trigger('work_order_id').textContent).toContain('OT-00031')
    })

    it('el nombre del cliente que el host sirve junto a la FK se usa de inmediato', async () => {
        const api = makeApi({
            'workshop.WorkOrder': [{ id: 'wo-1', customer_id: CUSTOMER, customer: { value: CUSTOMER, label: 'Transportes del Bajío' } }],
        })
        open('customers.Invoice', invoice, api, { key: 'work_order', id: 'wo-1' })
        await waitFor(() => expect(trigger('customer_id').textContent).toContain('Transportes del Bajío'))
    })
})

describe('NC desde la factura', () => {
    it('«Factura a abonar» muestra el folio, no el UUID', async () => {
        const api = makeApi({ 'customers.Invoice': [{ id: INVOICE, number: 'FAC-00014', customer_id: CUSTOMER }] })
        open('fiscal_mexico.CreditNote', creditNote, api, { key: 'invoice', id: INVOICE })
        await waitFor(() => expect(trigger('invoice_id').textContent).toContain('FAC-00014'))
        expect(trigger('invoice_id').textContent).not.toContain(INVOICE)
        expect(screen.queryByText(INVOICE)).toBeNull()
    })
})

describe('reglas puras', () => {
    it('sourceHeaderSeeds: hermano {value,label} de la FK y folio del origen', () => {
        const seeds = sourceHeaderSeeds(
            invoice.sources![0],
            { id: 'wo-1', order_number: 'OT-7', customer_id: 'c-1', customer: { value: 'c-1', label: 'Ana' } },
            'wo-1',
            invoice.fields,
        )
        expect(seeds).toEqual({ customer_id: { value: 'c-1', label: 'Ana' }, work_order_id: { value: 'wo-1', label: 'OT-7' } })
        expect(sourceHeaderSeeds(invoice.sources![0], { id: 'wo-1', customer_id: 'c-1' }, 'wo-1')).toEqual({})
    })

    it('seedRecord: siembra el hermano y conserva el registro de origen', () => {
        expect(seedRecord({}, undefined)).toBeUndefined()
        expect(seedRecord({ customer_id: { value: 'c-1', label: 'Ana' } }, { id: 'inv-1', number: 'F-1' })).toEqual({
            id: 'inv-1',
            number: 'F-1',
            customer: { value: 'c-1', label: 'Ana' },
        })
    })
})
