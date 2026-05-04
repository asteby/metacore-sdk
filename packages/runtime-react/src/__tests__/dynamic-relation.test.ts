import { describe, it, expect } from 'vitest'
import {
    buildCreatePayload,
    buildPivotAttachPayload,
    buildPivotRowIndex,
    buildRelationFilterParams,
    deriveRelationFormFields,
    diffSelection,
    extractSelectedTargetIds,
    pickOptionLabel,
    relationRowKey,
} from '../dynamic-relation-helpers'
import type { ColumnDefinition, TableMetadata } from '../types'

describe('buildRelationFilterParams', () => {
    it('produce el filtro f_<fk>=eq:<id> con string parentId', () => {
        expect(buildRelationFilterParams('invoice_id', 'inv_42')).toEqual({
            f_invoice_id: 'eq:inv_42',
        })
    })

    it('coerce parentId numérico a string en el query', () => {
        expect(buildRelationFilterParams('invoice_id', 42)).toEqual({
            f_invoice_id: 'eq:42',
        })
    })

    it('rechaza foreignKey vacío', () => {
        expect(() => buildRelationFilterParams('', 'x')).toThrow(/foreignKey/)
    })

    it('rechaza parentId vacío / null / undefined', () => {
        expect(() => buildRelationFilterParams('invoice_id', '')).toThrow(/parentId/)
        // @ts-expect-error testing runtime guard
        expect(() => buildRelationFilterParams('invoice_id', null)).toThrow(/parentId/)
        // @ts-expect-error testing runtime guard
        expect(() => buildRelationFilterParams('invoice_id', undefined)).toThrow(/parentId/)
    })
})

describe('buildCreatePayload', () => {
    it('inyecta el foreign key sobre los valores del form', () => {
        const payload = buildCreatePayload('invoice_id', 'inv_42', { qty: 3, sku: 'A' })
        expect(payload).toEqual({ qty: 3, sku: 'A', invoice_id: 'inv_42' })
    })

    it('el foreign key sobreescribe lo que venga del form', () => {
        const payload = buildCreatePayload('invoice_id', 'inv_42', { invoice_id: 'inv_OTHER', qty: 1 })
        expect(payload.invoice_id).toBe('inv_42')
    })

    it('preserva el parentId numérico tal cual', () => {
        const payload = buildCreatePayload('invoice_id', 7, { qty: 1 })
        expect(payload.invoice_id).toBe(7)
    })

    it('rechaza foreignKey vacío', () => {
        expect(() => buildCreatePayload('', 'x', {})).toThrow(/foreignKey/)
    })
})

describe('deriveRelationFormFields', () => {
    const baseMeta: Pick<TableMetadata, 'columns'> = {
        columns: [
            { key: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, hidden: true },
            { key: 'invoice_id', label: 'Factura', type: 'text', sortable: false, filterable: false },
            { key: 'sku', label: 'SKU', type: 'text', sortable: true, filterable: true },
            { key: 'qty', label: 'Cantidad', type: 'number', sortable: true, filterable: false },
            { key: 'taxable', label: 'Aplica IVA', type: 'boolean', sortable: false, filterable: false },
            { key: 'category', label: 'Categoría', type: 'select', sortable: false, filterable: true, options: [
                { value: 'a', label: 'A' }, { value: 'b', label: 'B' },
            ] },
        ],
    }

    it('omite la foreign key porque está fija al parentId', () => {
        const fields = deriveRelationFormFields(baseMeta, 'invoice_id')
        expect(fields.find(f => f.key === 'invoice_id')).toBeUndefined()
    })

    it('omite columnas marcadas hidden', () => {
        const fields = deriveRelationFormFields(baseMeta, 'invoice_id')
        expect(fields.find(f => f.key === 'id')).toBeUndefined()
    })

    it('mapea types de ColumnDefinition al ActionFieldDef.type', () => {
        const fields = deriveRelationFormFields(baseMeta, 'invoice_id')
        const byKey = Object.fromEntries(fields.map(f => [f.key, f]))
        expect(byKey['sku']?.type).toBe('string')
        expect(byKey['qty']?.type).toBe('number')
        expect(byKey['taxable']?.type).toBe('boolean')
        expect(byKey['category']?.type).toBe('select')
    })

    it('propaga options con value coerced a string', () => {
        const fields = deriveRelationFormFields(baseMeta, 'invoice_id')
        const cat = fields.find(f => f.key === 'category')
        expect(cat?.options).toEqual([
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
        ])
    })

    it('devuelve [] cuando no hay metadata', () => {
        expect(deriveRelationFormFields(null, 'invoice_id')).toEqual([])
        expect(deriveRelationFormFields(undefined, 'invoice_id')).toEqual([])
        expect(deriveRelationFormFields({ columns: [] }, 'invoice_id')).toEqual([])
    })
})

describe('relationRowKey', () => {
    it('usa row.id como key cuando existe', () => {
        expect(relationRowKey({ id: 'abc' }, 0, 'invoice_id')).toBe('abc')
        expect(relationRowKey({ id: 7 }, 5, 'invoice_id')).toBe('7')
    })

    it('cae a synthetic key cuando id falta o es vacío', () => {
        expect(relationRowKey({}, 2, 'invoice_id')).toBe('__rel-invoice_id-2')
        expect(relationRowKey({ id: '' }, 3, 'invoice_id')).toBe('__rel-invoice_id-3')
        expect(relationRowKey({ id: null }, 1, 'invoice_id')).toBe('__rel-invoice_id-1')
        expect(relationRowKey(undefined, 0, 'invoice_id')).toBe('__rel-invoice_id-0')
    })
})

// ---------------------------------------------------------------------------
// many_to_many helpers
// ---------------------------------------------------------------------------

describe('buildPivotAttachPayload', () => {
    it('produce el body con los dos FKs fijos', () => {
        const body = buildPivotAttachPayload('org_id', 'org_1', 'user_id', 'user_42')
        expect(body).toEqual({ org_id: 'org_1', user_id: 'user_42' })
    })

    it('mezcla campos extra del pivot sin pisar los FKs', () => {
        const body = buildPivotAttachPayload('org_id', 1, 'user_id', 2, {
            role: 'owner',
            org_id: 'evil',
            user_id: 'evil',
        })
        expect(body.org_id).toBe(1)
        expect(body.user_id).toBe(2)
        expect(body.role).toBe('owner')
    })

    it('rechaza foreignKey / referencesKey vacíos', () => {
        expect(() => buildPivotAttachPayload('', 'p', 'r', 't')).toThrow(/foreignKey/)
        expect(() => buildPivotAttachPayload('f', 'p', '', 't')).toThrow(/referencesKey/)
    })

    it('rechaza parentId / targetId vacíos', () => {
        expect(() => buildPivotAttachPayload('f', '', 'r', 't')).toThrow(/parentId/)
        expect(() => buildPivotAttachPayload('f', 'p', 'r', '')).toThrow(/targetId/)
        // @ts-expect-error testing runtime guard
        expect(() => buildPivotAttachPayload('f', 'p', 'r', null)).toThrow(/targetId/)
    })
})

describe('extractSelectedTargetIds', () => {
    it('mapea pivot rows al set de target ids como strings', () => {
        const ids = extractSelectedTargetIds(
            [
                { id: 1, org_id: 'org_1', user_id: 'u_1' },
                { id: 2, org_id: 'org_1', user_id: 7 },
            ],
            'user_id',
        )
        expect(ids).toEqual(['u_1', '7'])
    })

    it('omite filas sin valor en el referencesKey', () => {
        const ids = extractSelectedTargetIds(
            [
                { id: 1, user_id: 'u_1' },
                { id: 2, user_id: null },
                { id: 3, user_id: '' },
                { id: 4 },
            ],
            'user_id',
        )
        expect(ids).toEqual(['u_1'])
    })

    it('devuelve [] cuando no hay rows o referencesKey', () => {
        expect(extractSelectedTargetIds(null, 'user_id')).toEqual([])
        expect(extractSelectedTargetIds(undefined, 'user_id')).toEqual([])
        expect(extractSelectedTargetIds([{ user_id: 'x' }], '')).toEqual([])
    })
})

describe('buildPivotRowIndex', () => {
    it('mapea targetId -> pivotRowId', () => {
        const idx = buildPivotRowIndex(
            [
                { id: 'p1', user_id: 'u_1' },
                { id: 'p2', user_id: 7 },
            ],
            'user_id',
        )
        expect(idx.get('u_1')).toBe('p1')
        expect(idx.get('7')).toBe('p2')
    })

    it('omite filas sin id pivot o sin target', () => {
        const idx = buildPivotRowIndex(
            [
                { id: 'p1', user_id: 'u_1' },
                { user_id: 'u_2' },
                { id: 'p3' },
                { id: 'p4', user_id: null },
            ],
            'user_id',
        )
        expect(Array.from(idx.keys())).toEqual(['u_1'])
    })

    it('última fila gana cuando hay duplicados', () => {
        const idx = buildPivotRowIndex(
            [
                { id: 'p1', user_id: 'u_1' },
                { id: 'p2', user_id: 'u_1' },
            ],
            'user_id',
        )
        expect(idx.get('u_1')).toBe('p2')
    })
})

describe('diffSelection', () => {
    it('detecta toAdd y toRemove respecto al estado previo', () => {
        const { toAdd, toRemove } = diffSelection(['a', 'b', 'c'], ['b', 'c', 'd'])
        expect(toAdd).toEqual(['d'])
        expect(toRemove).toEqual(['a'])
    })

    it('preserva el orden de aparición en next/prev', () => {
        const { toAdd, toRemove } = diffSelection(['a', 'b'], ['c', 'a', 'd'])
        expect(toAdd).toEqual(['c', 'd'])
        expect(toRemove).toEqual(['b'])
    })

    it('devuelve arrays vacíos cuando no cambia nada', () => {
        const { toAdd, toRemove } = diffSelection(['a', 'b'], ['b', 'a'])
        expect(toAdd).toEqual([])
        expect(toRemove).toEqual([])
    })

    it('caso vacío -> next agrega todo', () => {
        const { toAdd, toRemove } = diffSelection([], ['a', 'b'])
        expect(toAdd).toEqual(['a', 'b'])
        expect(toRemove).toEqual([])
    })

    it('caso prev -> [] remueve todo', () => {
        const { toAdd, toRemove } = diffSelection(['a', 'b'], [])
        expect(toAdd).toEqual([])
        expect(toRemove).toEqual(['a', 'b'])
    })
})

describe('pickOptionLabel', () => {
    const cols: ColumnDefinition[] = [
        { key: 'id', label: 'ID', type: 'text', sortable: false, filterable: false, hidden: true },
        { key: 'name', label: 'Nombre', type: 'text', sortable: true, filterable: true },
        { key: 'email', label: 'Email', type: 'text', sortable: false, filterable: true },
    ]

    it('respeta displayKey cuando existe en la fila', () => {
        expect(pickOptionLabel({ id: 1, name: 'Alice', email: 'a@x' }, 'email', cols)).toBe('a@x')
    })

    it('cae al primer column no-id no-hidden cuando displayKey falta', () => {
        expect(pickOptionLabel({ id: 1, name: 'Alice', email: 'a@x' }, undefined, cols)).toBe('Alice')
    })

    it('salta valores nulos / vacíos al inferir', () => {
        expect(pickOptionLabel({ id: 1, name: '', email: 'a@x' }, undefined, cols)).toBe('a@x')
    })

    it('cae a row.id cuando no hay match en columns', () => {
        expect(pickOptionLabel({ id: 7 }, undefined, cols)).toBe('7')
        expect(pickOptionLabel({ id: 7 }, undefined, undefined)).toBe('7')
    })

    it('devuelve "—" cuando no hay nada usable', () => {
        expect(pickOptionLabel(null, undefined, cols)).toBe('—')
        expect(pickOptionLabel({}, undefined, cols)).toBe('—')
    })

    it('ignora valores object al inferir', () => {
        expect(pickOptionLabel({ id: 1, name: { nested: true }, email: 'a@x' }, undefined, cols)).toBe('a@x')
    })
})
