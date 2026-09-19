// @vitest-environment happy-dom
//
// Client-side validateValues must paint invalid fields (border + message) so a
// toast "Revisa los campos marcados" is never orphaned when the field exists
// in the schema. ensureFields merges host-injected keys (e.g. branch_id) into
// the loaded modal before seed/render.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'

afterEach(cleanup)

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}))

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({
        lng: 'es',
        fallbackLng: 'es',
        react: { useSuspense: false },
        resources: { es: { translation: {} } },
    })
    return inst
}

const api = {
    get: vi.fn(async (url: string) => {
        if (String(url).includes('/metadata/modal/')) {
            return {
                data: {
                    data: {
                        title: 'Nuevo pedido',
                        fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
                    },
                },
            }
        }
        return { data: { data: {} } }
    }),
    post: vi.fn(async () => ({ data: { success: true } })),
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

describe('DynamicRecordDialog field validation UX', () => {
    it('marks required empty fields invalid on submit', async () => {
        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="SalesOrder"
                        schema={{
                            title: 'Nuevo pedido',
                            fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
                        } as never}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )

        await waitFor(() => expect(screen.getByText('Nombre')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))

        await waitFor(() => {
            const input = document.querySelector('input[aria-invalid="true"]')
            expect(input).toBeTruthy()
            expect(input!.className).toMatch(/border-destructive/)
            expect(screen.getByText(/obligatorio|required/i)).toBeTruthy()
        })
    })

    it('merges ensureFields into fetched modal schema', async () => {
        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="SalesOrder"
                        ensureFields={[
                            {
                                key: 'branch_id',
                                label: 'Sucursal',
                                type: 'dynamic_select',
                                ref: 'Branch',
                                required: true,
                            },
                        ]}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )

        await waitFor(() => expect(screen.getByText('Sucursal')).toBeTruthy())
        expect(screen.getByText('Nombre')).toBeTruthy()
    })
})
