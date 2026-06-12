// @vitest-environment happy-dom
//
// Gating de permisos sobre las superficies CRUD dinámicas:
//   1. `gateTableMetadata` (puro) — export/import, row actions custom y el
//      trío implícito View/Edit/Delete filtrados por capability.
//   2. <DynamicCRUDPage> — el botón Crear desaparece sin `model.create`
//      cuando hay <PermissionsProvider>; sin provider todo sigue visible.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// DynamicTable usa useNavigate; el test no navega, así que basta un stub.
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

import { gateTableMetadata, makeCan, PermissionsProvider } from '../permissions-context'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import { DynamicCRUDPage } from '../dynamic-crud-page'
import type { TableMetadata, ActionDefinition } from '../types'

// Sin `globals: true` en vitest, RTL no auto-limpia entre tests.
afterEach(cleanup)

function baseMeta(over: Partial<TableMetadata> = {}): TableMetadata {
    return {
        title: 'Pedidos',
        endpoint: '/data/pos_orders',
        columns: [],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: true,
        hasActions: false,
        canExport: true,
        canImport: true,
        ...over,
    }
}

const action = (key: string, placement?: ActionDefinition['placement']): ActionDefinition =>
    ({ key, name: key, label: key, icon: 'Zap', placement }) as ActionDefinition

describe('gateTableMetadata', () => {
    it('apaga canExport/canImport sin capability', () => {
        const can = makeCan(['pos_orders.export'], false)
        const gated = gateTableMetadata(baseMeta(), 'pos_orders', can)
        expect(gated.canExport).toBe(true)
        expect(gated.canImport).toBe(false)
    })

    it('filtra row actions custom por can(model.key)', () => {
        const meta = baseMeta({
            actions: [action('pagar'), action('cancelar')],
            hasActions: true,
        })
        const can = makeCan(['pos_orders.pagar'], false)
        const gated = gateTableMetadata(meta, 'pos_orders', can)
        expect(gated.actions.map((a) => a.key)).toEqual(['pagar'])
    })

    it('mapea edit→update, delete→delete, view→index en actions explícitas', () => {
        const meta = baseMeta({
            actions: [action('view'), action('edit'), action('delete')],
            hasActions: true,
        })
        const can = makeCan(['pos_orders.index', 'pos_orders.update'], false)
        const gated = gateTableMetadata(meta, 'pos_orders', can)
        expect(gated.actions.map((a) => a.key)).toEqual(['view', 'edit'])
    })

    it('materializa el trío implícito CRUD y filtra sus entradas', () => {
        // Sin actions explícitas + enableCRUDActions → trío View/Edit/Delete.
        const can = makeCan(['pos_orders.index', 'pos_orders.delete'], false)
        const gated = gateTableMetadata(baseMeta(), 'pos_orders', can)
        expect(gated.actions.map((a) => a.key)).toEqual(['view', 'delete'])
        expect(gated.hasActions).toBe(true)
        expect(gated.enableCRUDActions).toBe(true)
    })

    it('todo denegado → sin actions y sin trío re-sintetizado aguas abajo', () => {
        const can = makeCan([], false)
        const gated = gateTableMetadata(baseMeta(), 'pos_orders', can)
        expect(gated.actions).toEqual([])
        expect(gated.hasActions).toBe(false)
        expect(gated.enableCRUDActions).toBe(false)
        expect(gated.canExport).toBe(false)
        expect(gated.canImport).toBe(false)
    })

    it('admin/wildcard → metadata intacta en lo visible', () => {
        const meta = baseMeta({ actions: [action('pagar')], hasActions: true })
        const gated = gateTableMetadata(meta, 'pos_orders', makeCan([], true))
        expect(gated.actions.map((a) => a.key)).toEqual(['pagar'])
        expect(gated.canExport).toBe(true)
        expect(gated.canImport).toBe(true)
    })
})

describe('DynamicCRUDPage — botón Crear', () => {
    function fakeApi(meta: TableMetadata): ApiClient {
        const ok = (data: unknown) => ({ data: { success: true, data, meta: { total: 0 } } })
        return {
            get: vi.fn(async (url: string) => {
                if (url.startsWith('/metadata/table/')) return ok(meta)
                return ok([])
            }),
            post: vi.fn(async () => ok(null)),
            put: vi.fn(async () => ok(null)),
            delete: vi.fn(async () => ok(null)),
        }
    }

    function mount(model: string, permissions: string[] | null) {
        const meta = baseMeta({ title: 'Pedidos', canExport: false, canImport: false })
        useMetadataCache.getState().setMetadata(model, meta)
        const page = <DynamicCRUDPage model={model} />
        return render(
            <ApiProvider client={fakeApi(meta)}>
                {permissions === null ? (
                    page
                ) : (
                    <PermissionsProvider permissions={permissions} isAdmin={false}>
                        {page}
                    </PermissionsProvider>
                )}
            </ApiProvider>,
        )
    }

    it('sin provider → Crear visible (comportamiento actual)', async () => {
        mount('orders_a', null)
        expect(await screen.findByText(/New Pedido/)).toBeTruthy()
    })

    it('con provider y sin model.create → Crear oculto', async () => {
        mount('orders_b', ['orders_b.index'])
        expect(await screen.findByText('Pedidos')).toBeTruthy()
        expect(screen.queryByText(/New Pedido/)).toBeNull()
    })

    it('con provider y model.create otorgado → Crear visible', async () => {
        mount('orders_c', ['orders_c.index', 'orders_c.create'])
        expect(await screen.findByText(/New Pedido/)).toBeTruthy()
    })
})
