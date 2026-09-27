import { describe, expect, it } from 'vitest'
import { enhancePlainNotificationText } from './rich-text'

describe('enhancePlainNotificationText', () => {
  it('keeps a formatted amount intact (PIT-023)', () => {
    expect(enhancePlainNotificationText('MX$1,060.00')).toBe('MX$<strong>1,060.00</strong>')
    expect(enhancePlainNotificationText('Total $12,345.60 cobrado')).toBe('Total $<strong>12,345.60</strong> cobrado')
    expect(enhancePlainNotificationText('1.060,00 €')).toBe('<strong>1.060,00</strong> €')
  })

  it('does not guess on a three-digit group', () => {
    expect(enhancePlainNotificationText('Saldo 1,060')).toBe('Saldo <strong>1,060</strong>')
  })

  it('still trims ledger quantities', () => {
    expect(enhancePlainNotificationText('Salida -1.0000 pz')).toBe('Salida <strong>-1 pz</strong>')
    expect(enhancePlainNotificationText('Quedan 1,50 kg')).toBe('Quedan <strong>1,5 kg</strong>')
    expect(enhancePlainNotificationText('Folio SO-00044')).toBe('Folio <strong>SO-00044</strong>')
  })
})
