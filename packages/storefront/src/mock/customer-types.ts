import type { CustomerTypes } from '../customer-type.js'

/**
 * A rehearsal list for `createMockStorefront({ customerCapabilities: { customer_types: MOCK_CUSTOMER_TYPES } })`: what an
 * organization with four customer segments would report. The real list is each organization's own data.
 */
export const MOCK_CUSTOMER_TYPES: CustomerTypes = {
  options: [
    { value: 'final', label: 'Cliente Final' },
    { value: 'refaccionario', label: 'Refaccionario', requires_review: true },
    { value: 'taller', label: 'Taller de Servicio', requires_review: true },
    { value: 'flotillas', label: 'Flotillas', requires_review: true },
  ],
  default: 'final',
}
