import { describe, expect, it } from 'vitest'
import { readRecordPath, scalarDefaultFromRecord, unwrapRecordScalar } from '../action-modal-dispatcher'
import type { ActionFieldDef } from '../types'

describe('scalarDefaultFromRecord', () => {
    it('unwraps FK cells with value/label', () => {
        expect(unwrapRecordScalar({ value: 'abc', label: 'Cliente SA' })).toBe('abc')
    })

    it('reads dotted paths', () => {
        const record = { fiscal_data: { forma_pago: '03' } }
        expect(readRecordPath(record, 'fiscal_data.forma_pago')).toBe('03')
    })

    it('uses defaultFromRecord string', () => {
        const field = { key: 'forma_pago', defaultFromRecord: 'fiscal_data.forma_pago' } as ActionFieldDef & {
            defaultFromRecord: string
        }
        const record = { fiscal_data: { forma_pago: '01' }, forma_pago: '99' }
        expect(scalarDefaultFromRecord(field, record)).toBe('01')
    })

    it('tries defaultFromRecord array in order', () => {
        const field = {
            key: 'uso_cfdi',
            defaultFromRecord: ['fiscal_data.uso_cfdi', 'uso_cfdi'],
        } as ActionFieldDef & { defaultFromRecord: string[] }
        const record = { uso_cfdi: 'G03' }
        expect(scalarDefaultFromRecord(field, record)).toBe('G03')
    })

    it('falls back to record[field.key]', () => {
        const field = { key: 'customer_id' } as ActionFieldDef
        const record = { customer_id: '11111111-1111-4111-8111-111111111111' }
        expect(scalarDefaultFromRecord(field, record)).toBe('11111111-1111-4111-8111-111111111111')
    })
})
