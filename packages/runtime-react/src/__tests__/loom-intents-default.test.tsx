// @vitest-environment happy-dom
//
// Manejo por defecto de las intenciones de Loom en DynamicRecordDialog (p. ej. el «Crear» de la
// tabla, que no pasa onIntent): record.select abre el existente, record.edit abre su edición con el
// parche como propuesta revisable. Quien ya atiende las intenciones no cambia. Y la barra
// «Se aplicaron N campos» se retira cuando esos valores ya no están en el formulario.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { PermissionsProvider } from '../permissions-context'
import { clearLoom, registerGraft, useProposalQueue, type GraftProps, type Proposal } from '../loom'

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

const schema = {
    title: 'Cliente',
    fields: [
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'tax_id', label: 'RFC', type: 'text' },
    ],
}

function makeApi() {
    const get = vi.fn(async (url: string) => {
        if (url.endsWith('/9')) return { data: { data: { id: '9', name: 'Ana Existente', tax_id: 'XAXX010101000' } } }
        return { data: { data: {} } }
    })
    return { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}

function Dup({ caps }: GraftProps) {
    return (
        <>
            <button type="button" onClick={() => caps.emit('record.select', { record: { id: '9' } })}>
                usar existente
            </button>
            <button type="button" onClick={() => caps.emit('record.edit', { id: '9', patch: { tax_id: 'XEXX010101000' }, reason: 'Constancia' })}>
                actualizar con constancia
            </button>
        </>
    )
}

function renderCreate(api: ReturnType<typeof makeApi>, extra: Record<string, unknown> = {}, permissions?: string[]) {
    registerGraft({ id: 'fiscal_mexico.dup', seam: 'record.dialog.header', component: Dup, writes: ['tax_id'] })
    const dialog = (
        <DynamicRecordDialog open onOpenChange={() => {}} mode="create" model="Customer" endpoint="/data/Customer" schema={schema as never} {...extra} />
    )
    return render(
        <I18nextProvider i18n={i18n}>
            <ApiProvider client={api as never}>
                {permissions ? <PermissionsProvider permissions={permissions} isAdmin={false}>{dialog}</PermissionsProvider> : dialog}
            </ApiProvider>
        </I18nextProvider>,
    )
}

const input = (name: string) => screen.getAllByRole('textbox')[name === 'name' ? 0 : 1] as HTMLInputElement

describe('intenciones por defecto', () => {
    it('record.select sin anfitrión: abre la edición del existente', async () => {
        const api = makeApi()
        renderCreate(api)
        fireEvent.click(await screen.findByText('usar existente', undefined, { timeout: 10000 }))
        await waitFor(() => expect(api.get.mock.calls.some((c) => /\/9$/.test(String(c[0])))).toBe(true), { timeout: 10000 })
        await waitFor(() => expect(input('name').value).toBe('Ana Existente'), { timeout: 10000 })
        expect(screen.queryByRole('button', { name: 'Crear' })).toBeNull()
    })

    it('record.select sin permiso de edición: abre la ficha', async () => {
        const api = makeApi()
        renderCreate(api, {}, ['customer.index'])
        fireEvent.click(await screen.findByText('usar existente', undefined, { timeout: 10000 }))
        await waitFor(() => expect(screen.getByText('Ana Existente')).toBeTruthy(), { timeout: 10000 })
        expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    })

    it('record.edit sin anfitrión: edición del existente con el parche como diff revisable', async () => {
        const api = makeApi()
        renderCreate(api)
        fireEvent.click(await screen.findByText('actualizar con constancia', undefined, { timeout: 10000 }))
        const review = await screen.findByRole('region', { name: 'Constancia' }, { timeout: 10000 })
        expect(within(review).getByText('XEXX010101000')).toBeTruthy()
        expect(within(review).getByText('XAXX010101000')).toBeTruthy() // valor anterior
        expect(input('tax_id').value).toBe('XAXX010101000')
        fireEvent.click(within(review).getByRole('button', { name: 'Aplicar' }))
        await waitFor(() => expect(input('tax_id').value).toBe('XEXX010101000'))
    })

    it('si el anfitrión atiende la intención, no se cambia de registro', async () => {
        const api = makeApi()
        const onIntent = vi.fn(() => true)
        renderCreate(api, { onIntent })
        fireEvent.click(await screen.findByText('usar existente', undefined, { timeout: 10000 }))
        expect(onIntent).toHaveBeenCalledWith('record.select', { record: { id: '9' } })
        expect(api.get.mock.calls.some((c) => /\/9$/.test(String(c[0])))).toBe(false)
    })
})

describe('barra de aplicados', () => {
    it('se retira cuando los valores aplicados ya no están en el formulario', () => {
        let values: Record<string, unknown> = { a: '' }
        const apply = (patch: Record<string, unknown>) => {
            values = { ...values, ...patch }
        }
        const { result, rerender } = renderHook(({ v }) => useProposalQueue(v, apply), { initialProps: { v: values } })
        const p: Proposal = { id: 'p', graft: 'g', addon: 'a', patch: { a: 'X' }, previous: {}, dropped: [], apply: 'auto' }
        act(() => result.current.push(p))
        rerender({ v: values })
        expect(result.current.applied).not.toBeNull()
        // El formulario se reinicia (recarga, cambio de modo): ya no hay nada que deshacer.
        rerender({ v: { a: '' } })
        expect(result.current.applied).toBeNull()
    })
})
