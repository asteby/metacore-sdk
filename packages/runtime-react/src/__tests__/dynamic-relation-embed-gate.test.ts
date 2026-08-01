// Embedding a child list inside a record MODAL is opt-in: only a relation the
// manifest marks `embed: true` is a composition of its parent (an order and its
// lines). Without the gate the modal auto-embedded every one_to_many, so
// opening a warehouse pulled its whole stock ledger into the dialog.
import { describe, it, expect } from 'vitest'
import { isEmbeddableRelation } from '../dynamic-relations'
import { buildRelationFilterParams } from '../dynamic-relation-helpers'
import type { RelationMeta } from '../types'

const rel = (over: Partial<RelationMeta>): RelationMeta => ({
    name: 'items',
    kind: 'one_to_many',
    through: 'OrderItem',
    foreign_key: 'order_id',
    ...over,
})

describe('isEmbeddableRelation', () => {
    it('embebe una one_to_many que declara embed: true', () => {
        expect(isEmbeddableRelation(rel({ embed: true }))).toBe(true)
    })

    it('NO embebe una one_to_many sin el flag (default seguro)', () => {
        expect(isEmbeddableRelation(rel({}))).toBe(false)
        expect(isEmbeddableRelation(rel({ embed: false }))).toBe(false)
    })

    it('tolera un kernel viejo que no sirve embed', () => {
        // Metadata sin la clave: se lee como false, no como "embebé todo".
        const legacy = { name: 'stock', kind: 'one_to_many', through: 'Stock', foreign_key: 'warehouse_id' } as RelationMeta
        expect(isEmbeddableRelation(legacy)).toBe(false)
    })

    it('deja pasar many_to_many: es un multi-select acotado, no una lista sin cota', () => {
        expect(isEmbeddableRelation(rel({ kind: 'many_to_many' }))).toBe(true)
    })
})

describe('buildRelationFilterParams — paginación y búsqueda', () => {
    it('sin options manda solo el scope (comportamiento previo intacto)', () => {
        expect(buildRelationFilterParams('order_id', 'o_1')).toEqual({
            f_order_id: 'eq:o_1',
        })
    })

    it('agrega page/per_page', () => {
        expect(buildRelationFilterParams('order_id', 'o_1', null, { page: 2, perPage: 25 })).toEqual({
            f_order_id: 'eq:o_1',
            page: '2',
            per_page: '25',
        })
    })

    it('normaliza page/per_page inválidos a >= 1', () => {
        const params = buildRelationFilterParams('order_id', 'o_1', null, { page: 0, perPage: -5 })
        expect(params.page).toBe('1')
        expect(params.per_page).toBe('1')
    })

    it('manda search + search_columns y respeta el scope polimórfico', () => {
        expect(
            buildRelationFilterParams('owner_id', 'c_1', { owner_model: 'Customer' }, {
                page: 1,
                perPage: 25,
                search: '  tornillo ',
                searchColumns: ['name', 'sku'],
            }),
        ).toEqual({
            f_owner_id: 'eq:c_1',
            f_owner_model: 'eq:Customer',
            page: '1',
            per_page: '25',
            search: 'tornillo',
            search_columns: 'name,sku',
        })
    })

    it('omite search vacío o en blanco', () => {
        const params = buildRelationFilterParams('order_id', 'o_1', null, { search: '   ' })
        expect(params.search).toBeUndefined()
        expect(params.search_columns).toBeUndefined()
    })

    it('no manda search cuando TODAS las columnas se excluyeron de la búsqueda', () => {
        const params = buildRelationFilterParams('order_id', 'o_1', null, {
            search: 'x',
            searchColumns: [],
        })
        expect(params.search).toBeUndefined()
    })

    it('deja que el servidor elija las columnas cuando searchColumns es null', () => {
        const params = buildRelationFilterParams('order_id', 'o_1', null, {
            search: 'x',
            searchColumns: null,
        })
        expect(params.search).toBe('x')
        expect(params.search_columns).toBeUndefined()
    })
})
