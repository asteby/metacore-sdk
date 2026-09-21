// @vitest-environment happy-dom
//
// Un 403 en el endpoint de lista NO debe verse como "sin resultados": se
// muestra "Sin permiso para ver este módulo" y no hay bucle de refetch.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import { DynamicCRUDPage } from '../dynamic-crud-page'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const meta = {
    title: 'Ajustes',
    endpoint: '/data/stock_adjustments',
    columns: [],
    actions: [],
    perPageOptions: [10],
    defaultPerPage: 10,
    searchPlaceholder: 'Buscar...',
    enableCRUDActions: false,
    hasActions: false,
} as unknown as TableMetadata

function mount(listBehavior: 'forbidden' | 'empty', model: string) {
    useMetadataCache.getState().setMetadata(model, meta)
    let listCalls = 0
    const client: ApiClient = {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return { data: { success: true, data: meta } }
            listCalls++
            if (listBehavior === 'forbidden') {
                throw Object.assign(new Error('403'), { response: { status: 403 } })
            }
            return { data: { success: true, data: [], meta: { total: 0 } } }
        }),
        post: vi.fn(async () => ({ data: { success: true, data: null } })),
        put: vi.fn(async () => ({ data: { success: true, data: null } })),
        delete: vi.fn(async () => ({ data: { success: true, data: null } })),
    }
    render(
        <ApiProvider client={client}>
            <DynamicCRUDPage model={model} />
        </ApiProvider>,
    )
    return () => listCalls
}

describe('DynamicTable — 403 en la lista', () => {
    it('muestra "Sin permiso" y no "No se encontraron resultados"', async () => {
        const calls = mount('forbidden', 'forb_a')
        expect((await screen.findAllByText('Sin permiso para ver este módulo')).length).toBeGreaterThan(0)
        expect(screen.queryByText('No se encontraron resultados')).toBeNull()
        await new Promise((r) => setTimeout(r, 200))
        expect(calls()).toBeLessThanOrEqual(2) // sin bucle de refetch
    })

    it('lista vacía real sigue diciendo "No se encontraron resultados"', async () => {
        mount('empty', 'forb_b')
        expect((await screen.findAllByText('No se encontraron resultados')).length).toBeGreaterThan(0)
        expect(screen.queryByText('Sin permiso para ver este módulo')).toBeNull()
    })
})
