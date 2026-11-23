// @vitest-environment happy-dom
//
// Widgets de relación: `relation.widget` registrado pinta el componente del host
// en lugar de la tabla inline; recibe los valores vivos del padre, el mercado de la
// sucursal activa y los errores 422 por fila; sus filas viajan en `_children`.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider, BranchProvider } from '../api-context'
import { makeDraftRow } from '../draft-rows'
import {
    clearRelationWidgets,
    getRelationWidget,
    listRelationWidgets,
    registerRelationWidget,
    type RelationWidgetProps,
} from '../relation-widget-registry'
import { clearFieldWidgets, getFieldWidget, registerFieldWidget } from '../field-widget-registry'
import { clearActiveMarketCache, normalizeMarketCode, useActiveMarket } from '../use-active-market'

afterEach(() => {
    cleanup()
    clearRelationWidgets()
    clearFieldWidgets()
    clearActiveMarketCache()
})

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
}

const parentSchema = {
    title: 'Producto',
    fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
}

const itemModal = {
    fields: [
        { key: 'product_id', label: 'Producto', type: 'text' },
        { key: 'price_list_id', label: 'Lista', type: 'text', required: true },
        { key: 'price', label: 'Precio', type: 'number', required: true },
    ],
}

const prices = {
    name: 'market_prices',
    kind: 'one_to_many',
    through: 'PriceListItem',
    foreign_key: 'product_id',
    label: 'Precios por mercado',
    create_inline: true,
    widget: 'market-prices',
    addon: 'products',
}

function makeApi(relations: any[], branch?: Record<string, unknown>) {
    return {
        get: vi.fn(async (url: string) => {
            if (url === '/metadata/table/Product') return { data: { data: { relations } } }
            if (url === '/metadata/modal/PriceListItem') return { data: { data: itemModal } }
            if (url.startsWith('/data/branches/') && branch) return { data: { data: branch } }
            return { data: { data: {} } }
        }),
        post: vi.fn(async (_url: string, _body: unknown) => ({ data: { success: true, data: { id: '1' } } })),
        put: async () => ({ data: { success: true } }),
        delete: async () => ({ data: { success: true } }),
    }
}

function setup(api: any, opts: { onCreate?: any; branchId?: string } = {}) {
    const dialog = (
        <DynamicRecordDialog
            open
            onOpenChange={() => {}}
            mode="create"
            model="Product"
            schema={parentSchema as never}
            onCreate={opts.onCreate}
        />
    )
    render(
        <I18nextProvider i18n={makeI18n()}>
            <ApiProvider client={api as never}>
                {opts.branchId ? <BranchProvider branch={{ id: opts.branchId }}>{dialog}</BranchProvider> : dialog}
            </ApiProvider>
        </I18nextProvider>,
    )
}

const submit = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement)
const fillName = (v = 'Whey') =>
    fireEvent.change(document.querySelector('[data-aby-field="name"] input') as HTMLElement, { target: { value: v } })

// Widget de prueba: una fila por mercado, calcula con el valor vivo `name` del padre.
function Probe(p: RelationWidgetProps) {
    return (
        <div data-testid="probe">
            <span data-testid="live">{String(p.values.name ?? '')}</span>
            <span data-testid="market">{p.context.market ?? '-'}</span>
            <span data-testid="branch">{String(p.context.branchId ?? '-')}</span>
            <span data-testid="fields">{p.fields.map((f) => f.key).join(',')}</span>
            <span data-testid="rows">{p.rows.length}</span>
            <span data-testid="err">{p.errors?.['0.price'] ?? ''}</span>
            <button type="button" onClick={() => p.onChange([makeDraftRow({ price_list_id: 'L1', price: '69.99' })])}>
                set
            </button>
            <button type="button" disabled={p.readOnly} onClick={() => p.onCellEdited?.(0, 'price')}>
                edit
            </button>
        </div>
    )
}

describe('registro de widgets de relación', () => {
    it('registra, resuelve, lista y limpia; el disposer viejo no toca al nuevo', () => {
        const A = () => null
        const B = () => null
        const disposeA = registerRelationWidget('x', A)
        expect(getRelationWidget('x')).toBe(A)
        expect(listRelationWidgets()).toEqual(['x'])
        registerRelationWidget('x', B)
        disposeA()
        expect(getRelationWidget('x')).toBe(B)
        expect(getRelationWidget(undefined)).toBeUndefined()
        expect(getRelationWidget('nope')).toBeUndefined()
        clearRelationWidgets()
        expect(listRelationWidgets()).toEqual([])
    })

    it('el registro de widgets de campo sigue funcionando sobre la misma fábrica', () => {
        const F = () => null
        const dispose = registerFieldWidget('map-pin', F)
        expect(getFieldWidget('map-pin')).toBe(F)
        dispose()
        expect(getFieldWidget('map-pin')).toBeUndefined()
    })
})

describe('DynamicRecordDialog create — widget de relación', () => {
    it('pinta el widget registrado en lugar de la tabla, con valores vivos y campos del hijo', async () => {
        registerRelationWidget('market-prices', Probe)
        setup(makeApi([prices]))
        await screen.findByTestId('probe')
        expect(document.querySelector('[data-slot="inline-relation-rows"]')).toBeNull()
        expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
        // FK al padre fuera; lo capturable queda.
        expect(screen.getByTestId('fields').textContent).toBe('price_list_id,price')
        expect(screen.getByTestId('live').textContent).toBe('')
        fillName('Creatine')
        await waitFor(() => expect(screen.getByTestId('live').textContent).toBe('Creatine'))
    })

    it('las filas del widget viajan en _children igual que las de la tabla', async () => {
        registerRelationWidget('market-prices', Probe)
        const onCreate = vi.fn(async (_b: Record<string, unknown>) => ({ id: '1' }))
        setup(makeApi([prices]), { onCreate })
        fireEvent.click(await screen.findByRole('button', { name: 'set' }))
        fillName()
        submit()
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
        expect(onCreate.mock.calls[0][0]).toMatchObject({
            name: 'Whey',
            _children: { market_prices: [{ price_list_id: 'L1', price: 69.99 }] },
        })
    })

    it('cae a la tabla inline si el widget no está registrado', async () => {
        setup(makeApi([prices]))
        await screen.findByRole('heading', { name: 'Precios por mercado' })
        expect(screen.queryByTestId('probe')).toBeNull()
        expect(screen.getByRole('button', { name: /Agregar/ })).toBeTruthy()
    })

    it('un widget que se registra tarde reemplaza a la tabla sin recargar', async () => {
        setup(makeApi([prices]))
        await screen.findByRole('button', { name: /Agregar/ })
        act(() => {
            registerRelationWidget('market-prices', Probe)
        })
        await screen.findByTestId('probe')
        expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
    })

    it('el 422 por fila llega al widget y la validación del cliente sigue bloqueando', async () => {
        registerRelationWidget('market-prices', Probe)
        const api = makeApi([prices])
        const base = api.post.getMockImplementation()!
        api.post.mockImplementation(async (url: string, body: unknown) => {
            if (url !== '/dynamic/Product') return base(url, body)
            throw {
                response: { status: 422, data: { errors: { '_children.market_prices.0.price': [{ code: 'invalid_type' }] } } },
            }
        })
        setup(api)
        fireEvent.click(await screen.findByRole('button', { name: 'set' }))
        fillName()
        submit()
        await waitFor(() => expect(screen.getByTestId('err').textContent).toMatch(/formato inválido/))
        // El widget avisa que editó la celda: el error se limpia.
        fireEvent.click(screen.getByRole('button', { name: 'edit' }))
        await waitFor(() => expect(screen.getByTestId('err').textContent).toBe(''))
    })

    it('un widget con filas incompletas no envía: requeridos del hijo', async () => {
        registerRelationWidget('market-prices', (p) => (
            <button type="button" onClick={() => p.onChange([makeDraftRow({ price_list_id: 'L1' })])}>
                half
            </button>
        ))
        const onCreate = vi.fn()
        setup(makeApi([prices]), { onCreate })
        fireEvent.click(await screen.findByRole('button', { name: 'half' }))
        fillName()
        submit()
        await new Promise((r) => setTimeout(r, 30))
        expect(onCreate).not.toHaveBeenCalled()
    })

    it('entrega el mercado de la sucursal activa (branches.market_code) al widget', async () => {
        registerRelationWidget('market-prices', Probe)
        const api = makeApi([prices], { id: 'b-us', market_code: 'US' })
        setup(api, { branchId: 'b-us' })
        await waitFor(() => expect(screen.getByTestId('market').textContent).toBe('us'))
        expect(screen.getByTestId('branch').textContent).toBe('b-us')
        expect(api.get).toHaveBeenCalledWith('/data/branches/b-us')
    })

    it('sin widget registrado no consulta la sucursal', async () => {
        const api = makeApi([prices], { id: 'b-us', market_code: 'us' })
        setup(api, { branchId: 'b-us' })
        await screen.findByRole('heading', { name: 'Precios por mercado' })
        expect(api.get.mock.calls.some((c) => String(c[0]).startsWith('/data/branches/'))).toBe(false)
    })
})

describe('useActiveMarket', () => {
    const wrap =
        (api: any, id?: string | null) =>
        ({ children }: { children: React.ReactNode }) => (
            <ApiProvider client={api as never}>
                <BranchProvider branch={{ id }}>{children}</BranchProvider>
            </ApiProvider>
        )

    it('sin sucursal: sin mercado y sin petición', () => {
        const api = makeApi([])
        const { result } = renderHook(() => useActiveMarket(), { wrapper: wrap(api, undefined) })
        expect(result.current).toEqual({ branchId: undefined, market: null, loading: false })
        expect(api.get).not.toHaveBeenCalled()
    })

    it('resuelve y cachea por sucursal (una sola petición)', async () => {
        const api = makeApi([], { market_code: ' MX ' })
        const first = renderHook(() => useActiveMarket(), { wrapper: wrap(api, 'b1') })
        expect(first.result.current.loading).toBe(true)
        await waitFor(() => expect(first.result.current.market).toBe('mx'))
        const second = renderHook(() => useActiveMarket(), { wrapper: wrap(api, 'b1') })
        expect(second.result.current.market).toBe('mx')
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('un error o una sucursal sin mercado dan null, no se reintenta en bucle', async () => {
        const api = { ...makeApi([]), get: vi.fn(async () => { throw new Error('403') }) }
        const { result } = renderHook(() => useActiveMarket(), { wrapper: wrap(api, 'b2') })
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.market).toBeNull()
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('enabled:false no consulta', () => {
        const api = makeApi([], { market_code: 'mx' })
        const { result } = renderHook(() => useActiveMarket({ enabled: false }), { wrapper: wrap(api, 'b3') })
        expect(result.current.market).toBeNull()
        expect(api.get).not.toHaveBeenCalled()
    })

    it('normaliza códigos', () => {
        expect(normalizeMarketCode(' US ')).toBe('us')
        expect(normalizeMarketCode('')).toBeNull()
        expect(normalizeMarketCode(undefined)).toBeNull()
        expect(normalizeMarketCode(5)).toBeNull()
    })
})
