import { describe, expect, it } from 'vitest'
import { linkNavigation } from '../dynamic-row-actions'

describe('linkNavigation', () => {
    it('parte /m/<tabla>?create… en ruta parametrizada + search (retest r6b)', () => {
        expect(linkNavigation('/m/invoices?create=invoice&from=sales_order&from_id=so-1')).toEqual({
            to: '/m/$model',
            params: { model: 'invoices' },
            search: { create: 'invoice', from: 'sales_order', from_id: 'so-1' },
        })
        expect(linkNavigation('/m/credit_notes?create=credit_note&from=invoice&from_id=fac-1')).toEqual({
            to: '/m/$model',
            params: { model: 'credit_notes' },
            search: { create: 'credit_note', from: 'invoice', from_id: 'fac-1' },
        })
    })
    it('deja paths que no son /m/<tabla> como pathname', () => {
        expect(linkNavigation('/m/quotes/abc')).toEqual({ to: '/m/quotes/abc' })
        expect(linkNavigation('/settings')).toEqual({ to: '/settings' })
    })
})
