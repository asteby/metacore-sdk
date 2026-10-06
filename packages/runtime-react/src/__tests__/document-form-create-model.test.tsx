// @vitest-environment happy-dom
// Retest r4 Pitsline (06/10): Documentos fiscales → Facturas se quedó sin
// «Crear» (#1048 lo oculta: FiscalDocument no tiene formulario de factura). Un
// tipo con `create_model` delega el alta a otro modelo (customers.Invoice): el
// host abre esa página con su alta abierta.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    const value = { t, i18n }
    return { useTranslation: () => value }
})

import {
    DocumentFormDialog,
    delegatedCreate,
    scopeDocumentFormsToFilter,
    withoutDelegatedTypes,
} from '../document-form-dialog'
import { DynamicCRUDPage } from '../dynamic-crud-page'
import { useMetadataCache } from '../metadata-cache'
import { ApiProvider, type ApiClient } from '../api-context'
import type { DocumentFormsManifest } from '../types'

afterEach(cleanup)

// Forma de fiscal_mexico FiscalDocument: el REP se crea aquí, la factura en customers.
const fiscalForms: DocumentFormsManifest = {
    type_field: 'document_type',
    types: [
        {
            key: 'payment_complement',
            label: 'Complemento de pago',
            value: 'payment_complement',
            fields: [{ key: 'amount', label: 'Monto', type: 'number', required: true }],
        },
        { key: 'invoice', label: 'Factura', value: 'invoice', fields: [], create_model: 'customers.Invoice' },
    ],
}

function client(): ApiClient {
    return {
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: { success: true } }),
        put: vi.fn(),
        delete: vi.fn(),
    } as unknown as ApiClient
}

describe('create_model: alta delegada', () => {
    it('la vista Facturas (filtro document_type=invoice) conserva el tipo delegado y no oculta Crear', () => {
        const scoped = scopeDocumentFormsToFilter(fiscalForms, { document_type: 'eq:invoice' })
        expect(scoped.hideCreate).toBe(false)
        expect(delegatedCreate(scoped.forms)).toMatchObject({ model: 'customers.Invoice', type: { key: 'invoice' } })
        // REP sigue igual: tipo con formulario propio, sin delegación.
        expect(delegatedCreate(scopeDocumentFormsToFilter(fiscalForms, { document_type: 'payment_complement' }).forms)).toBeUndefined()
    })

    it('sin host que sepa navegar, el tipo delegado no se ofrece (vista acotada a él = sin Crear)', () => {
        const forms = withoutDelegatedTypes(fiscalForms)
        expect(forms?.types.map((x) => x.key)).toEqual(['payment_complement'])
        expect(scopeDocumentFormsToFilter(forms, { document_type: 'invoice' }).hideCreate).toBe(true)
    })

    it('el diálogo con el tipo delegado no pinta formulario: llama al host y se cierra', async () => {
        const onDelegateCreate = vi.fn()
        const onOpenChange = vi.fn()
        render(
            <ApiProvider client={client()}>
                <DocumentFormDialog
                    open
                    onOpenChange={onOpenChange}
                    model="fiscal_documents"
                    forms={fiscalForms}
                    initialType="invoice"
                    onDelegateCreate={onDelegateCreate}
                />
            </ApiProvider>,
        )
        await waitFor(() => expect(onDelegateCreate).toHaveBeenCalledTimes(1))
        expect(onDelegateCreate.mock.calls[0][0]).toMatchObject({ model: 'customers.Invoice', type: { key: 'invoice' } })
        expect(onOpenChange).toHaveBeenCalledWith(false)
        expect(document.querySelector('[data-slot="document-form-dialog"]')).toBeNull()
    })

    it('con varios tipos, elegir la tarjeta delegada navega; sin callback la tarjeta no aparece', async () => {
        const onDelegateCreate = vi.fn()
        render(
            <ApiProvider client={client()}>
                <DocumentFormDialog open onOpenChange={() => {}} model="fiscal_documents" forms={fiscalForms} onDelegateCreate={onDelegateCreate} />
            </ApiProvider>,
        )
        fireEvent.click(screen.getByText('Factura'))
        await waitFor(() => expect(onDelegateCreate).toHaveBeenCalled())
        cleanup()
        render(
            <ApiProvider client={client()}>
                <DocumentFormDialog open onOpenChange={() => {}} model="fiscal_documents" forms={fiscalForms} />
            </ApiProvider>,
        )
        // Un solo tipo restante (REP): se salta el selector.
        expect(screen.queryByText('Factura')).toBeNull()
        expect(screen.getByText('Monto')).toBeTruthy()
    })

    it('DynamicCRUDPage: en Facturas «Crear» delega al host', async () => {
        const m = {
            title: 'Documentos fiscales',
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
            document_forms: fiscalForms,
        } as any
        useMetadataCache.getState().setMetadata('fiscal_documents', m)
        const api = {
            get: vi.fn(async (url: string) =>
                url.startsWith('/metadata/') ? { data: { success: true, data: m } } : { data: { success: true, data: [], meta: { total: 0 } } },
            ),
            post: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
        } as unknown as ApiClient
        const onDelegateCreate = vi.fn()
        render(
            <ApiProvider client={api}>
                <DynamicCRUDPage model="fiscal_documents" filter={{ document_type: 'invoice' }} onDelegateCreate={onDelegateCreate} />
            </ApiProvider>,
        )
        fireEvent.click((await screen.findByText(/New Documentos/)).closest('button')!)
        await waitFor(() => expect(onDelegateCreate).toHaveBeenCalled())
        expect(onDelegateCreate.mock.calls[0][0].model).toBe('customers.Invoice')
    })
})
