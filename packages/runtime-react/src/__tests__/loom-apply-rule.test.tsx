// @vitest-environment happy-dom
//
// Regla de `apply: 'auto'` (decisión del RFC 0005 §6): solo se aplica directa si la Part declara su propio
// paso de revisión (`selfReview`) y ningún campo del parche es `secret`; en otro caso, diff revisable.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { clearLoom, effectiveApply, registerGraft, registerPart, type GraftProps } from '../loom'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
afterEach(() => {
    cleanup()
    clearLoom()
})

const i18n = (() => {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
})()
const api = { get: vi.fn(async () => ({ data: { data: {} } })), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never
const schema = {
    title: 'Cliente',
    fields: [
        { key: 'tax_id', label: 'RFC', type: 'text' },
        { key: 'pin', label: 'PIN', type: 'password' },
    ],
}

function Auto({ caps, props }: GraftProps<{ patch: Record<string, unknown> }>) {
    return (
        <button type="button" onClick={() => caps.propose({ patch: props.patch, reason: 'Lectura', apply: 'auto' })}>
            proponer
        </button>
    )
}

function mount() {
    return render(
        <I18nextProvider i18n={i18n}>
            <ApiProvider client={api}>
                <DynamicRecordDialog open onOpenChange={() => {}} mode="create" model="Customer" schema={schema as never} />
            </ApiProvider>
        </I18nextProvider>,
    )
}

const graft = (selfReview: boolean, patch: Record<string, unknown>) => {
    registerPart({ id: 'x.part', component: Auto, selfReview })
    registerGraft({ id: 'x.g', seam: 'record.dialog.header', part: 'x.part', writes: ['tax_id', 'pin'], props: { patch } })
}

describe('effectiveApply', () => {
    it('auto solo con revisión propia y sin campos secret', () => {
        expect(effectiveApply('auto', true, ['tax_id'], {})).toBe('auto')
        expect(effectiveApply('auto', false, ['tax_id'], {})).toBe('review')
        expect(effectiveApply('auto', true, ['tax_id', 'pin'], { pin: 'secret' })).toBe('review')
        expect(effectiveApply(undefined, true, ['tax_id'], {})).toBe('review')
    })
})

describe('DynamicRecordDialog · apply', () => {
    it('Part con revisión propia: se aplica directo y queda Deshacer', async () => {
        graft(true, { tax_id: 'XAXX010101000' })
        mount()
        fireEvent.click(await screen.findByText('proponer', undefined, { timeout: 5000 }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy())
        expect(screen.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    })

    it('Part sin revisión propia: auto se baja a diff revisable', async () => {
        graft(false, { tax_id: 'XAXX010101000' })
        mount()
        fireEvent.click(await screen.findByText('proponer', undefined, { timeout: 5000 }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy())
        expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    })

    it('nunca auto si toca un campo secret, aunque la Part revise', async () => {
        graft(true, { tax_id: 'XAXX010101000', pin: '1234' })
        mount()
        fireEvent.click(await screen.findByText('proponer', undefined, { timeout: 5000 }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar' })).toBeTruthy())
    })
})
