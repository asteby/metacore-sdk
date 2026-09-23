import { describe, it, expect } from 'vitest'
import { prefillRelationRequests } from '../action-modal-dispatcher'
import type { ActionFieldDef } from '../types'

// QA 7Leguas: the purchase-order receive modal opened from the LIST showed
// "Sin renglones" — the list row carries no `items`, so the
// $prefillFromRecord grid had nothing to project. The modal must load the
// lines from the model's declared one_to_many relation.
const itemsField: ActionFieldDef = {
    key: 'items',
    label: 'Renglones',
    type: 'array',
    itemFields: [
        { key: 'product_id', label: 'Producto', type: 'dynamic_select', ref: 'Product' },
        { key: 'qty_received', label: 'Recibido', type: 'number' },
    ],
    default: { $prefillFromRecord: 'items', map: { product_id: 'product_variant_id' } },
} as unknown as ActionFieldDef

const relations = [
    { name: 'items', kind: 'one_to_many', through: 'PurchaseOrderItem', foreign_key: 'purchase_order_id' },
    { name: 'goods_receipts', kind: 'one_to_many', through: 'GoodsReceipt', foreign_key: 'purchase_order_id' },
]

describe('prefillRelationRequests', () => {
    it('pide las líneas por la relación declarada cuando el registro no las trae', () => {
        const reqs = prefillRelationRequests([itemsField], { id: 'po-1' }, relations)
        expect(reqs).toHaveLength(1)
        expect(reqs[0].fieldKey).toBe('items')
        expect(reqs[0].endpoint).toBe('/data/PurchaseOrderItem')
        expect(reqs[0].params).toMatchObject({ f_purchase_order_id: 'eq:po-1' })
    })

    it('no pide nada si el registro ya trae las líneas embebidas', () => {
        expect(prefillRelationRequests([itemsField], { id: 'po-1', items: [] }, relations)).toHaveLength(0)
    })

    it('no pide nada sin id (acción de creación) o sin relación con ese nombre', () => {
        expect(prefillRelationRequests([itemsField], {}, relations)).toHaveLength(0)
        expect(prefillRelationRequests([itemsField], { id: 'po-1' }, [relations[1]])).toHaveLength(0)
    })
})
