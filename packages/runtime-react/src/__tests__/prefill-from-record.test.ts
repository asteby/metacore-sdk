import { describe, it, expect } from 'vitest'
import { buildPrefillRows, isPrefillSpec, applyPrefillLock, type PrefillSpec } from '../action-modal-dispatcher'
import type { ActionFieldDef } from '../types'

// receive-goods-style item_fields: the canonical use case ($prefillFromRecord
// + map + remaining + lock), same shape inventory's receive_transfer and
// purchases' receive_goods declare in their manifest.json.
const receiveField = (overrides: Partial<ActionFieldDef> = {}): ActionFieldDef => ({
    key: 'lines',
    label: 'Renglones',
    type: 'array',
    itemFields: [
        { key: 'product_id', label: 'Producto', type: 'dynamic_select', ref: 'Product' },
        { key: 'ordered', label: 'Ordenado', type: 'number' },
        { key: 'received_so_far', label: 'Ya recibido', type: 'number' },
        { key: 'qty_received', label: 'Cantidad recibida', type: 'number', required: true },
    ],
    ...overrides,
})

describe('isPrefillSpec', () => {
    it('reconoce un objeto con $prefillFromRecord como PrefillSpec', () => {
        expect(isPrefillSpec({ $prefillFromRecord: 'items' })).toBe(true)
    })

    it('rechaza un default literal (string/number) o un objeto sin $prefillFromRecord', () => {
        expect(isPrefillSpec('walk-in')).toBe(false)
        expect(isPrefillSpec(42)).toBe(false)
        expect(isPrefillSpec(null)).toBe(false)
        expect(isPrefillSpec(undefined)).toBe(false)
        expect(isPrefillSpec({ map: { a: 'b' } })).toBe(false)
    })
})

describe('buildPrefillRows', () => {
    it('proyecta record[$prefillFromRecord] a filas usando map', () => {
        const spec: PrefillSpec = {
            $prefillFromRecord: 'items',
            map: { product_id: 'product_id', ordered: 'quantity' },
        }
        const record = {
            items: [
                { product_id: 'p1', quantity: 10 },
                { product_id: 'p2', quantity: 5 },
            ],
        }
        expect(buildPrefillRows(spec, record)).toEqual([
            { product_id: 'p1', ordered: 10 },
            { product_id: 'p2', ordered: 5 },
        ])
    })

    it('calcula remaining.target = of - minus por fila', () => {
        const spec: PrefillSpec = {
            $prefillFromRecord: 'items',
            map: { product_id: 'product_id' },
            remaining: { target: 'qty_received', of: 'quantity', minus: 'received' },
        }
        const record = { items: [{ product_id: 'p1', quantity: 10, received: 4 }] }
        expect(buildPrefillRows(spec, record)).toEqual([{ product_id: 'p1', qty_received: 6 }])
    })

    it('con remaining.minus omitido, remaining = of tal cual (minus lee como 0)', () => {
        const spec: PrefillSpec = {
            $prefillFromRecord: 'items',
            remaining: { target: 'qty_received', of: 'quantity' },
        }
        const record = { items: [{ quantity: 7 }] }
        expect(buildPrefillRows(spec, record)).toEqual([{ qty_received: 7 }])
    })

    it('omite filas ya satisfechas por completo (remaining <= 0)', () => {
        const spec: PrefillSpec = {
            $prefillFromRecord: 'items',
            map: { product_id: 'product_id' },
            remaining: { target: 'qty_received', of: 'quantity', minus: 'received' },
        }
        const record = {
            items: [
                { product_id: 'p1', quantity: 10, received: 10 }, // satisfecha -> fuera
                { product_id: 'p2', quantity: 10, received: 12 }, // sobre-recibida -> fuera
                { product_id: 'p3', quantity: 10, received: 3 }, // pendiente -> queda
            ],
        }
        expect(buildPrefillRows(spec, record)).toEqual([{ product_id: 'p3', qty_received: 7 }])
    })

    it('combina map + remaining en el mismo caso real de receive_transfer/receive_goods', () => {
        const spec: PrefillSpec = {
            $prefillFromRecord: 'items',
            map: { product_id: 'product_id', ordered: 'quantity', received_so_far: 'received' },
            remaining: { target: 'qty_received', of: 'quantity', minus: 'received' },
            lock: ['product_id', 'ordered', 'received_so_far'],
        }
        const record = { items: [{ product_id: 'p1', quantity: 10, received: 4 }] }
        expect(buildPrefillRows(spec, record)).toEqual([
            { product_id: 'p1', ordered: 10, received_so_far: 4, qty_received: 6 },
        ])
    })

    it('registro sin filas (o campo ausente/no-array) da prefill vacío, sin explotar', () => {
        const spec: PrefillSpec = { $prefillFromRecord: 'items' }
        expect(buildPrefillRows(spec, { items: [] })).toEqual([])
        expect(buildPrefillRows(spec, {})).toEqual([])
        expect(buildPrefillRows(spec, { items: 'not-an-array' })).toEqual([])
        expect(buildPrefillRows(spec, null)).toEqual([])
    })

    it('ignora entradas no-objeto dentro del array origen', () => {
        const spec: PrefillSpec = { $prefillFromRecord: 'items', map: { product_id: 'product_id' } }
        const record = { items: [null, { product_id: 'p1' }, undefined, 42] }
        expect(buildPrefillRows(spec, record)).toEqual([{ product_id: 'p1' }])
    })
})

describe('applyPrefillLock', () => {
    it('marca readonly las columnas listadas en lock', () => {
        const field = receiveField({
            default: {
                $prefillFromRecord: 'items',
                lock: ['product_id', 'ordered', 'received_so_far'],
            } as PrefillSpec,
        } as Partial<ActionFieldDef>)
        const patched = applyPrefillLock(field) as ActionFieldDef & { itemFields?: any[] }
        const byKey = Object.fromEntries((patched.itemFields ?? []).map((c: any) => [c.key, c]))
        expect(byKey.product_id.readonly).toBe(true)
        expect(byKey.ordered.readonly).toBe(true)
        expect(byKey.received_so_far.readonly).toBe(true)
        expect(byKey.qty_received.readonly).toBeUndefined()
    })

    it('sin lock (o sin prefill spec) deja el field intacto', () => {
        const plain = receiveField()
        expect(applyPrefillLock(plain)).toBe(plain)

        const noLock = receiveField({
            default: { $prefillFromRecord: 'items' } as PrefillSpec,
        } as Partial<ActionFieldDef>)
        expect(applyPrefillLock(noLock)).toBe(noLock)
    })

    it('un default literal (no PrefillSpec) deja el field intacto', () => {
        const field = receiveField({ default: 'walk-in' } as Partial<ActionFieldDef>)
        expect(applyPrefillLock(field)).toBe(field)
    })
})

// ---- fromField: rows seeded from a document picked in a sibling field --------

import { prefillFromFieldRequests, prefillFromFieldRelationRequest } from '../action-modal-dispatcher'

const receiptFields = (): ActionFieldDef[] => [
    { key: 'purchase_order_id', label: 'OC', type: 'dynamic_select', ref: 'PurchaseOrder' } as ActionFieldDef,
    receiveField({
        key: 'items',
        default: {
            $prefillFromRecord: 'items',
            fromField: 'purchase_order_id',
            map: { product_id: 'product_variant_id', ordered: 'qty', received_so_far: 'qty_received' },
            remaining: { target: 'qty_received', of: 'qty', minus: 'qty_received' },
        },
    } as Partial<ActionFieldDef>),
]

describe('prefillFromFieldRequests', () => {
    it('lee el id del campo hermano y el modelo de su ref', () => {
        const reqs = prefillFromFieldRequests(receiptFields(), { purchase_order_id: 'po-1' })
        expect(reqs).toHaveLength(1)
        expect(reqs[0]).toMatchObject({ fieldKey: 'items', refModel: 'PurchaseOrder', refId: 'po-1' })
    })

    it('desenvuelve {value,id} y devuelve refId vacío sin selección', () => {
        expect(prefillFromFieldRequests(receiptFields(), { purchase_order_id: { id: 'po-2', label: 'OC-2' } })[0].refId).toBe('po-2')
        expect(prefillFromFieldRequests(receiptFields(), { purchase_order_id: '' })[0].refId).toBe('')
        expect(prefillFromFieldRequests(receiptFields(), {})[0].refId).toBe('')
    })

    it('ignora specs sin fromField o cuyo campo hermano no tiene ref', () => {
        const noFrom = receiveField({ default: { $prefillFromRecord: 'items' } } as Partial<ActionFieldDef>)
        expect(prefillFromFieldRequests([noFrom], {})).toEqual([])
        const fields = receiptFields()
        ;(fields[0] as any).ref = undefined
        expect(prefillFromFieldRequests(fields, { purchase_order_id: 'x' })).toEqual([])
    })
})

describe('prefillFromFieldRelationRequest', () => {
    const rels = [
        { name: 'goods_receipts', kind: 'one_to_many', through: 'GoodsReceipt', foreign_key: 'purchase_order_id' },
        { name: 'items', kind: 'one_to_many', through: 'PurchaseOrderItem', foreign_key: 'purchase_order_id' },
    ]
    it('arma el request de hijos por la relación de la OC elegida', () => {
        const [req] = prefillFromFieldRequests(receiptFields(), { purchase_order_id: 'po-1' })
        expect(prefillFromFieldRelationRequest(req, rels)).toEqual({
            endpoint: '/data/PurchaseOrderItem',
            params: { f_purchase_order_id: 'eq:po-1', per_page: 200 },
        })
    })
    it('null sin selección o si la relación no existe', () => {
        const [empty] = prefillFromFieldRequests(receiptFields(), {})
        expect(prefillFromFieldRelationRequest(empty, rels)).toBeNull()
        const [req] = prefillFromFieldRequests(receiptFields(), { purchase_order_id: 'po-1' })
        expect(prefillFromFieldRelationRequest(req, [])).toBeNull()
    })
    it('las filas resultantes descartan lo ya recibido por completo (remaining)', () => {
        const [req] = prefillFromFieldRequests(receiptFields(), { purchase_order_id: 'po-1' })
        const rows = buildPrefillRows(req.spec, {
            items: [
                { product_variant_id: 'a', qty: 10, qty_received: 4 },
                { product_variant_id: 'b', qty: 5, qty_received: 5 },
            ],
        })
        expect(rows).toEqual([{ product_id: 'a', ordered: 10, received_so_far: 4, qty_received: 6 }])
    })
})
