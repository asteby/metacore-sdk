// @vitest-environment happy-dom
//
// Contrato de `caps.records.find` (RFC 0005): la Part sin red busca por el anfitrión. Solo
// modelos declarados, con permiso de listado, igualdad exacta, resultados acotados y congelados;
// el evento de auditoría nunca lleva el valor buscado.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { PermissionsProvider } from '../permissions-context'
import { clearLoom, LoomProvider, makeRecordsCap, registerGraft, registerPart, type GraftProps, type LoomEvent } from '../loom'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
afterEach(() => {
    cleanup()
    clearLoom()
})

const meta = { seam: 'record.dialog.header', graft: 'fiscal_mexico.csf', addon: 'fiscal_mexico' }

describe('makeRecordsCap', () => {
    const rows = [{ id: '1', name: 'A', nested: { x: 1 } }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }, { id: '6' }]
    const setup = (can: (p: string) => boolean = () => true) => {
        const finder = vi.fn(async () => rows)
        const events: LoomEvent[] = []
        const cap = makeRecordsCap({ allowed: ['customers.Customer'], finder, can, report: (e) => events.push(e), meta })!
        return { cap, finder, events }
    }

    it('sin declaración o sin host no hay capacidad', () => {
        expect(makeRecordsCap({ allowed: [], finder: async () => [], can: () => true, report: () => {}, meta })).toBeUndefined()
        expect(makeRecordsCap({ allowed: ['Customer'], finder: undefined, can: () => true, report: () => {}, meta })).toBeUndefined()
    })

    it('busca el modelo declarado, acota y congela; la auditoría no lleva el valor', async () => {
        const { cap, finder, events } = setup()
        const out = await cap.find({ model: 'Customer', field: 'tax_id', value: ' XAXX010101000 ', limit: 99 })
        expect(finder).toHaveBeenCalledWith({ model: 'Customer', field: 'tax_id', value: 'XAXX010101000', limit: 5 })
        expect(out).toHaveLength(5)
        expect(Object.isFrozen(out[0])).toBe(true)
        expect(rows[0].nested === (out[0] as { nested: unknown }).nested).toBe(false)
        expect(events).toEqual([{ type: 'records_find', ...meta, model: 'Customer', field: 'tax_id', outcome: 'ok', count: 5, reason: undefined }])
        expect(JSON.stringify(events)).not.toContain('XAXX')
    })

    it('no puede buscar otro modelo', async () => {
        const { cap, finder, events } = setup()
        await expect(cap.find({ model: 'users.User', field: 'email', value: 'a@b.c' })).rejects.toMatchObject({ code: 'not_declared' })
        expect(finder).not.toHaveBeenCalled()
        expect(events[0]).toMatchObject({ outcome: 'denied', reason: 'not_declared' })
    })

    it('no puede buscar sin permiso de listado', async () => {
        const { cap, finder } = setup((p) => p !== 'customer.index')
        await expect(cap.find({ model: 'Customer', field: 'tax_id', value: 'X' })).rejects.toMatchObject({ code: 'forbidden' })
        expect(finder).not.toHaveBeenCalled()
    })

    it('solo igualdad exacta de un campo simple', async () => {
        const { cap, finder } = setup()
        for (const q of [
            { model: 'Customer', field: 'tax_id;drop', value: 'X' },
            { model: 'Customer', field: 'a.b', value: 'X' },
            { model: 'Customer', field: 'tax_id', value: '' },
            { model: 'Customer', field: 'tax_id', value: 'x'.repeat(129) },
        ]) {
            await expect(cap.find(q)).rejects.toMatchObject({ code: 'invalid' })
        }
        expect(finder).not.toHaveBeenCalled()
    })

    it('un error del host no se propaga con el valor', async () => {
        const events: LoomEvent[] = []
        const cap = makeRecordsCap({
            allowed: ['Customer'],
            finder: async () => {
                throw new Error('500 RFC XAXX010101000')
            },
            can: () => true,
            report: (e) => events.push(e),
            meta,
        })!
        const err = await cap.find({ model: 'Customer', field: 'tax_id', value: 'XAXX010101000' }).catch((e: Error) => e)
        expect((err as Error).message).not.toContain('XAXX')
        expect(JSON.stringify(events)).not.toContain('XAXX')
    })
})

const i18n = (() => {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
})()

function Finder({ caps }: GraftProps) {
    return (
        <button
            type="button"
            onClick={() =>
                void caps.records
                    ?.find({ model: 'Customer', field: 'tax_id', value: 'XAXX010101000' })
                    .then((r) => caps.emit('record.select', { record: r[0] }))
            }
        >
            {caps.records ? 'buscar' : 'sin capacidad'}
        </button>
    )
}

describe('DynamicRecordDialog · records.find', () => {
    it('el host consulta su API con el filtro exacto y la Part solo ve el resultado', async () => {
        const get = vi.fn(async () => ({ data: { data: [{ id: '9', name: 'Ana', tax_id: 'XAXX010101000' }] } }))
        const api = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never
        registerPart({ id: 'fiscal_mexico.csf', component: Finder, recordsFind: ['customers.Customer'] })
        registerGraft({ id: 'fiscal_mexico.g', seam: 'record.dialog.header', part: 'fiscal_mexico.csf' })
        const onIntent = vi.fn(() => true)
        render(
            <I18nextProvider i18n={i18n}>
                <ApiProvider client={api}>
                    <LoomProvider>
                        <DynamicRecordDialog
                            open
                            onOpenChange={() => {}}
                            mode="create"
                            model="Customer"
                            endpoint="/data/Customer/me"
                            schema={{ title: 'Cliente', fields: [{ key: 'tax_id', label: 'RFC', type: 'text' }] } as never}
                            onIntent={onIntent}
                        />
                    </LoomProvider>
                </ApiProvider>
            </I18nextProvider>,
        )
        fireEvent.click(await screen.findByText('buscar', undefined, { timeout: 5000 }))
        await waitFor(() => expect(onIntent).toHaveBeenCalledWith('record.select', { record: expect.objectContaining({ id: '9' }) }))
        expect(get).toHaveBeenCalledWith('/data/Customer/me', { params: { f_tax_id: 'eq:XAXX010101000', per_page: 3 } })
    })

    it('sin permiso de listado la búsqueda se niega antes de llamar a la API', async () => {
        const get = vi.fn(async () => ({ data: { data: [] } }))
        const api = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never
        const failed = vi.fn()
        function Probe({ caps }: GraftProps) {
            return (
                <button type="button" onClick={() => void caps.records?.find({ model: 'Customer', field: 'tax_id', value: 'X' }).catch(failed)}>
                    probar
                </button>
            )
        }
        registerGraft({ id: 'x.g', seam: 'record.dialog.header', component: Probe, recordsFind: ['Customer'] })
        render(
            <I18nextProvider i18n={i18n}>
                <ApiProvider client={api}>
                    <PermissionsProvider permissions={[]} isAdmin={false}>
                        <DynamicRecordDialog open onOpenChange={() => {}} mode="create" model="Customer" schema={{ title: 'C', fields: [] } as never} />
                    </PermissionsProvider>
                </ApiProvider>
            </I18nextProvider>,
        )
        fireEvent.click(await screen.findByText('probar', undefined, { timeout: 5000 }))
        await waitFor(() => expect(failed).toHaveBeenCalled())
        expect(get.mock.calls.filter((c) => (c as unknown[])[1] !== undefined)).toHaveLength(0)
    })
})
