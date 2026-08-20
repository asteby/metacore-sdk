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
