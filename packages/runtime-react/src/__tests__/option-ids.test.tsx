// @vitest-environment happy-dom
//
// RecordPicker editing a saved value: the label comes from ONE `?ids=` lookup
// (useResolveOptionIds) without opening the popover — batched per ref, shared
// between pickers, skipped with a seed, "(registro eliminado)" for a gone id
// and the raw value when the host predates `ids`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => {
    const value = { t: (k: string, o?: Record<string, any>) => o?.defaultValue ?? k, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { DynamicSelectField } from '../dynamic-select-field'
import { DynamicMultiSelectField } from '../dynamic-multi-select-field'
import { ApiProvider, type ApiClient } from '../api-context'
import { invalidateOptionsCache } from '../use-options-resolver'
import type { ActionFieldDef } from '../types'

afterEach(() => {
    cleanup()
    invalidateOptionsCache()
})

let seq = 0
/** Fresh ids per test: the id-label cache is module-wide on purpose. */
const uid = (p: string) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 8)}`

type Row = { id: string; label: string }

/** A host that understands `ids`: answers exactly the requested rows it has. */
function idsHost(rows: Row[], page: Row[] = rows) {
    const get = vi.fn(async (_url: string, config?: { params?: Record<string, unknown> }) => {
        const ids = config?.params?.ids
        if (typeof ids === 'string') {
            const want = ids.split(',')
            return { data: { success: true, data: rows.filter((r) => want.includes(r.id)), meta: { type: 'dynamic' } } }
        }
        return { data: { success: true, data: page, meta: { type: 'dynamic' } } }
    })
    // batch=false: no POST /q in these tests (ids reads bypass it anyway).
    const api = { get, post: vi.fn(async () => ({ data: {} })), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
    return { api, get, idsCalls: () => get.mock.calls.filter(([, c]) => typeof c?.params?.ids === 'string') }
}

const brand: ActionFieldDef = { key: 'brand_id', label: 'Marca', type: 'dynamic_select', ref: 'Brand' }

describe('RecordPicker: etiqueta de un valor guardado por ?ids=', () => {
    it('sin semilla → una sola petición ids y muestra el nombre sin abrir el popover', async () => {
        const id = uid('b')
        const host = idsHost([{ id, label: 'Michelin' }])
        render(
            <ApiProvider client={host.api}>
                <DynamicSelectField field={brand} value={id} onChange={vi.fn()} />
            </ApiProvider>,
        )
        // Mientras resuelve: "Cargando…", nunca el UUID.
        expect(screen.getByText('Cargando…')).toBeTruthy()
        expect(screen.queryByText(id)).toBeNull()
        expect(await screen.findByText('Michelin')).toBeTruthy()
        expect(host.get).toHaveBeenCalledTimes(1)
        expect(host.get).toHaveBeenCalledWith('/options/Brand', { params: { field: 'id', ids: id } })
        expect(document.querySelector('[data-slot="record-picker-content"]')).toBeNull()
    })

    it('dos pickers de la misma ref (y uno repetido) → UNA petición con todos los ids', async () => {
        const a = uid('b')
        const b = uid('b')
        const host = idsHost([
            { id: a, label: 'Michelin' },
            { id: b, label: 'Pirelli' },
        ])
        render(
            <ApiProvider client={host.api}>
                <DynamicSelectField field={brand} value={a} onChange={vi.fn()} />
                <DynamicSelectField field={{ ...brand, key: 'alt_brand_id' }} value={b} onChange={vi.fn()} />
                <DynamicSelectField field={{ ...brand, key: 'other_brand_id' }} value={a} onChange={vi.fn()} />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getAllByText('Michelin')).toHaveLength(2))
        expect(screen.getByText('Pirelli')).toBeTruthy()
        expect(host.get).toHaveBeenCalledTimes(1)
        const ids = String(host.idsCalls()[0][1].params.ids).split(',').sort()
        expect(ids).toEqual([a, b].sort())
    })

    it('con semilla → cero peticiones', async () => {
        const id = uid('b')
        const host = idsHost([{ id, label: 'Michelin' }])
        render(
            <ApiProvider client={host.api}>
                <DynamicSelectField
                    field={brand}
                    value={id}
                    onChange={vi.fn()}
                    seedOption={{ id, value: id, label: 'Bridgestone', name: 'Bridgestone' }}
                />
            </ApiProvider>,
        )
        expect(screen.getByText('Bridgestone')).toBeTruthy()
        await new Promise((r) => setTimeout(r, 30))
        expect(host.get).not.toHaveBeenCalled()
    })

    it('id que ya no existe → «(registro eliminado)» sutil, no el UUID', async () => {
        const id = uid('b')
        const host = idsHost([])
        render(
            <ApiProvider client={host.api}>
                <DynamicSelectField field={brand} value={id} onChange={vi.fn()} />
            </ApiProvider>,
        )
        const missing = await screen.findByText('(registro eliminado)')
        expect(missing.getAttribute('data-slot')).toBe('record-picker-value-missing')
        expect(screen.queryByText(id)).toBeNull()
    })

    it('host sin soporte de ids (responde una página): filtra por id; si no está, muestra el valor como antes', async () => {
        const known = uid('b')
        const unknown = uid('b')
        const page = [
            { id: known, label: 'Michelin' },
            { id: uid('x'), label: 'Otra' },
        ]
        // Ignores `ids` entirely.
        const get = vi.fn(async () => ({ data: { success: true, data: page } }))
        const api = { get, post: vi.fn(async () => ({ data: {} })), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
        render(
            <ApiProvider client={api}>
                <DynamicSelectField field={brand} value={known} onChange={vi.fn()} />
                <DynamicSelectField field={{ ...brand, key: 'b2' }} value={unknown} onChange={vi.fn()} />
            </ApiProvider>,
        )
        expect(await screen.findByText('Michelin')).toBeTruthy()
        expect(await screen.findByText(unknown)).toBeTruthy()
        expect(screen.queryByText('(registro eliminado)')).toBeNull()
    })

    it('usa el QueryClient del host cuando hay QueryClientProvider', async () => {
        const id = uid('b')
        const host = idsHost([{ id, label: 'Goodyear' }])
        const client = new QueryClient()
        render(
            <QueryClientProvider client={client}>
                <ApiProvider client={host.api}>
                    <DynamicSelectField field={brand} value={id} onChange={vi.fn()} />
                </ApiProvider>
            </QueryClientProvider>,
        )
        expect(await screen.findByText('Goodyear')).toBeTruthy()
        expect(client.getQueryCache().findAll({ queryKey: ['metacore-option-ids'] })).toHaveLength(1)
    })

    it('múltiple: los ids fuera de la página se resuelven en una petición; el borrado se marca', async () => {
        const inPage = uid('t')
        const outside = uid('t')
        const gone = uid('t')
        const host = idsHost(
            [
                { id: inPage, label: 'Mayoreo' },
                { id: outside, label: 'Flotillas' },
            ],
            [{ id: inPage, label: 'Mayoreo' }],
        )
        const field: ActionFieldDef = { key: 'segment_ids', label: 'Segmentos', type: 'dynamic_select', ref: 'Segment', multiple: true }
        render(
            <ApiProvider client={host.api} batch={false}>
                <DynamicMultiSelectField field={field} value={[inPage, outside, gone]} onChange={vi.fn()} />
            </ApiProvider>,
        )
        expect(await screen.findByText('Flotillas')).toBeTruthy()
        expect(screen.getByText('Mayoreo')).toBeTruthy()
        expect(await screen.findByText('(registro eliminado)')).toBeTruthy()
        expect(screen.queryByText(outside)).toBeNull()
        const calls = host.idsCalls()
        expect(calls).toHaveLength(1)
        expect(String(calls[0][1].params.ids).split(',').sort()).toEqual([outside, gone].sort())
    })
})
