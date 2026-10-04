// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    return { useTranslation: () => ({ t, i18n }) }
})

import { resolveListPrimaryAction } from '../list-primary-action'
import { ModelActionToolbar } from '../model-action-toolbar'
import { DynamicCRUDPage } from '../dynamic-crud-page'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import { clearModelExtensions, registerModelExtension } from '../model-extension-registry'
import type { ActionDefinition, TableMetadata } from '../types'

afterEach(() => {
    cleanup()
    clearModelExtensions()
})

const act = (key: string, extra: Partial<ActionDefinition> = {}): ActionDefinition =>
    ({ key, name: key, label: key, icon: 'Plus', ...extra }) as ActionDefinition

describe('resolveListPrimaryAction', () => {
    it('con CRUD y sin acciones deja el Crear genérico', () => {
        const r = resolveListPrimaryAction({ enableCRUD: true, actions: [] })
        expect(r.showGenericCreate).toBe(true)
        expect(r.primaryAction).toBeUndefined()
        expect(r.conflict).toBe(false)
    })

    it('replaces_create oculta el genérico y esa acción es la primaria', () => {
        const quote = act('nueva_cotizacion', { placement: 'table', replaces_create: true, label: 'Nueva cotización' })
        const r = resolveListPrimaryAction({ enableCRUD: true, actions: [quote] })
        expect(r.showGenericCreate).toBe(false)
        expect(r.primaryAction?.key).toBe('nueva_cotizacion')
    })

    it('create_mode hidden y canCreate false ocultan el genérico', () => {
        expect(resolveListPrimaryAction({ enableCRUD: true, createMode: 'hidden' }).showGenericCreate).toBe(false)
        expect(resolveListPrimaryAction({ enableCRUD: true, canCreate: false }).showGenericCreate).toBe(false)
        expect(resolveListPrimaryAction({ enableCRUD: true, createMode: 'action' }).showGenericCreate).toBe(false)
        expect(resolveListPrimaryAction({ enableCRUD: false }).showGenericCreate).toBe(false)
    })

    it('dos placement create: una sola primaria, la primera o primaryActionKey', () => {
        const a = act('a', { placement: 'create' })
        const b = act('b', { placement: 'create' })
        const r = resolveListPrimaryAction({ enableCRUD: true, actions: [a, b] })
        expect(r.conflict).toBe(true)
        expect(r.showGenericCreate).toBe(false)
        expect(r.primaryAction?.key).toBe('a')
        expect(r.secondaryActions.map((x) => x.key)).toEqual(['b'])
        const picked = resolveListPrimaryAction({ enableCRUD: true, actions: [a, b], primaryActionKey: 'b' })
        expect(picked.primaryAction?.key).toBe('b')
    })
})

describe('una sola data-primary', () => {
    it('dos acciones create pintan un solo botón primario', () => {
        render(
            <ApiProvider client={stubApi()}>
                <ModelActionToolbar
                    model="Pedido"
                    actions={[
                        act('a', { placement: 'create', label: 'Crear A' }),
                        act('b', { placement: 'create', label: 'Crear B' }),
                    ]}
                />
            </ApiProvider>,
        )
        expect(document.querySelectorAll('[data-primary="true"]')).toHaveLength(1)
        expect(screen.getByText('Crear A').closest('button')?.getAttribute('data-primary')).toBe('true')
        expect(screen.getByText('Crear B').closest('button')?.getAttribute('data-primary')).toBeNull()
    })

    it('replaces_create quita el Crear genérico de la página', async () => {
        const model = 'cotizaciones'
        const meta = metaFor(model, {
            actions: [act('nueva', { placement: 'table', replaces_create: true, label: 'Nueva cotización' })],
        })
        useMetadataCache.getState().setMetadata(model, meta)
        render(
            <ApiProvider client={stubApi(meta)}>
                <DynamicCRUDPage model={model} />
            </ApiProvider>,
        )
        expect(await screen.findByText('Nueva cotización')).toBeTruthy()
        expect(screen.queryByText(/New Cotizacione/)).toBeNull()
        expect(document.querySelectorAll('[data-primary="true"]')).toHaveLength(1)
    })

    it('create_mode hidden quita el Crear genérico', async () => {
        const model = 'facturas'
        const meta = metaFor(model, { create_mode: 'hidden', actions: [] })
        useMetadataCache.getState().setMetadata(model, meta)
        render(
            <ApiProvider client={stubApi(meta)}>
                <DynamicCRUDPage model={model} />
            </ApiProvider>,
        )
        expect(await screen.findByText('Facturas')).toBeTruthy()
        expect(screen.queryByText(/New /)).toBeNull()
        expect(document.querySelectorAll('[data-primary="true"]')).toHaveLength(0)
    })

    it('la extensión createMode hidden también lo quita', async () => {
        const model = 'notas'
        registerModelExtension(model, { createMode: 'hidden' })
        const meta = metaFor(model)
        useMetadataCache.getState().setMetadata(model, meta)
        render(
            <ApiProvider client={stubApi(meta)}>
                <DynamicCRUDPage model={model} />
            </ApiProvider>,
        )
        expect(await screen.findByText('Notas')).toBeTruthy()
        expect(screen.queryByText(/New /)).toBeNull()
    })
})

function metaFor(model: string, over: Partial<TableMetadata> = {}): TableMetadata {
    void model
    return {
        title: over.title ?? (model === 'cotizaciones' ? 'Cotizaciones' : model === 'facturas' ? 'Facturas' : 'Notas'),
        endpoint: '/data/x',
        columns: [],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar',
        enableCRUDActions: true,
        hasActions: false,
        canExport: false,
        canImport: false,
        ...over,
    }
}

function stubApi(meta?: TableMetadata): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total: 0 } } })
    return {
        get: vi.fn(async (url: string) => {
            if (url.startsWith('/metadata/table/')) return ok(meta ?? { actions: [] })
            return ok([])
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}
