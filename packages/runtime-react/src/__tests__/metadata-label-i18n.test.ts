import { describe, expect, it, vi } from 'vitest'
import { translateMetadataLabel } from '../dynamic-columns-helpers'

describe('translateMetadataLabel', () => {
    it('resolves a host translation when available', () => {
        const t = vi.fn(() => 'Estado del pago')
        expect(translateMetadataLabel('models.orders.payment_status', t)).toBe('Estado del pago')
        expect(t).toHaveBeenCalledWith('models.orders.payment_status', { defaultValue: 'Payment Status' })
    })

    it('humanizes the final segment when an addon locale is not loaded', () => {
        const t = vi.fn((key: string) => key)
        expect(translateMetadataLabel('models.addon.fields.custom_code', t)).toBe('Custom Code')
    })

    it('preserves already human labels', () => {
        expect(translateMetadataLabel('Nombre comercial')).toBe('Nombre comercial')
    })
})
