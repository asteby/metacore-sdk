import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { TrackingView } from '@asteby/storefront'
import { ShipmentTracker, TrackOrderLookup, TrackingTimeline } from './index.js'

const t: TrackingView = {
  status: 'delivered',
  carrier: 'dhl',
  tracking_number: 'D1',
  tracking_url: 'https://rastreo.example.com/D1',
  events: [{ id: 'a', status: 'delivered', location: 'CDMX', occurred_at: '2026-10-29T18:00:00Z' }],
}

describe('tracking without JavaScript (server render)', () => {
  it('renders the form, the result and the timeline as plain HTML', () => {
    const html = renderToString(<TrackOrderLookup action="/rastreo" result={t} />)
    expect(html).toMatch(/<form[^>]*method="post"/)
    expect(html).toMatch(/<form[^>]*action="\/rastreo"/)
    expect(html).toContain('name="order_number"')
    expect(html).toContain('name="tracking_number"')
    expect(html).toContain('D1')
    expect(html).toContain('<ol')
    expect(html).toContain('aria-current="step"')
  })

  it('renders every tracker state on the server without touching browser APIs', () => {
    for (const state of ['loading', 'empty', 'error', 'ready'] as const) {
      expect(() => renderToString(<ShipmentTracker state={state} tracking={t} />)).not.toThrow()
    }
    expect(renderToString(<TrackingTimeline events={t.events} timeZone="America/Mexico_City" />)).toContain('Entregado')
  })

  it('never renders a map on the server', () => {
    const html = renderToString(<ShipmentTracker tracking={{ ...t, events: [{ ...t.events[0]!, lat: 19.4, lng: -99.1 }] }} loadMaps={async () => { throw new Error('no') }} />)
    expect(html).not.toContain('data-sf-tracking-map')
  })
})
