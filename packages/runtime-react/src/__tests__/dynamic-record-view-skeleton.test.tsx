// @vitest-environment happy-dom
//
// Regression: opening the view dialog with a list-row `initialRecord` seed used
// to skip `loading`, so while `/metadata/modal` was in flight the body rendered
// null — an empty modal with only the "Información detallada del registro."
// description. Skeleton must show until modal metadata is ready.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'

afterEach(cleanup)

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

describe('DynamicRecordDialog view — skeleton while metadata loads', () => {
    it('shows the field skeleton even when a seed row is provided', async () => {
        let resolveMeta!: (v: unknown) => void
        const metaPromise = new Promise(resolve => {
            resolveMeta = resolve
        })

        const api = {
            get: vi.fn(async (url: string) => {
                if (String(url).includes('/metadata/modal/')) {
                    await metaPromise
                    return {
                        data: {
                            data: {
                                title: 'Orden de compra',
                                fields: [
                                    { key: 'number', label: 'Número', type: 'text' },
                                    { key: 'state', label: 'Estado', type: 'text' },
                                ],
                            },
                        },
                    }
                }
                return { data: { data: {} } }
            }),
            post: async () => ({ data: { success: true } }),
            put: async () => ({ data: { success: true } }),
            delete: async () => ({ data: { success: true } }),
        } as never

        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="view"
                        model="purchase_orders"
                        recordId="po-1"
                        initialRecord={{ id: 'po-1', number: 'OC-1', state: 'draft' }}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )

        // Description is always visible; body must NOT be an empty void.
        expect(screen.getByText('Información detallada del registro.')).toBeTruthy()
        // Skeleton primitives from @asteby/metacore-ui
        expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
        // Seeded field labels must not appear until meta resolves.
        expect(screen.queryByText('Número')).toBeNull()

        resolveMeta(undefined)

        await waitFor(() => {
            expect(screen.getByText('Número')).toBeTruthy()
            expect(screen.getByText('OC-1')).toBeTruthy()
        })
        expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBe(0)
    })
})
