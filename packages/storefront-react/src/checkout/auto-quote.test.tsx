// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { useRef } from 'react'
import type { DeliveryOptions as Delivery, ShippingRate } from '@asteby/storefront'
import { DeliveryOptions, defaultRate, quoteFingerprint, readQuoteAddress, useAutoQuote, type QuoteAddress } from './index.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const rate = (id: string, cost: string, extra: Partial<ShippingRate> = {}): ShippingRate => ({ id, title: `Servicio ${id}`, cost: mxn(cost), ...extra }) as ShippingRate
const options = (rates: ShippingRate[], extra: Partial<Delivery> = {}): Delivery => ({ rates, pickup: [], ...extra })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness({ quote, savedValue, debounceMs = 600, free }: { quote: (a: QuoteAddress, s: AbortSignal) => Promise<Delivery>; savedValue?: string; debounceMs?: number; free?: boolean }) {
  const ref = useRef<HTMLFormElement>(null)
  const q = useAutoQuote({ formRef: ref, quote, debounceMs, ...(savedValue ? { savedValue } : {}) })
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()}>
      <input name="zip" aria-label="zip" />
      <input name="province" aria-label="province" />
      <input name="city" aria-label="city" />
      <input name="neighborhood" aria-label="neighborhood" />
      <input name="address1" aria-label="address1" />
      <input name="phone" aria-label="phone" />
      <output data-testid="status">{q.status}</output>
      <output data-testid="default">{q.defaultValue ?? ''}</output>
      <fieldset>
        <legend>Entrega</legend>
        <DeliveryOptions rates={q.delivery?.rates ?? []} pickup={q.delivery?.pickup ?? []} defaultValue={q.defaultValue} loading={q.status === 'loading'} error={q.status === 'error'} onRetry={q.retry} free={free ?? q.delivery?.free ?? false} announceReady />
      </fieldset>
    </form>
  )
}

const type = (label: string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } })
const fillAddress = () => {
  type('zip', '44100')
  type('province', 'Jalisco')
  type('city', 'Guadalajara')
  type('neighborhood', 'Centro')
  type('address1', 'Av. Vallarta 100')
}
const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
const status = () => screen.getByTestId('status').textContent

describe('useAutoQuote', () => {
  it('quotes by itself once the address is complete and preselects the cheapest rate', async () => {
    const quote = vi.fn(async () => options([rate('b', '199.00'), rate('a', '129.00'), rate('c', '250.00')]))
    render(<Harness quote={quote} />)
    type('zip', '44100')
    await flush(700)
    expect(quote).not.toHaveBeenCalled()
    expect(status()).toBe('idle')
    fillAddress()
    expect(status()).toBe('waiting')
    await flush(599)
    expect(quote).not.toHaveBeenCalled()
    await flush(5)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(status()).toBe('ready')
    expect(screen.getByTestId('default').textContent).toBe('rate:a')
    const checked = document.querySelector<HTMLInputElement>('input[name="delivery_choice"]:checked')
    expect(checked?.value).toBe('rate:a')
  })

  it('debounces a burst of typing into one quote', async () => {
    const quote = vi.fn(async () => options([rate('a', '99.00')]))
    render(<Harness quote={quote} />)
    fillAddress()
    for (const v of ['Av. V', 'Av. Vall', 'Av. Vallarta 1', 'Av. Vallarta 10']) {
      await flush(200)
      type('address1', v)
    }
    await flush(800)
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it('does not quote again when a field that does not change the price changes', async () => {
    const quote = vi.fn(async () => options([rate('a', '99.00')]))
    render(<Harness quote={quote} />)
    fillAddress()
    await flush(700)
    expect(quote).toHaveBeenCalledTimes(1)
    type('address1', 'Av. Vallarta 100 Int. 4')
    type('neighborhood', 'Americana')
    type('phone', '3312345678')
    await flush(2000)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(status()).toBe('ready')
    // The postal code does change the price.
    type('zip', '44200')
    await flush(700)
    expect(quote).toHaveBeenCalledTimes(2)
  })

  it('ignores an answer that arrives after a newer address', async () => {
    const resolvers: Array<(d: Delivery) => void> = []
    const quote = vi.fn((_: QuoteAddress, signal: AbortSignal) => new Promise<Delivery>((res) => resolvers.push((d) => !signal.aborted && res(d))))
    render(<Harness quote={quote} />)
    fillAddress()
    await flush(700)
    type('zip', '06600')
    await flush(700)
    expect(quote).toHaveBeenCalledTimes(2)
    await act(async () => {
      resolvers[0]!(options([rate('old', '10.00')]))
      resolvers[1]!(options([rate('new', '20.00')]))
    })
    expect(screen.getByTestId('default').textContent).toBe('rate:new')
  })

  it('keeps the saved rate when the new quote still offers it', async () => {
    const quote = vi.fn(async () => options([rate('a', '99.00'), rate('b', '199.00')]))
    render(<Harness quote={quote} savedValue="rate:b" />)
    fillAddress()
    await flush(700)
    expect(screen.getByTestId('default').textContent).toBe('rate:b')
  })

  it('shows an accessible error with a retry that quotes again', async () => {
    const quote = vi.fn<(a: QuoteAddress, s: AbortSignal) => Promise<Delivery>>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(options([rate('a', '99.00')]))
    render(<Harness quote={quote} />)
    fillAddress()
    await flush(700)
    expect(status()).toBe('error')
    expect(screen.getByRole('alert')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    await flush(10)
    expect(quote).toHaveBeenCalledTimes(2)
    expect(status()).toBe('ready')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('announces the loading and the ready states to screen readers', async () => {
    let done: (d: Delivery) => void = () => {}
    const quote = vi.fn(() => new Promise<Delivery>((res) => (done = res)))
    render(<Harness quote={quote} />)
    fillAddress()
    await flush(700)
    expect(document.querySelector('[data-sf-delivery-loading]')).not.toBeNull()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    await act(async () => done(options([rate('a', '99.00')])))
    expect(document.querySelector('[data-sf-delivery-ready]')?.textContent).toMatch(/listas \(1\)/)
  })

  it('has no accessibility violations once ready', async () => {
    vi.useRealTimers()
    const { container } = render(<DeliveryOptions rates={[rate('a', '99.00'), rate('b', '129.00')]} announceReady />)
    const res = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations).toEqual([])
  })
})

describe('free shipping', () => {
  it('shows "Envío gratis" and no carrier selector, still submitting the rate', async () => {
    const quote = vi.fn(async () => options([rate('shipping_flat:free', '0.00', { title: 'Envío gratis' })], { free: true, fixed: true }))
    render(<Harness quote={quote} />)
    fillAddress()
    await flush(700)
    expect(document.querySelector('[data-sf-delivery-free-banner]')?.textContent).toMatch(/Envío gratis/)
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0)
    const hidden = document.querySelector<HTMLInputElement>('input[type="hidden"][name="delivery_choice"]')
    expect(hidden?.value).toBe('rate:shipping_flat:free')
  })

  it('keeps the rows when there are pickup branches (delivery or pickup is a real choice)', () => {
    const { container } = render(<DeliveryOptions rates={[rate('f', '0.00')]} pickup={[{ branch_id: 'b1', name: 'Matriz' }]} free />)
    expect(container.querySelector('[data-sf-delivery-free-banner]')).toBeNull()
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(2)
  })
})

describe('helpers', () => {
  it('fingerprint ignores case, accents and fields that do not price the shipment', () => {
    const a = { country_code: 'MX', zip: '44100', province: 'Jalisco', city: 'Guadalajara' }
    expect(quoteFingerprint(a)).toBe(quoteFingerprint({ ...a, city: ' guadalajara ', province: 'JALISCO' }))
    expect(quoteFingerprint(a)).not.toBe(quoteFingerprint({ ...a, zip: '44101' }))
    expect(quoteFingerprint({ ...a, province: 'Querétaro' })).toBe(quoteFingerprint({ ...a, province: 'queretaro' }))
  })
  it('defaultRate is the cheapest non-pickup rate', () => {
    expect(defaultRate(options([rate('p', '0.00', { pickup: true }), rate('a', '99.00'), rate('b', '50.00')]))?.id).toBe('b')
    expect(defaultRate(options([]))).toBeNull()
  })
  it('readQuoteAddress needs a valid postal code and every required field', () => {
    const form = document.createElement('form')
    form.innerHTML = '<input name="zip" value="4410"><input name="province" value="J"><input name="city" value="G"><input name="neighborhood" value="C"><input name="address1" value="A">'
    expect(readQuoteAddress(form)).toBeNull()
    ;(form.elements.namedItem('zip') as HTMLInputElement).value = '44100'
    expect(readQuoteAddress(form)?.country_code).toBe('MX')
    ;(form.elements.namedItem('address1') as HTMLInputElement).value = ' '
    expect(readQuoteAddress(form)).toBeNull()
  })
})
