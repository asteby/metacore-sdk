// @vitest-environment happy-dom
// Retest Pitsline r6 (P0 UX): en el editor de la factura, método PPD exige
// forma de pago 99 (`options[].when` del manifest). Elegir PPD fija 99 solo y
// el alta lleva los dos valores, no solo el diálogo de Timbrar.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const value = { t: (k: string, o?: Record<string, any>) => o?.defaultValue ?? k, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import { TaxRateContext } from '../org-runtime-context'
import { gatedOptionFixes } from '../business/document-editor-model'
import type { ActionFieldDef, DocumentFormsManifest, DocumentFormType } from '../types'

afterEach(cleanup)

const notPPD = { field: 'fiscal_data.metodo_pago', not_in: ['PPD'] }
const formaPago: ActionFieldDef = {
    key: 'fiscal_data.forma_pago',
    label: 'Forma de pago',
    type: 'select',
    required: true,
    defaultValue: '01',
    options: [
        { value: '01', label: 'Efectivo · 01', when: notPPD },
        { value: '03', label: 'Transferencia · 03', when: notPPD },
        { value: '99', label: 'Por definir · 99', when: { field: 'fiscal_data.metodo_pago', in: ['PPD'] } },
    ],
} as ActionFieldDef
const metodoPago: ActionFieldDef = {
    key: 'fiscal_data.metodo_pago',
    label: 'Método de pago',
    type: 'select',
    required: true,
    defaultValue: 'PUE',
    options: [
        { value: 'PUE', label: 'Una sola exhibición · PUE' },
        { value: 'PPD', label: 'Parcialidades o diferido · PPD' },
    ],
}

const invoice: DocumentFormType = {
    key: 'invoice',
    label: 'Factura',
    layout: 'editor',
    fields: [{ key: 'customer_id', label: 'Cliente', type: 'text', required: true }, metodoPago, formaPago],
    defaults: { 'fiscal_data.metodo_pago': 'PUE', 'fiscal_data.forma_pago': '01' },
    lines: { title: 'Renglones', required: false },
    submit_label: 'Crear factura',
}

function renderInvoice(post: ReturnType<typeof vi.fn>) {
    const client = { get: vi.fn(async () => ({ data: { data: [] } })), post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
    const forms: DocumentFormsManifest = { lines_field: 'items', types: [invoice] }
    return render(
        <ApiProvider client={client}>
            <TaxRateContext.Provider value={0.16}>
                <DocumentFormDialog open onOpenChange={() => {}} model="customers.Invoice" forms={forms} initialType="invoice" currency="MXN" />
            </TaxRateContext.Provider>
        </ApiProvider>,
    )
}

async function pick(fieldLabel: RegExp, option: RegExp) {
    const trigger = screen.getAllByRole('combobox').find((el) => fieldLabel.test(el.closest('[data-slot="field-cell"], div')?.textContent ?? '')) as HTMLElement
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('factura: método PPD ⇒ forma de pago 99', () => {
    it('elegir PPD fija la forma 99 y el alta la lleva', async () => {
        const post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'inv-1' } } })
        renderInvoice(post)
        fireEvent.change(document.getElementById('customer_id')!, { target: { value: 'c-1' } })

        await pick(/Método de pago/, /PPD/)
        await waitFor(() => expect(screen.getAllByText('Por definir · 99').length).toBeGreaterThan(0))
        fireEvent.click(screen.getByRole('button', { name: 'Crear factura' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        const body = post.mock.calls[0][1] as Record<string, unknown>
        expect(body['fiscal_data.metodo_pago']).toBe('PPD')
        expect(body['fiscal_data.forma_pago']).toBe('99')
    })
})

describe('gatedOptionFixes', () => {
    const fields = [metodoPago, formaPago]
    it('PPD con forma 01 → 99 (la única que aplica)', () => {
        expect(gatedOptionFixes(fields, { 'fiscal_data.metodo_pago': 'PPD', 'fiscal_data.forma_pago': '01' })).toEqual({ 'fiscal_data.forma_pago': '99' })
    })
    it('PUE con forma 99 → el default del campo', () => {
        expect(gatedOptionFixes(fields, { 'fiscal_data.metodo_pago': 'PUE', 'fiscal_data.forma_pago': '99' })).toEqual({ 'fiscal_data.forma_pago': '01' })
    })
    it('valor válido o vacío con varias opciones: sin cambios (converge)', () => {
        expect(gatedOptionFixes(fields, { 'fiscal_data.metodo_pago': 'PUE', 'fiscal_data.forma_pago': '03' })).toEqual({})
        expect(gatedOptionFixes(fields, { 'fiscal_data.metodo_pago': 'PUE', 'fiscal_data.forma_pago': '' })).toEqual({})
        expect(gatedOptionFixes(fields, { 'fiscal_data.metodo_pago': 'PPD', 'fiscal_data.forma_pago': '99' })).toEqual({})
    })
})
