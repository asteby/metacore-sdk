// @vitest-environment happy-dom
//
// `isRowActionVisible` (consumer predicate) en DynamicTable y DynamicKanban:
//   1. Función pura: AND con requiresState/condition, fail-closed si lanza,
//      sin predicado = comportamiento previo.
//   2. DynamicTable: el menú «…» de una fila desaparece cuando el predicado
//      oculta todas sus acciones; sin predicado aparece en todas.
//   3. DynamicKanban: igual para el menú de la tarjeta.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N_T = (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k
const USE_TRANSLATION = { t: I18N_T, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => USE_TRANSLATION }))

import { isRowActionVisible } from '../dynamic-columns'
import { DynamicTable } from '../dynamic-table'
import { DynamicKanban } from '../dynamic-kanban'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { ActionDefinition, TableMetadata } from '../types'
import type { RowActionPredicate } from '../dynamic-columns-shim'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

const act = (over: Record<string, unknown> = {}): ActionDefinition =>
    ({ key: 'pagar', name: 'pagar', label: 'Pagar', icon: 'Zap', ...over }) as ActionDefinition

describe('isRowActionVisible (puro)', () => {
    it('sin predicado = comportamiento previo (requiresState + condition)', () => {
        const a = act({ requiresState: ['open'] })
        expect(isRowActionVisible(a, { status: 'open' })).toBe(true)
        expect(isRowActionVisible(a, { status: 'closed' })).toBe(false)
    })

    it('muestra u oculta por fila según el predicado y recibe (action, row)', () => {
        const spy = vi.fn<RowActionPredicate>((_a, row) => row.id !== 2)
        const a = act()
        expect(isRowActionVisible(a, { id: 1 }, undefined, spy)).toBe(true)
        expect(isRowActionVisible(a, { id: 2 }, undefined, spy)).toBe(false)
        expect(spy).toHaveBeenCalledWith(a, { id: 2 })
    })

    it('es AND: un predicado true no revela lo que la metadata oculta', () => {
        const a = act({ requiresState: ['open'] })
        expect(isRowActionVisible(a, { status: 'closed' }, undefined, () => true)).toBe(false)
        expect(isRowActionVisible(a, { status: 'open' }, undefined, () => false)).toBe(false)
        expect(isRowActionVisible(a, { status: 'open' }, undefined, () => true)).toBe(true)
    })

    it('si el predicado lanza, oculta la acción y registra el error', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const boom: RowActionPredicate = () => {
            throw new Error('boom')
        }
        expect(isRowActionVisible(act(), { id: 1 }, undefined, boom)).toBe(false)
        expect(err).toHaveBeenCalled()
    })
})

function meta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        columns: [{ key: 'title', label: 'Title', type: 'text', sortable: false, filterable: false, searchable: true }],
        actions: [act()],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: true,
        ...over,
    }
}

const ROWS = [
    { id: 1, title: 'Uno', stage: 'a' },
    { id: 2, title: 'Dos', stage: 'a' },
    { id: 3, title: 'Tres', stage: 'a' },
]

function fakeApi(m: TableMetadata): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total: ROWS.length } } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(m)
            if (url.endsWith('/facets')) return ok([])
            return ok(ROWS)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

const hideRow2: RowActionPredicate = (_a, row) => row.id !== 2

// La tabla pinta el layout de escritorio y el de tarjetas móviles a la vez en
// el DOM (el CSS elige uno), así que cada fila cuenta dos veces.
const LAYOUTS = 2

describe('DynamicTable isRowActionVisible', () => {
    const mount = (predicate?: RowActionPredicate) => {
        const m = meta()
        useMetadataCache.getState().setMetadata('issue', m)
        return render(
            <ApiProvider client={fakeApi(m)}>
                <DynamicTable model="issue" enableUrlSync={false} isRowActionVisible={predicate} />
            </ApiProvider>,
        )
    }

    it('sin predicado todas las filas muestran el menú', async () => {
        mount()
        await screen.findAllByText('Dos')
        expect(screen.getAllByText('Abrir menú')).toHaveLength(3 * LAYOUTS)
    })

    it('con predicado oculta el menú solo en la fila filtrada', async () => {
        mount(hideRow2)
        await screen.findAllByText('Dos')
        await waitFor(() => expect(screen.getAllByText('Abrir menú')).toHaveLength(2 * LAYOUTS))
    })

    it('un predicado que lanza no rompe la tabla: oculta las acciones', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mount(() => {
            throw new Error('boom')
        })
        await screen.findAllByText('Dos')
        expect(screen.queryAllByText('Abrir menú')).toHaveLength(0)
    })
})

describe('DynamicKanban isRowActionVisible', () => {
    const mount = (predicate?: RowActionPredicate) => {
        const m = meta({
            view_type: 'kanban',
            group_by: 'stage',
            stages: [{ key: 'a', label: 'Etapa A', color: 'slate', order: 0 }],
            columns: [
                { key: 'title', label: 'Title', type: 'text', sortable: false, filterable: false, searchable: true },
                { key: 'stage', label: 'Stage', type: 'status', sortable: false, filterable: false, options: [{ value: 'a', label: 'Etapa A', color: 'slate' }] },
            ],
        })
        useMetadataCache.getState().setMetadata('issue', m)
        return render(
            <ApiProvider client={fakeApi(m)}>
                <DynamicKanban model="issue" isRowActionVisible={predicate} />
            </ApiProvider>,
        )
    }
    const menus = (c: HTMLElement) => c.querySelectorAll('button[aria-haspopup="menu"]').length

    it('sin predicado cada tarjeta tiene su menú', async () => {
        const { container } = mount()
        await screen.findAllByText('Dos')
        expect(menus(container)).toBe(3)
    })

    it('con predicado la tarjeta filtrada pierde el menú', async () => {
        const { container } = mount(hideRow2)
        await screen.findAllByText('Dos')
        await waitFor(() => expect(menus(container)).toBe(2))
    })
})
