// @vitest-environment happy-dom
//
// Retest Pitsline 05/10: the customer and product forms printed the fields that
// fiscal_mexico adds by extension as `FISCAL_MEXICO.EXT.CUSTOMER.RFC_RECEPTOR`.
// The server served the label as the raw catalog key and the dialog rendered it
// verbatim (uppercased by CSS). The dialog now resolves such a key with the
// client catalog, and humanizes it when the catalog does not have it either.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { localizeFieldLabel } from '../dynamic-columns-helpers'

afterEach(cleanup)

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({
        lng: 'es',
        fallbackLng: 'es',
        react: { useSuspense: false },
        resources: {
            es: {
                translation: {
                    fiscal_mexico: { ext: { customer: { rfc_receptor: 'RFC' } } },
                },
            },
        },
    })
    return inst
}

const api = {
    get: vi.fn(async () => ({ data: { data: {} } })),
    post: async () => ({ data: { success: true } }),
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

describe('DynamicRecordDialog — extension field labels', () => {
    it('never prints a raw catalog key as the field label', async () => {
        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="customers"
                        schema={{
                            title: 'Nuevo cliente',
                            fields: [
                                { key: 'name', label: 'Nombre', type: 'text' },
                                { key: 'fiscal_data.rfc_receptor', label: 'fiscal_mexico.ext.customer.rfc_receptor', type: 'text' },
                                { key: 'fiscal_data.codigo_postal', label: 'fiscal_mexico.ext.customer.codigo_postal', type: 'text' },
                            ],
                        } as never}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )

        const label = (key: string) =>
            document.querySelector(`[data-aby-field="${key}"] label`)?.textContent ?? ''
        await waitFor(() => expect(label('fiscal_data.rfc_receptor')).toBe('RFC'))
        expect(label('fiscal_data.codigo_postal')).toBe('Codigo Postal')
        expect(label('name')).toBe('Nombre')
        expect(document.body.textContent).not.toContain('fiscal_mexico.ext')
    })
})

describe('localizeFieldLabel', () => {
    it('leaves human labels alone, even single words or acronyms', () => {
        const t = vi.fn((k: string) => `T:${k}`)
        expect(localizeFieldLabel('Nombre', t)).toBe('Nombre')
        expect(localizeFieldLabel('RFC', t)).toBe('RFC')
        expect(localizeFieldLabel('Código postal', t)).toBe('Código postal')
        expect(t).not.toHaveBeenCalled()
    })

    it('resolves catalog keys and humanizes the ones the catalog lacks', () => {
        expect(localizeFieldLabel('a.b', (k: string, o?: { defaultValue?: string }) => (k === 'a.b' ? 'Hola' : o?.defaultValue ?? k))).toBe('Hola')
        expect(localizeFieldLabel('fiscal_mexico.ext.product.mx_clave_unidad', (k: string) => k)).toBe('Mx Clave Unidad')
    })
})
