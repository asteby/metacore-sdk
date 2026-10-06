import { describe, expect, it } from 'vitest'
import {
    buildFieldDefaults,
    readRecordPath,
    refTargetsModel,
    scalarDefaultFromRecord,
    unwrapRecordScalar,
} from '../action-modal-dispatcher'
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

// Retest Pitsline 2026-10-05: «Registrar pago» desde una factura PPD con saldo
// abría el modal con «Factura» vacía: el campo es `invoice_id` y la fila (la
// factura) no tiene esa columna, tiene `id`.
describe('selector que apunta al modelo de la fila', () => {
    // Campos de customers `register_payment` (target_model Invoice).
    const registerPayment = [
        { key: 'customer_id', label: 'Cliente', type: 'dynamic_select', required: true, ref: 'Customer' },
        {
            key: 'invoice_id',
            label: 'Factura',
            type: 'dynamic_select',
            ref: 'Invoice',
            options: { source: 'Invoice', value: 'id', label: 'number' },
        },
        { key: 'amount', label: 'Monto', type: 'number', required: true },
    ] as unknown as ActionFieldDef[]
    const invoice = { id: 'inv-13', number: 'FAC-00013', customer_id: { value: 'cus-1', label: 'Demo' }, amount_due: 232 }

    it('«Registrar pago» abre precargado con la factura y su cliente', () => {
        const d = buildFieldDefaults(registerPayment, invoice, 'invoices')
        expect(d.invoice_id).toBe('inv-13')
        expect(d.customer_id).toBe('cus-1')
    })

    it('sin el modelo de la fila no adivina', () => {
        expect(buildFieldDefaults(registerPayment, invoice).invoice_id).toBe('')
        expect(buildFieldDefaults(registerPayment, invoice, 'customers').invoice_id).toBe('')
    })

    it('una columna propia vacía (parent_id sin padre) no se siembra con el id de la fila', () => {
        const parent = { key: 'parent_id', label: 'Padre', type: 'dynamic_select', ref: 'Category' } as ActionFieldDef
        expect(scalarDefaultFromRecord(parent, { id: 'cat-1', parent_id: null }, 'categories')).toBeUndefined()
    })

    it('refTargetsModel tolera prefijo de addon, PascalCase y plural de tabla', () => {
        expect(refTargetsModel('customers.Invoice', 'invoices')).toBe(true)
        expect(refTargetsModel('Invoice', 'Invoice')).toBe(true)
        expect(refTargetsModel('CustomerAddress', 'customer_addresses')).toBe(true)
        expect(refTargetsModel('SalesOrder', 'sales_orders')).toBe(true)
        expect(refTargetsModel('Invoice', 'invoice_items')).toBe(false)
        expect(refTargetsModel(undefined, 'invoices')).toBe(false)
    })
})

