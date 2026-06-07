import { describe, it, expect } from 'vitest'
import {
    buildCreatePayload,
    buildPivotAttachPayload,
    buildPivotRowIndex,
    buildRelationFilterParams,
    deriveRelationFormFields,
    diffSelection,
    extractSelectedTargetIds,
    formatRelationCell,
    objectLabel,
    pickOptionLabel,
    relationRowKey,
} from '../dynamic-relation-helpers'
import { resolveWidget } from '../dynamic-form-schema'
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

    it('agrega filtros de scope extra como f_<col>=eq:<val> (caso polimórfico)', () => {
        expect(
            buildRelationFilterParams('owner_id', 'cust_1', { owner_model: 'Customer' }),
        ).toEqual({
            f_owner_id: 'eq:cust_1',
            f_owner_model: 'eq:Customer',
        })
    })

    it('el foreign-key gana sobre un scope redundante con el mismo key', () => {
        expect(
            buildRelationFilterParams('owner_id', 'cust_1', { owner_id: 'evil', tier: 'gold' }),
        ).toEqual({
            f_owner_id: 'eq:cust_1',
            f_tier: 'eq:gold',
        })
    })

    it('ignora scope null/undefined sin romper', () => {
        expect(
            // @ts-expect-error testing runtime tolerance
            buildRelationFilterParams('owner_id', 'c1', { a: null, b: undefined, c: 'ok' }),
        ).toEqual({ f_owner_id: 'eq:c1', f_c: 'eq:ok' })
        expect(buildRelationFilterParams('owner_id', 'c1', null)).toEqual({
            f_owner_id: 'eq:c1',
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

    // The column→field boundary must carry `ref` (FK target) so a belongs_to
    // column renders the searchable picker instead of a raw uuid text input.
    it('propaga el ref (FK target) de la columna al field', () => {
        const meta: Pick<TableMetadata, 'columns'> = {
            columns: [
                { key: 'product_id', label: 'Producto', type: 'text', sortable: true, filterable: false, ref: 'product' },
            ],
        }
        const fields = deriveRelationFormFields(meta, 'invoice_id')
        const prod = fields.find(f => f.key === 'product_id')
        expect(prod?.ref).toBe('product')
        // …and that ref drives the widget to the async searchable picker.
        expect(resolveWidget(prod!)).toBe('dynamic_select')
    })

    // Media columns must map to a media-bearing field type so the form renders
    // the upload dropzone (resolveWidget → 'upload'), not a text input.
    it('mapea columnas image/media-gallery a tipos que resuelven a upload', () => {
        const meta: Pick<TableMetadata, 'columns'> = {
            columns: [
                { key: 'logo', label: 'Logo', type: 'image', sortable: false, filterable: false },
                { key: 'gallery', label: 'Galería', type: 'media-gallery', sortable: false, filterable: false },
            ],
        }
        const fields = deriveRelationFormFields(meta, 'invoice_id')
        const byKey = Object.fromEntries(fields.map(f => [f.key, f]))
        expect(resolveWidget(byKey['logo'])).toBe('upload')
        expect(resolveWidget(byKey['gallery'])).toBe('upload')
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

describe('objectLabel', () => {
    it('lee label de un sibling {value,label}', () => {
        expect(objectLabel({ value: 'u1', label: 'Test' })).toBe('Test')
    })

    it('lee name de un objeto usuario y title como fallback', () => {
        expect(objectLabel({ avatar: '', email: 'd@x', name: 'Danny Hernandez' })).toBe('Danny Hernandez')
        expect(objectLabel({ title: 'Pedido 7' })).toBe('Pedido 7')
    })

    it('devuelve undefined para objetos vacíos, arrays o escalares', () => {
        expect(objectLabel({})).toBeUndefined()
        expect(objectLabel([1, 2])).toBeUndefined()
        expect(objectLabel('x')).toBeUndefined()
        expect(objectLabel(null)).toBeUndefined()
    })
})

describe('formatRelationCell', () => {
    const col = (key: string, type: ColumnDefinition['type'] = 'text'): ColumnDefinition =>
        ({ key, label: key, type, sortable: false, filterable: false }) as ColumnDefinition
    const NIL = '00000000-0000-0000-0000-000000000000'

    it('prefiere el label del sibling resuelto de una FK *_id sobre el uuid crudo', () => {
        const row = { product_id: '249915fe-aaaa', product: { value: '249915fe-aaaa', label: 'Test' } }
        expect(formatRelationCell(row, col('product_id'))).toBe('Test')
    })

    it('usa un sibling string plano cuando no es objeto', () => {
        expect(formatRelationCell({ product_id: 'x', product: 'Aceite' }, col('product_id'))).toBe('Aceite')
    })

    it('ignora el sibling cuando es nil-uuid o vacío y cae al valor', () => {
        expect(formatRelationCell({ product_id: 'abc', product: NIL }, col('product_id'))).toBe('abc')
    })

    it('nil-uuid en la celda → "—" (FK nullable sin setear)', () => {
        expect(formatRelationCell({ seller_id: NIL }, col('seller_id'))).toBe('—')
    })

    it('objeto usuario en la celda (created_by) → name, nunca JSON', () => {
        const row = { created_by: { avatar: '', email: 'd@x', name: 'Danny Hernandez' } }
        expect(formatRelationCell(row, col('created_by', 'creator'))).toBe('Danny Hernandez')
    })

    it('objeto {value,label} directo en la celda → label', () => {
        expect(formatRelationCell({ status: { value: 'open', label: 'Abierto' } }, col('status'))).toBe('Abierto')
    })

    it('objeto sin label usable → "—", no [object Object] ni JSON', () => {
        expect(formatRelationCell({ meta: { amount: 5 } }, col('meta'))).toBe('—')
    })

    it('escalares: booleans, números, strings y vacíos', () => {
        expect(formatRelationCell({ taxable: true }, col('taxable', 'boolean'))).toBe('✓')
        expect(formatRelationCell({ taxable: false }, col('taxable', 'boolean'))).toBe('—')
        expect(formatRelationCell({ qty: 0 }, col('qty', 'number'))).toBe('0')
        expect(formatRelationCell({ sku: 'ABC' }, col('sku'))).toBe('ABC')
        expect(formatRelationCell({ sku: '' }, col('sku'))).toBe('—')
        expect(formatRelationCell({ note: null }, col('note'))).toBe('—')
    })
})
