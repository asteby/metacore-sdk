// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { Order, OrderLine } from '@asteby/storefront'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrderCard, OrderLines } from './index.js'
import { demo } from './orders-fixtures.js'

afterEach(cleanup)
// happy-dom says every <img> is already complete; a browser says false while the file is in flight.
const proto = HTMLImageElement.prototype
const original = Object.getOwnPropertyDescriptor(proto, 'complete')
beforeEach(() => Object.defineProperty(proto, 'complete', { configurable: true, get: () => false }))
afterEach(() => (original ? Object.defineProperty(proto, 'complete', original) : delete (proto as { complete?: unknown }).complete))
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const line = (over: Partial<OrderLine> = {}): OrderLine => ({ title: 'Balata cerámica', variant_title: null, sku: 'BC-1', quantity: 2, unit: mxn('749.00'), total: mxn('1498.00'), image: { url: 'https://cdn.test/b.jpg', alt: null }, ...over })

describe('<OrderLines />', () => {
  it('shows picture, name, SKU, quantity, unit and line total', () => {
    const { container } = render(<OrderLines order={{ lines: [line({ variant_title: 'Delantera' })] }} locale="es-MX" />)
    const row = container.querySelector('[data-sf-order-line]')!
    expect(row.querySelector('img')!.getAttribute('src')).toBe('https://cdn.test/b.jpg')
    expect(row.querySelector('[data-sf-preview-body]')!.textContent).toBe('Balata cerámicaDelanteraSKU BC-1Cantidad 2 · $749.00 c/u')
    expect(row.querySelector('[data-sf-preview-total]')!.textContent).toBe('$1,498.00')
  })

  it('degrades: no image, deleted product, default variant and a malformed line never break the list', () => {
    const lines = [line({ image: null, variant_title: 'Default Title' }), line({ title: '', sku: null, image: null }), null, 'x', line({ image: { url: '' } as never, quantity: Number.NaN })] as unknown as OrderLine[]
    const { container } = render(<OrderLines order={{ lines }} locale="es-MX" />)
    expect(container.querySelectorAll('[data-sf-order-line]')).toHaveLength(3)
    expect(container.querySelector('[data-sf-preview-variant]')).toBeNull()
    expect(screen.getByText('Producto no disponible')).toBeTruthy()
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })

  it('speaks English and renders nothing for an order without lines', () => {
    const { container, rerender } = render(<OrderLines order={{ lines: [line()] }} locale="en-US" />)
    expect(container.querySelector('[data-sf-preview-meta]')!.textContent).toBe('Quantity 2 · MX$749.00 each')
    rerender(<OrderLines order={{ lines: [] }} />)
    expect(container.innerHTML).toBe('')
  })

  it('has no accessibility violations (demo order)', async () => {
    const { detail } = await demo()
    const { container } = render(<OrderLines order={await detail('ord_seed_shipped')} />)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('<OrderCard /> products', () => {
  it('shows the overlapped pictures with +N and none when there are no lines', () => {
    const lines = Array.from({ length: 6 }, (_, i) => line({ title: `P${i}`, sku: `S${i}` }))
    const order = { id: 'o1', number: '1001', created_at: null, total: mxn('10'), lines } as unknown as Order
    const { container, rerender } = render(<OrderCard order={order} orderHref={() => '/x'} />)
    expect(container.querySelectorAll('[data-sf-order-products] [data-sf-thumb]')).toHaveLength(3)
    expect(container.querySelector('[data-sf-thumb-more]')!.textContent).toBe('+3')
    rerender(<OrderCard order={{ ...order, lines: [] } as Order} orderHref={() => '/x'} />)
    expect(container.querySelector('[data-sf-order-products]')).toBeNull()
  })
})
