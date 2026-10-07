// @vitest-environment happy-dom
//
// Un fallo del endpoint de lista que NO es 403 (500, red, `success: false`)
// no debe verse como "sin resultados": se muestra "No se pudieron cargar los
// datos" con "Reintentar", que vuelve a pedir la lista. `emptyState` solo
// reemplaza el vacío cuando la lista cargó bien y no hay filtros activos.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import { DynamicTable } from '../dynamic-table'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const meta = {
    title: 'Ajustes',
    endpoint: '/data/load_err',
    columns: [],
    actions: [],
    perPageOptions: [10],
    defaultPerPage: 10,
    searchPlaceholder: 'Buscar...',
    enableCRUDActions: false,
    hasActions: false,
} as unknown as TableMetadata

type ListResult = 'error500' | 'successFalse' | 'empty'

function mount(results: ListResult[], model: string, extra: Record<string, unknown> = {}) {
    useMetadataCache.getState().setMetadata(model, meta)
    let listCalls = 0
    const client: ApiClient = {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return { data: { success: true, data: meta } }
            if (url.endsWith('/facets')) return { data: { success: true, data: [] } }
            const r = results[Math.min(listCalls, results.length - 1)]
            listCalls++
            if (r === 'error500') throw Object.assign(new Error('500'), { response: { status: 500 } })
            if (r === 'successFalse') return { data: { success: false, message: 'boom' } }
            return { data: { success: true, data: [], meta: { total: 0 } } }
        }),
        post: vi.fn(async () => ({ data: { success: true, data: null } })),
        put: vi.fn(async () => ({ data: { success: true, data: null } })),
        delete: vi.fn(async () => ({ data: { success: true, data: null } })),
    }
    render(
        <ApiProvider client={client}>
            <DynamicTable model={model} enableUrlSync={false} {...extra} />
        </ApiProvider>,
    )
    return () => listCalls
}

describe('DynamicTable — fallo de la lista (no 403)', () => {
    it('un 500 muestra error con Reintentar, no "No se encontraron resultados"', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mount(['error500'], 'lerr_a')
        expect((await screen.findAllByText('No se pudieron cargar los datos')).length).toBeGreaterThan(0)
        expect(screen.queryByText('No se encontraron resultados')).toBeNull()
        expect(screen.queryByText('Sin permiso para ver este módulo')).toBeNull()
    })

    it('`success: false` también es un error de carga', async () => {
        mount(['successFalse'], 'lerr_b')
        expect((await screen.findAllByText('No se pudieron cargar los datos')).length).toBeGreaterThan(0)
    })

    it('Reintentar vuelve a pedir la lista y, si ahora carga, limpia el error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const calls = mount(['error500', 'empty'], 'lerr_c')
        const retry = (await screen.findAllByRole('button', { name: 'Reintentar' }))[0]
        const before = calls()
        fireEvent.click(retry)
        await waitFor(() => expect(calls()).toBeGreaterThan(before))
        await waitFor(() => expect(screen.queryByText('No se pudieron cargar los datos')).toBeNull())
        expect((await screen.findAllByText('No se encontraron resultados')).length).toBeGreaterThan(0)
    })
})

describe('DynamicTable — emptyState', () => {
    it('reemplaza el vacío cuando la lista cargó bien y no hay filtros', async () => {
        mount(['empty'], 'lerr_d', { emptyState: <p>Aún no hay registros</p> })
        expect((await screen.findAllByText('Aún no hay registros')).length).toBeGreaterThan(0)
        expect(screen.queryByText('No se encontraron resultados')).toBeNull()
    })

    it('no tapa un error de carga', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mount(['error500'], 'lerr_e', { emptyState: <p>Aún no hay registros</p> })
        expect((await screen.findAllByText('No se pudieron cargar los datos')).length).toBeGreaterThan(0)
        expect(screen.queryByText('Aún no hay registros')).toBeNull()
    })
})
