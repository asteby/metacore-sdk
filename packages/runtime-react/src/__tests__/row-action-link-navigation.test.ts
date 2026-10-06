import { describe, expect, it } from 'vitest'
import { linkNavigation } from '../dynamic-row-actions'

// «Crear desde»: el botón de la fila del origen es una acción link con query
// (`/m/invoices?create=invoice&from=sales_order&from_id={id}`). En `to` el
// router la tomaba como parte del path y `$model` quedaba "invoices?create=…".
describe('linkNavigation', () => {
    it('separa la query como search', () => {
        expect(linkNavigation('/m/invoices?create=invoice&from=sales_order&from_id=so-1')).toEqual({
            to: '/m/invoices',
            search: { create: 'invoice', from: 'sales_order', from_id: 'so-1' },
        })
    })
    it('sin query deja el destino igual', () => {
        expect(linkNavigation('/m/quotes/abc')).toEqual({ to: '/m/quotes/abc' })
    })
})
