// @vitest-environment happy-dom
// Retest Pitsline r5: «Registrar pago» desde la factura mostraba el UUID en
// «Factura a abonar», y la lista / la pestaña REP no se refrescaban con lo que
// el servidor escribe después de la acción (estado tras timbrar, REP tras pagar).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedOptionFromRecord } from '../action-modal-dispatcher'
import { emitRecordMutationSettled, subscribeRecordMutations, RECORD_MUTATION_SETTLE_DELAYS } from '../record-mutation-events'
import type { ActionFieldDef } from '../types'

const invoiceField = {
    key: 'invoice_id',
    type: 'dynamic_select',
    ref: 'Invoice',
    options: { source: 'Invoice', value: 'id', label: 'number' },
} as unknown as ActionFieldDef

describe('seedOptionFromRecord — la propia fila', () => {
    it('un selector sembrado con el id de la fila muestra su folio, no el UUID', () => {
        const record = { id: '68a02222-855e-4af9-b086-31526f0dceb5', number: 'FAC-00015', total: 823.6 }
        expect(seedOptionFromRecord(invoiceField, record.id, record)).toEqual(
            expect.objectContaining({ id: record.id, value: record.id, label: 'FAC-00015' }),
        )
    })
    it('sin options.label usa la primera columna de nombre', () => {
        const field = { key: 'invoice_id', type: 'dynamic_select', ref: 'Invoice' } as unknown as ActionFieldDef
        expect(seedOptionFromRecord(field, 'i1', { id: 'i1', folio: 'A-7' })?.label).toBe('A-7')
    })
    it('otro valor (no la propia fila) sigue resolviendo por el objeto hermano', () => {
        const record = { id: 'pay-1', invoice: { value: 'i9', label: 'FAC-00009' } }
        expect(seedOptionFromRecord(invoiceField, 'i9', record)?.label).toBe('FAC-00009')
        expect(seedOptionFromRecord(invoiceField, 'i8', { id: 'pay-1' })).toBeUndefined()
    })
})

describe('emitRecordMutationSettled', () => {
    afterEach(() => vi.useRealTimers())
    it('anuncia ahora y otra vez cuando el servidor ya escribió lo derivado', () => {
        vi.useFakeTimers()
        const seen = vi.fn()
        const off = subscribeRecordMutations('invoices', seen)
        emitRecordMutationSettled('invoices', 'update')
        expect(seen).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(RECORD_MUTATION_SETTLE_DELAYS[RECORD_MUTATION_SETTLE_DELAYS.length - 1])
        expect(seen).toHaveBeenCalledTimes(1 + RECORD_MUTATION_SETTLE_DELAYS.length)
        off()
    })
    it('se puede cancelar', () => {
        vi.useFakeTimers()
        const seen = vi.fn()
        const off = subscribeRecordMutations('invoices', seen)
        const cancel = emitRecordMutationSettled('invoices', 'update')
        cancel()
        vi.advanceTimersByTime(10_000)
        expect(seen).toHaveBeenCalledTimes(1)
        off()
    })
})
