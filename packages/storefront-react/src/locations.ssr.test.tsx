import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Location } from '@asteby/storefront'
import { LocationList, LocationPicker, NearestLocationForm, OpenStatus, PickupOption, StorefrontProvider, useSelectedLocation } from './index.js'

const branch = {
  id: 'b1', name: 'Centro', kind: 'store', address: 'Calle 1', city: 'CDMX', postal_code: '06000', phone: null, lat: 19.4, lng: -99.1, hours: null,
  timezone: 'America/Mexico_City', opening_hours: { weekly: [{ day: 1, open: '09:00', close: '19:00' }] },
  services: [], contacts: { phone: null, email: null, whatsapp: null }, pickup: { enabled: true, fee: null, prep_days: 0 },
} as Location

describe('locations SSR', () => {
  it('renders without window, with a working no-JS form and no clock-dependent text', () => {
    const html = renderToString(
      <StorefrontProvider shop={{ branches: [branch] } as never}>
        <NearestLocationForm action="/sucursales" />
        <LocationList />
        <LocationPicker legend="Sucursal" />
        <OpenStatus location={branch} />
        <PickupOption location={branch} />
      </StorefrontProvider>,
    )
    expect(html).toContain('<form action="/sucursales" method="get">')
    expect(html).toContain('name="cp"')
    expect(html).toContain('type="radio"')
    expect(html).not.toMatch(/Abierto|Cerrado/)
    expect(html).toContain('Recoge en sucursal')
    expect(html).not.toContain('Usar mi ubicación')
  })

  it('renders nothing with zero branches', () => {
    expect(renderToString(<><LocationList locations={[]} /><NearestLocationForm locations={[]} /><LocationPicker legend="x" locations={[]} /></>)).toBe('')
  })

  it('useSelectedLocation renders the server-known id and does not touch window', () => {
    function Probe() {
      const s = useSelectedLocation({ locations: [branch], initialId: 'b1' })
      return <p>{s.location?.name ?? '-'}</p>
    }
    expect(renderToString(<Probe />)).toContain('Centro')
  })
})
