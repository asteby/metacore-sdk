// @vitest-environment happy-dom
//
// FieldWidgetProps.setValues: un widget de campo (inyectado con ensureFields) llena
// varios campos hermanos del modal a la vez (p. ej. precarga desde un documento).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { registerFieldWidget } from '../field-widget-registry'

afterEach(cleanup)
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
}
const api = {
    get: vi.fn(async () => ({ data: { data: {} } })),
    post: vi.fn(async () => ({ data: { success: true } })),
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

describe('FieldWidgetProps.setValues', () => {
    it('un widget inyectado con ensureFields llena campos hermanos', async () => {
        const dispose = registerFieldWidget('fill_siblings', ({ setValues }) => (
            <button type="button" onClick={() => setValues?.({ name: 'Acme SA', tax_id: 'XAXX010101000' })}>
                Llenar
            </button>
        ))
        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="Customer"
                        schema={{
                            title: 'Nuevo',
                            fields: [
                                { key: 'name', label: 'Nombre', type: 'text' },
                                { key: 'tax_id', label: 'ID fiscal', type: 'text' },
                            ],
                        } as never}
                        ensureFields={[{ key: '__fill', label: 'Constancia', type: 'text', widget: 'fill_siblings' } as never]}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )
        await waitFor(() => expect(screen.getByText('Llenar')).toBeTruthy())
        fireEvent.click(screen.getByText('Llenar'))
        await waitFor(() => {
            const vals = Array.from(document.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value)
            expect(vals).toContain('Acme SA')
            expect(vals).toContain('XAXX010101000')
        })
        dispose()
    })
})
