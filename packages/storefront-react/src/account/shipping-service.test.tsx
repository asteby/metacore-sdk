// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import { ShippingServiceCard, orderShippingService } from './index.js'

afterEach(cleanup)
const svc = { title: 'Envío Paquetexpress', carrier: 'paquetexpress', carrier_logo_key: 'paquetexpress', eta_days_min: 1, eta_days_max: 3 }

describe('<ShippingServiceCard />', () => {
  it('shows the mark, the service and the days the buyer saw at checkout, with no shipment at all', () => {
    const { container } = render(<ShippingServiceCard order={{ shipping_service: svc }} renderCarrierMark={(s) => <b data-mark={s.carrier_logo_key} />} />)
    expect(container.querySelector('[data-sf-shipping-service-title]')!.textContent).toBe('Envío Paquetexpress')
    expect(container.querySelector('[data-sf-shipping-service-eta]')!.textContent).toBe('Llega en 1 a 3 días hábiles')
    expect(container.querySelector('[data-mark="paquetexpress"]')).not.toBeNull()
  })

  it('is not tied to a carrier: any name, no mark slot, no title', () => {
    const { container } = render(<ShippingServiceCard service={{ carrier: 'envios_rapidos', eta_days_max: 5 }} />)
    expect(container.querySelector('[data-sf-shipping-service-title]')!.textContent).toBe('Envios Rapidos')
    expect(container.querySelector('[data-sf-shipping-service-eta]')!.textContent).toBe('Llega en máximo 5 días hábiles')
    expect(container.querySelector('[data-sf-shipping-service-mark]')).toBeNull()
  })

  it('speaks English and singular/same-day/equal ranges', () => {
    const t = (s: object) => render(<ShippingServiceCard locale="en-US" service={{ title: 'Standard', ...s }} />).container.querySelector('[data-sf-shipping-service-eta]')?.textContent
    expect(t({ eta_days_min: 1, eta_days_max: 1 })).toBe('Arrives in 1 business day')
    expect(t({ eta_days_min: 2, eta_days_max: 2 })).toBe('Arrives in 2 business days')
    expect(t({ eta_days_min: 0, eta_days_max: 0 })).toBe('Arrives the same day')
    expect(t({ eta_days_min: 4, eta_days_max: 2 })).toBe('Arrives in 2 to 4 business days')
    expect(t({})).toBeUndefined()
  })

  it('falls back to shipping_method on servers without shipping_service, and ignores pickup and opaque methods', () => {
    expect(orderShippingService({ shipping_method: 'shipping:Envío Paquetexpress' })).toEqual({ title: 'Envío Paquetexpress' })
    expect(orderShippingService({ shipping_method: 'dhl' })).toBeNull()
    expect(orderShippingService({ shipping_method: 'pickup:Centro', delivery_method: 'pickup', shipping_service: svc })).toBeNull()
    expect(render(<ShippingServiceCard order={{ shipping_method: null }} />).container.innerHTML).toBe('')
  })

  it('never renders hostile data as objects, and the pending note is opt-in', () => {
    const hostile = { title: { x: 1 }, carrier: 7, eta_days_min: '1', eta_days_max: -3 } as never
    expect(render(<ShippingServiceCard service={hostile} />).container.innerHTML).not.toContain('object')
    cleanup()
    const { container } = render(<ShippingServiceCard service={svc} pending />)
    expect(container.querySelector('[data-sf-shipping-service-pending]')!.textContent).toContain('guía de rastreo')
    expect(render(<ShippingServiceCard service={svc} />).container.querySelector('[data-sf-shipping-service-pending]')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<main><ShippingServiceCard service={svc} pending /></main>)
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(r.violations).toEqual([])
  })
})
