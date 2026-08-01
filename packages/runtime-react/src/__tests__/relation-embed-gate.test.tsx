// @vitest-environment happy-dom
//
// Dos contratos de las sub-tablas de relación:
//   1. El MODAL de registro embebe SOLO las relaciones de composición (`embed`).
//      Antes embebía todas las one_to_many, así que abrir un almacén arrastraba
//      miles de existencias y traspasos adentro del formulario.
//   2. La sub-tabla 1:N pagina server-side (page/per_page) en vez de pedir el
//      modelo hijo entero.
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ApiProvider, type ApiClient } from '../api-context'
import { DynamicRelations, isEmbedded } from '../dynamic-relations'
import type { RelationMeta } from '../types'

const items: RelationMeta = {
    name: 'items',
    kind: 'one_to_many',
    through: 'OrderItem',
    foreign_key: 'order_id',
    embed: true,
}
const movements: RelationMeta = {
    name: 'movements',
    kind: 'one_to_many',
    through: 'StockMovement',
    foreign_key: 'order_id',
}

// api.get sirve metadata para cualquier modelo y una página de datos con
// meta.total, que es lo que la sub-tabla usa para decidir si hay más.
function makeApi(total = 0) {
    const get = vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/metadata/table/')) {
            return Promise.resolve({
                data: {
                    success: true,
                    data: {
                        columns: [{ key: 'name', label: 'Nombre', type: 'text' }],
                        actions: [],
                    },
                },
            })
        }
        return Promise.resolve({ data: { success: true, data: [], meta: { total } } })
    })
    return {
        api: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient,
        get,
    }
}

function renderRelations({ total, ...props }: any) {
    const { api, get } = makeApi(total ?? 0)
    const utils = render(
        <ApiProvider client={api}>
            <DynamicRelations record={{ id: 'p1' }} {...props} />
        </ApiProvider>,
    )
    return { ...utils, get }
}

describe('isEmbedded', () => {
    it('solo acepta embed === true', () => {
        expect(isEmbedded(items)).toBe(true)
        expect(isEmbedded(movements)).toBe(false)
        // Kernel viejo que todavía no sirve el flag: no embeber (lado seguro).
        expect(isEmbedded({} as RelationMeta)).toBe(false)
        expect(isEmbedded({ embed: false })).toBe(false)
    })
})

describe('DynamicRelations embedOnly', () => {
    it('con embedOnly deja pasar solo las relaciones de composición', () => {
        const { container } = renderRelations({
            relations: [items, movements],
            embedOnly: true,
        })
        const panels = container.querySelectorAll('[data-relation-model]')
        expect(panels.length).toBe(1)
        expect(panels[0].getAttribute('data-relation-model')).toBe('OrderItem')
    })

    it('sin ninguna relación embebida no renderiza nada (ni el wrapper)', () => {
        const { container } = renderRelations({ relations: [movements], embedOnly: true })
        expect(container.querySelector('[data-dynamic-relations]')).toBeNull()
    })

    it('sin embedOnly (página de detalle) muestra todas', () => {
        const { container } = renderRelations({ relations: [items, movements] })
        expect(container.querySelectorAll('[data-relation-model]').length).toBe(2)
    })
})

describe('sub-tabla 1:N', () => {
    it('pide la primera página acotada en vez de la relación entera', async () => {
        const { get } = renderRelations({ relations: [items], embedOnly: true, total: 900 })
        await waitFor(() => {
            const call = get.mock.calls.find(([url]: any[]) => url === '/data/OrderItem')
            expect(call).toBeTruthy()
            const params = call![1].params
            expect(params.page).toBe(1)
            expect(params.per_page).toBeGreaterThan(0)
            expect(params.per_page).toBeLessThanOrEqual(50)
            // El scope del padre sigue viajando en la query.
            expect(params.f_order_id).toBe('eq:p1')
            // Sin término, no se manda búsqueda.
            expect(params.search).toBeUndefined()
        })
    })
})
