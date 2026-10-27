// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { useRef } from 'react'
import type { DeliveryOptions as Delivery, ShippingRate } from '@asteby/storefront'
import { DeliveryStatus, OrderSummary, useAutoQuote, type QuoteAddress, type UseAutoQuoteOptions } from './index.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const rate = (id: string, cost: string): ShippingRate => ({ id, title: id, cost: mxn(cost) }) as ShippingRate
const opts = (rates: ShippingRate[]): Delivery => ({ rates, pickup: [] })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness(props: { quote: UseAutoQuoteOptions['quote']; initial?: UseAutoQuoteOptions['initial'] }) {
  const ref = useRef<HTMLFormElement>(null)
  const q = useAutoQuote({ formRef: ref, quote: props.quote, required: ['province', 'city'], ...(props.initial ? { initial: props.initial } : {}) })
  return (
    <form ref={ref}>
      <input name="zip" aria-label="zip" />
      <input name="province" aria-label="province" defaultValue="Jalisco" />
      <input name="city" aria-label="city" defaultValue="Guadalajara" />
      <output data-testid="status">{q.status}</output>
      <output data-testid="quoting">{String(q.quoting)}</output>
      <output data-testid="default">{q.defaultValue ?? ''}</output>
      <output data-testid="change">{q.change ? `${q.change.from.amount}>${q.change.to.amount}` : ''}</output>
      <output data-testid="cov">{String(q.noCoverage)}</output>
      <DeliveryStatus state={q.noCoverage ? 'no_coverage' : q.status === 'error' ? 'error' : q.quoting ? 'quoting' : q.status === 'ready' ? 'ready' : 'idle'} change={q.change} onRetry={q.retry} />
    </form>
  )
}
const zip = (v: string) => fireEvent.input(screen.getByLabelText('zip'), { target: { value: v } })
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const text = (id: string) => screen.getByTestId(id).textContent

describe('live delivery quote', () => {
  it('quotes 400 ms after the postal code resolves, without the street (required narrowed), and preselects the cheapest', async () => {
    const quote = vi.fn(async (_a: QuoteAddress) => opts([rate('a', '199.00'), rate('b', '99.00')]))
    render(<Harness quote={quote} />)
    zip('44100')
    await flush(399)
    expect(quote).not.toHaveBeenCalled()
    expect(text('quoting')).toBe('true')
    await flush(5)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(quote.mock.calls[0]![0]).toMatchObject({ zip: '44100', province: 'Jalisco', address1: '' })
    expect(text('status')).toBe('ready')
    expect(text('default')).toBe('rate:b')
  })

  it('race A -> B -> C: only the last answer is applied, older requests are aborted', async () => {
    const signals: AbortSignal[] = []
    const resolvers: Record<string, (d: Delivery) => void> = {}
    const quote = vi.fn((a: QuoteAddress, s: AbortSignal) => {
      signals.push(s)
      return new Promise<Delivery>((res) => { resolvers[a.zip] = res })
    })
    render(<Harness quote={quote} />)
    zip('11111'); await flush(450)
    zip('22222'); await flush(450)
    zip('33333'); await flush(450)
    expect(signals.map((s) => s.aborted)).toEqual([true, true, false])
    resolvers['33333']!(opts([rate('c', '50.00')]))
    await flush(0)
    resolvers['11111']!(opts([rate('a', '10.00')]))
    resolvers['22222']!(opts([rate('b', '20.00')]))
    await flush(0)
    expect(text('default')).toBe('rate:c')
    expect(text('status')).toBe('ready')
  })

  it('network error shows the alert with retry, and retry recovers', async () => {
    let fail = true
    const quote = vi.fn(async () => { if (fail) throw new Error('net'); return opts([rate('a', '199.00')]) })
    render(<Harness quote={quote} />)
    zip('44100'); await flush(450)
    expect(text('status')).toBe('error')
    expect(screen.getByRole('alert').textContent).toMatch(/No pudimos calcular/)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: /intentar de nuevo/i }))
    await flush(0)
    expect(text('status')).toBe('ready')
  })

  it('a re-quote that changes the price announces it (never on the first quote)', async () => {
    let cost = '199.00'
    const quote = vi.fn(async () => opts([rate('a', cost)]))
    render(<Harness quote={quote} />)
    zip('44100'); await flush(450)
    expect(text('change')).toBe('')
    cost = '0.00'
    zip('06600'); await flush(450)
    expect(text('change')).toBe('199.00>0.00')
    expect(document.querySelector('[data-sf-delivery-status-text]')!.textContent).toMatch(/ahora es gratis/)
    zip('03940'); await flush(450)
    expect(text('change')).toBe('')
  })

  it('same price after a re-quote: no notice', async () => {
    const quote = vi.fn(async () => opts([rate('a', '199.00')]))
    render(<Harness quote={quote} />)
    zip('44100'); await flush(450)
    zip('06600'); await flush(450)
    expect(text('change')).toBe('')
  })

  it('no rates and no pickup: coverage message', async () => {
    const quote = vi.fn(async () => opts([]))
    render(<Harness quote={quote} />)
    zip('99999'); await flush(450)
    expect(text('cov')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/no tenemos envío/)
  })

  it('initial rates for the saved address: ready at once with no quote; another postal code quotes', async () => {
    const quote = vi.fn(async () => opts([rate('z', '10.00')]))
    render(<Harness quote={quote} initial={{ delivery: opts([rate('a', '199.00')]), address: { country_code: 'MX', zip: '44100', province: 'Jalisco', city: 'Guadalajara' } }} />)
    zip('44100'); await flush(450)
    expect(quote).not.toHaveBeenCalled()
    expect(text('status')).toBe('ready')
    expect(text('default')).toBe('rate:a')
    zip('06600'); await flush(450)
    expect(quote).toHaveBeenCalledTimes(1)
    expect(text('change')).toBe('199.00>10.00')
  })

  it('the quoting state has no axe violations and keeps its height reserved', async () => {
    const quote = vi.fn(() => new Promise<Delivery>(() => {}))
    const { container } = render(<Harness quote={quote} />)
    zip('44100'); await flush(450)
    const box = container.querySelector<HTMLElement>('[data-sf-delivery-status]')!
    expect(box.style.minHeight).toBe('1.5rem')
    expect(box.textContent).toMatch(/Calculando envío/)
    vi.useRealTimers()
    const res = await axe.run(container)
    expect(res.violations).toEqual([])
  })
})

describe('OrderSummary while quoting', () => {
  const cost = { subtotal: mxn('100.00'), shipping: null, tax: null, tax_included: false, discount: mxn('0.00'), total: mxn('100.00') } as never
  it('shows Calculating… with a spinner in the shipping row', () => {
    const { container } = render(<OrderSummary lines={[]} cost={cost} quoting />)
    const row = container.querySelector('[data-sf-summary-row="shipping"]')!
    expect(row.textContent).toBe('EnvíoCalculando…')
    expect(row.querySelector('[data-sf-spinner]')).not.toBeNull()
  })
})
