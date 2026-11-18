// @vitest-environment happy-dom
//
// DynamicTable bulk delete: the error toast keeps the count and adds the
// server's refusal reasons (grouped, truncated, as a string with line breaks) as `description`;
// `onBulkDeleteResult` reports the outcome per id.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
const I18N = {
    t: (_k: string, o?: { defaultValue?: string; count?: number }) => {
        if (o?.defaultValue && o.count != null) return o.defaultValue.replace('{{count}}', String(o.count))
        return o?.defaultValue ?? _k
    },
    i18n: { language: 'es' },
}
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { DynamicTable } from '../dynamic-table'
import { makeDefaultGetDynamicColumns } from '../dynamic-columns'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})
const getDynamicColumns = makeDefaultGetDynamicColumns()

function meta(): TableMetadata {
    return {
        title: 'Patients',
        endpoint: '/data/patient',
        columns: [{ key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true }],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: false,
    }
}

type Outcome = { ok: true } | { status: number; message?: string } | { softFail: string }

function fakeApi(outcomes: Record<number, Outcome>): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total: 5 } } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            return ok([1, 2, 3, 4, 5].map((id) => ({ id, title: `Row ${id}` })))
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async (url: string) => {
            const id = Number(url.split('/').pop())
            const o = outcomes[id] ?? { ok: true }
            if ('softFail' in o) return { data: { success: false, message: o.softFail } }
            if ('status' in o) {
                throw Object.assign(new Error('Request failed'), {
                    response: { status: o.status, data: o.message ? { message: o.message } : {} },
                })
            }
            return { data: { success: true } }
        }),
    }
}

async function runBulkDelete(api: ApiClient, onResult?: (r: any) => void) {
    render(
        <ApiProvider client={api}>
            <DynamicTable model="patient" enableUrlSync={false} getDynamicColumns={getDynamicColumns} onBulkDeleteResult={onResult} />
        </ApiProvider>,
    )
    await screen.findAllByText('Row 1')
    fireEvent.click(screen.getAllByRole('checkbox')[0]) // select all
    fireEvent.click(await screen.findByText('Eliminar'))
    fireEvent.click(await screen.findByText('Eliminar todos'))
    await waitFor(() => expect(toastMock.error.mock.calls.length + toastMock.success.mock.calls.length).toBeGreaterThan(0), { timeout: 5000 })
}

const MSG = 'El registro forma parte del expediente, que debe conservarse al menos 5 años'

describe('DynamicTable bulk delete reasons', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        toastMock.success.mockClear()
        toastMock.error.mockClear()
        // The component logs every failed delete; these tests fail deletes on purpose.
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        useMetadataCache.getState().setMetadata('patient', meta())
    })

    it('groups the same reason with its count and keeps the success toast', async () => {
        const onResult = vi.fn()
        await runBulkDelete(fakeApi({ 2: { status: 409, message: MSG }, 4: { status: 409, message: MSG } }), onResult)
        expect(toastMock.success).toHaveBeenCalledWith('3 registro(s) eliminado(s) correctamente')
        expect(toastMock.error).toHaveBeenCalledTimes(1)
        const [title, opts] = toastMock.error.mock.calls[0]
        expect(title).toBe('2 registro(s) no pudieron ser eliminados')
        expect(opts.description).toBe(`• ${MSG} (×2)`)
        expect(onResult).toHaveBeenCalledTimes(1)
        expect(onResult).toHaveBeenCalledWith({
            succeeded: [1, 3, 5],
            failed: [{ id: 2, message: MSG, status: 409 }, { id: 4, message: MSG, status: 409 }],
        })
    })

    it('lists distinct reasons, including a soft failure message', async () => {
        await runBulkDelete(fakeApi({ 1: { status: 409, message: 'Motivo A' }, 2: { softFail: 'Motivo B' } }))
        expect(toastMock.error.mock.calls[0][1].description).toBe('• Motivo A\n• Motivo B')
    })

    it('shows "y N más" past three distinct reasons', async () => {
        await runBulkDelete(fakeApi({
            1: { status: 409, message: 'R1' }, 2: { status: 409, message: 'R2' },
            3: { status: 409, message: 'R3' }, 4: { status: 409, message: 'R4' }, 5: { status: 409, message: 'R5' },
        }))
        expect(toastMock.error.mock.calls[0][1].description).toBe('• R1\n• R2\n• R3\ny 2 más')
    })

    it('truncates long reasons', async () => {
        await runBulkDelete(fakeApi({ 1: { status: 409, message: 'x'.repeat(500) } }))
        const d: string = toastMock.error.mock.calls[0][1].description
        expect(d.length).toBeLessThanOrEqual(2 + 200)
        expect(d.endsWith('…')).toBe(true)
    })

    it('leaves the toast exactly as before when the server gave no message', async () => {
        const onResult = vi.fn()
        const api = fakeApi({ 1: { status: 500 } })
        ;(api.delete as any).mockImplementationOnce(async () => { throw new Error('') })
        await runBulkDelete(api, onResult)
        expect(toastMock.error).toHaveBeenCalledTimes(1)
        expect(toastMock.error.mock.calls[0].length).toBe(2)
        expect(toastMock.error.mock.calls[0][1]).toBeUndefined()
        expect(onResult.mock.calls[0][0].failed[0]).toMatchObject({ id: 1 })
        expect(onResult.mock.calls[0][0].failed[0].message).toBeUndefined()
    })

    it('works without onBulkDeleteResult', async () => {
        await runBulkDelete(fakeApi({ 2: { status: 409, message: MSG } }))
        expect(toastMock.error).toHaveBeenCalledTimes(1)
    })

    it('passes server HTML through as plain text', async () => {
        const evil = '<img src=x onerror=alert(1)>'
        await runBulkDelete(fakeApi({ 1: { status: 409, message: evil } }))
        const d = toastMock.error.mock.calls[0][1].description
        expect(typeof d).toBe('string')
        expect(d).toBe(`• ${evil}`)
    })

    it('ignores generic axios messages as a reason', async () => {
        const onResult = vi.fn()
        const api = fakeApi({})
        ;(api.delete as any).mockImplementationOnce(async () => { throw new Error('Request failed with status code 500') })
        ;(api.delete as any).mockImplementationOnce(async () => { throw new Error('Network Error') })
        ;(api.delete as any).mockImplementationOnce(async () => { throw new Error('timeout of 5000ms exceeded') })
        await runBulkDelete(api, onResult)
        expect(toastMock.error.mock.calls[0][1]).toBeUndefined()
        for (const f of onResult.mock.calls[0][0].failed) expect(f.message).toBeUndefined()
    })

    it('prefers the server message over the generic axios one', async () => {
        const api = fakeApi({})
        ;(api.delete as any).mockImplementationOnce(async () => {
            throw Object.assign(new Error('Request failed with status code 409'), { response: { status: 409, data: { message: 'Motivo real' } } })
        })
        await runBulkDelete(api)
        expect(toastMock.error.mock.calls[0][1].description).toBe('• Motivo real')
    })

    it('counts a cancelled reason prompt as a failure without message or description', async () => {
        const onResult = vi.fn()
        const api = fakeApi({})
        ;(api.delete as any).mockImplementationOnce(async () => {
            throw Object.assign(new Error('x'), {
                response: { status: 422, data: { errors: { reason: [{ code: 'required', params: { min: 3 } }] } } },
            })
        })
        render(
            <ApiProvider client={api}>
                <DynamicTable model="patient" enableUrlSync={false} getDynamicColumns={getDynamicColumns} onBulkDeleteResult={onResult} />
            </ApiProvider>,
        )
        await screen.findAllByText('Row 1')
        fireEvent.click(screen.getAllByRole('checkbox')[0])
        fireEvent.click(await screen.findByText('Eliminar'))
        fireEvent.click(await screen.findByText('Eliminar todos'))
        const cancel = await screen.findByPlaceholderText('Explica por qué. Queda en la bitácora.')
        expect(cancel).toBeTruthy()
        const dialog = cancel.closest('[role="dialog"]') as HTMLElement
        fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Cancelar')!)
        await waitFor(() => expect(toastMock.error).toHaveBeenCalled(), { timeout: 5000 })
        expect(toastMock.error.mock.calls[0][0]).toBe('5 registro(s) no pudieron ser eliminados')
        expect(toastMock.error.mock.calls[0][1]).toBeUndefined()
        const { succeeded, failed } = onResult.mock.calls[0][0]
        expect(succeeded).toEqual([])
        expect(failed.map((f: any) => f.id)).toEqual([1, 2, 3, 4, 5])
        for (const f of failed) expect(f.message).toBeUndefined()
        expect(api.delete).toHaveBeenCalledTimes(1)
    })

    it('still refreshes the table when onBulkDeleteResult throws, with no unhandled rejection', async () => {
        const unhandled = vi.fn()
        process.on('unhandledRejection', unhandled)
        const api = fakeApi({ 2: { status: 409, message: MSG } })
        const listCalls = () => (api.get as any).mock.calls.filter(([u]: [string]) => !u.startsWith('/metadata/') && !u.endsWith('/facets')).length
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            let before = -1
            await runBulkDelete(api, () => { before = listCalls(); throw new Error('boom') })
            expect(before).toBeGreaterThan(0)
            await waitFor(() => expect(listCalls()).toBeGreaterThan(before), { timeout: 5000 })
            await new Promise((r) => setTimeout(r, 50))
            expect(unhandled).not.toHaveBeenCalled()
            expect(err.mock.calls.some((c) => String(c[0]).includes('onBulkDeleteResult'))).toBe(true)
        } finally {
            process.off('unhandledRejection', unhandled)
            err.mockRestore()
        }
    })
})
