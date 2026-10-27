// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import type { DeliveryOptions as Delivery, ShippingRate } from '@asteby/storefront'
import { DeliveryOptions, DeliveryStatus, useLiveDelivery } from './index.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const rate = (id: string, cost: string, extra: Partial<ShippingRate> = {}): ShippingRate => ({ id, title: id, cost: mxn(cost), ...extra }) as ShippingRate
const opts = (rates: ShippingRate[], extra: Partial<Delivery> = {}): Delivery => ({ rates, pickup: [], ...extra })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Shop({ fetchImpl, page = opts([]), saved, street = 'Av. Vallarta 100' }: { street?: string; fetchImpl: typeof fetch; page?: Delivery; saved?: Parameters<typeof useLiveDelivery>[0]['saved'] }) {
  const ref = useRef<HTMLFormElement>(null)
  vi.stubGlobal('fetch', fetchImpl)
  const live = useLiveDelivery({ formRef: ref, delivery: page, enabled: true, quoteUrl: '/pagar/envio', contactNames: { first_name: 'contact_first_name' }, saved })
  return (
    <form ref={ref} onChange={live.onFormChange}>
      <input name="zip" aria-label="zip" />
      <input name="province" defaultValue="Jalisco" aria-label="province" />
      <input name="city" defaultValue="Guadalajara" aria-label="city" />
      <input name="contact_first_name" defaultValue="Ana" aria-label="first" />
      <input name="address1" defaultValue={street} aria-label="street" />
      <fieldset>
        <DeliveryStatus {...live.statusProps} />
        <DeliveryOptions {...live.optionsProps} />
      </fieldset>
      <output data-testid="ready">{String(live.deliveryReady)}</output>
      <output data-testid="hold">{live.holdLabel ?? ''}</output>
      <output data-testid="value">{live.deliveryValue}</output>
    </form>
  )
}
const zip = (v: string) => fireEvent.input(screen.getByLabelText('zip'), { target: { value: v } })
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const t = (id: string) => screen.getByTestId(id).textContent

describe('useLiveDelivery', () => {
  it('posts the destination with the buyer fields, preselects the cheapest, holds the button while waiting', async () => {
    const f = vi.fn(() => json(opts([rate('a', '199.00'), rate('b', '99.00')])))
    render(<Shop fetchImpl={f as never} />)
    zip('44100')
    await flush(10)
    expect(t('hold')).toBe('Calculando envío…')
    expect(t('ready')).toBe('false')
    await flush(450)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/pagar/envio')
    expect(JSON.parse(String(init.body))).toMatchObject({ zip: '44100', province: 'Jalisco', first_name: 'Ana' })
    expect(t('value')).toBe('rate:b')
    expect(t('ready')).toBe('true')
    expect(t('hold')).toBe('')
  })

  it('a re-quote that drops the chosen rate keeps one chosen; same service with a new id is kept', async () => {
    let n = 0
    const f = vi.fn(() => json(opts(n++ === 0 ? [rate('x1', '100.00', { carrier: 'dhl', service_code: 'exp' }), rate('y1', '50.00', { carrier: 'fedex' })] : [rate('x2', '120.00', { carrier: 'dhl', service_code: 'exp' }), rate('y2', '60.00', { carrier: 'fedex' })])))
    render(<Shop fetchImpl={f as never} />)
    zip('44100'); await flush(450)
    fireEvent.click(document.querySelector('input[value="rate:x1"]')!)
    expect(t('value')).toBe('rate:x1')
    zip('06600'); await flush(450)
    expect(t('value')).toBe('rate:x2')
    expect(document.querySelectorAll('input[name="delivery_choice"]:checked').length).toBe(1)
  })

  it('error blocks with a label; retry recovers; no coverage blocks', async () => {
    let mode: 'fail' | 'ok' | 'none' = 'fail'
    const f = vi.fn(() => (mode === 'fail' ? json({ error: {} }, 503) : json(opts(mode === 'ok' ? [rate('a', '10.00')] : []))))
    render(<Shop fetchImpl={f as never} />)
    zip('44100'); await flush(450)
    expect(t('hold')).toBe('No pudimos calcular el envío')
    mode = 'none'
    fireEvent.click(screen.getByRole('button', { name: /intentar de nuevo/i })); await flush(10)
    expect(t('hold')).toBe('Sin envío a este código postal')
    mode = 'ok'
    zip('06600'); await flush(450)
    expect(t('ready')).toBe('true')
  })

  it('a reload with the saved address and rates is ready with no request', async () => {
    const f = vi.fn(() => json(opts([])))
    render(<Shop fetchImpl={f as never} page={opts([rate('a', '199.00')])} saved={{ address: { zip: '44100', province: 'Jalisco', city: 'Guadalajara' }, rateId: 'a' }} />)
    zip('44100'); await flush(450)
    expect(f).not.toHaveBeenCalled()
    expect(t('ready')).toBe('true')
    expect(t('value')).toBe('rate:a')
  })
})

describe('the street gate', () => {
  const ok = () => json(opts([rate('a', '10.00')]))
  it('quoted but empty street: the button holds with a friendly label and the status says so; a real street releases it', async () => {
    render(<Shop fetchImpl={vi.fn(ok) as never} street="" />)
    zip('44100'); await flush(450)
    expect(t('ready')).toBe('false')
    expect(t('hold')).toBe('Escribe tu calle y número')
    expect(document.querySelector('[data-sf-delivery-status="street"]')).not.toBeNull()
    fireEvent.change(screen.getByLabelText('street'), { target: { value: 'Av. Vallarta 100' } })
    await flush(10)
    expect(t('ready')).toBe('true')
    expect(t('hold')).toBe('')
  })
  it('the saved placeholder never counts as a street, whatever its case', async () => {
    render(<Shop fetchImpl={vi.fn(ok) as never} street="por CONFIRMAR" />)
    zip('44100'); await flush(450)
    expect(t('ready')).toBe('false')
    expect(t('hold')).toBe('Escribe tu calle y número')
  })
})
