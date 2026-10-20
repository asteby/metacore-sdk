// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createStorefrontClient, type Availability, type Cart, type Product } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import {
  AddToCartButton,
  AvailabilityBadge,
  CartLineProblem,
  CartProvider,
  RestockNotifyForm,
  StockConflictAlert,
  StorefrontProvider,
  VariantOptionState,
  useCart,
  useProductOptions,
} from './index.js'

const mock = createMockStorefront()
const client = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })

const av = (patch: Partial<Availability>): Availability => ({
  status: 'in_stock', quantity: null, max_per_order: null, restock_eta: null, preorder_release_at: null, notify_available: false, ...patch,
})

async function noViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
}

beforeEach(() => mock.reset())
afterEach(() => cleanup())

describe('AvailabilityBadge', () => {
  it('card: nothing for in_stock, badge for the rest', () => {
    const { container, rerender } = render(<AvailabilityBadge availability={av({})} placement="card" />)
    expect(container.textContent).toBe('')
    rerender(<AvailabilityBadge availability={av({ status: 'out_of_stock' })} placement="card" />)
    expect(container.querySelector('[data-availability=out_of_stock]')?.textContent).toContain('Agotado')
    rerender(<AvailabilityBadge availability={av({ status: 'backorder' })} placement="card" />)
    expect(container.textContent).toContain('Bajo pedido')
  })

  it('detail: "Quedan N" from the server value, ETA and cap; es/en by key', async () => {
    const { container, rerender } = render(
      <AvailabilityBadge availability={av({ status: 'low_stock', quantity: 3, max_per_order: 3 })} />,
    )
    expect(container.textContent).toContain('Quedan 3')
    expect(container.textContent).toContain('Máximo 3 por pedido')
    await noViolations(container)
    rerender(<AvailabilityBadge availability={av({ status: 'low_stock', quantity: 3 })} locale="en" />)
    expect(container.textContent).toContain('Only 3 left')
    rerender(<AvailabilityBadge availability={av({ status: 'backorder', restock_eta: '2026-11-05' })} />)
    expect(container.textContent).toContain('Se envía a partir del 5 de noviembre de 2026')
    rerender(<AvailabilityBadge availability={av({ status: 'low_stock', quantity: 2 })} messages={{ 'status.low_stock_n': '¡Últimas {n}!' }} />)
    expect(container.textContent).toContain('¡Últimas 2!')
  })

  it('polyfill: derives the state from available_for_sale / quantity_available', () => {
    const { container, rerender } = render(<AvailabilityBadge source={{ available_for_sale: false, quantity_available: 0 }} />)
    expect(container.textContent).toContain('Agotado')
    rerender(<AvailabilityBadge source={{ available_for_sale: true, quantity_available: 2 }} lowStockThreshold={5} />)
    expect(container.textContent).toContain('Quedan 2')
    rerender(<AvailabilityBadge source={{ available_for_sale: true, quantity_available: 2 }} />)
    expect(container.textContent).toContain('Disponible')
    expect(container.textContent).not.toContain('Quedan')
  })

  it('takes the locale from the provider', () => {
    const { container } = render(
      <StorefrontProvider locale="en-US">
        <AvailabilityBadge availability={av({ status: 'out_of_stock' })} />
      </StorefrontProvider>,
    )
    expect(container.textContent).toContain('Sold out')
  })

  it('live: role=status', () => {
    const { container } = render(<AvailabilityBadge availability={av({})} live />)
    expect(container.querySelector('[role=status]')).not.toBeNull()
  })
})

describe('VariantOptionState', () => {
  it('strikes through sold-out options and announces them', async () => {
    const { container } = render(
      <ul>
        <li><VariantOptionState availability={av({ status: 'out_of_stock' })}>Chocolate</VariantOptionState></li>
        <li><VariantOptionState availability={av({ status: 'backorder' })}>Vainilla</VariantOptionState></li>
        <li><VariantOptionState availability={av({})}>Fresa</VariantOptionState></li>
      </ul>,
    )
    expect(container.querySelector('s')?.textContent).toBe('Chocolate')
    expect(container.textContent).toContain('(agotado)')
    expect(container.textContent).toContain('Vainilla (bajo pedido)')
    expect(container.textContent).toContain('Fresa')
    await noViolations(container)
  })

  it('useProductOptions exposes the availability of each value', async () => {
    const product = (await client.products.get('playera-basica')) as Product
    let state!: ReturnType<typeof useProductOptions>
    function Probe() {
      state = useProductOptions(product)
      return null
    }
    render(<Probe />)
    const sizes = state.options.find((o) => o.name === 'Talla')!
    expect(sizes.values.every((v) => v.availability?.status === 'in_stock')).toBe(true)
  })
})

describe('AddToCartButton with availability', () => {
  function setup(ui: React.ReactNode) {
    return render(<CartProvider client={client}>{ui}</CartProvider>)
  }

  it('disables and relabels when sold out; the label comes from the server state', async () => {
    const { container } = setup(<AddToCartButton variantId="v1" availability={av({ status: 'out_of_stock' })} />)
    const b = screen.getByRole('button') as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.textContent).toBe('Agotado')
    await noViolations(container)
  })

  it('backorder is purchasable with its own label', () => {
    setup(<AddToCartButton variantId="v1" availability={av({ status: 'backorder' })} />)
    const b = screen.getByRole('button') as HTMLButtonElement
    expect(b.disabled).toBe(false)
    expect(b.textContent).toBe('Pedir bajo pedido')
  })

  it('caps the quantity at max_per_order', async () => {
    const product = (await client.products.get('paraguas-compacto')) as Product
    const v = product.variants[0]!
    const spy = vi.spyOn(client.carts, 'create')
    setup(<AddToCartButton variantId={v.id} quantity={9} availability={av({ status: 'low_stock', quantity: 3, max_per_order: 3 })} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]![0]).toEqual({ lines: [{ variant_id: v.id, quantity: 3 }] })
  })

  it('keeps the old behaviour and label without availability', () => {
    setup(<AddToCartButton variantId="v1" />)
    expect(screen.getByRole('button').textContent).toBe('Agregar al carrito')
  })
})

describe('RestockNotifyForm', () => {
  const sold = av({ status: 'out_of_stock', notify_available: true })

  it('renders only when sold out and the server offers it', () => {
    const { container, rerender } = render(<RestockNotifyForm sku="S1" availability={av({ status: 'out_of_stock' })} />)
    expect(container.querySelector('form')).toBeNull()
    rerender(<RestockNotifyForm sku="S1" availability={av({ notify_available: true })} />)
    expect(container.querySelector('form')).toBeNull()
    rerender(<RestockNotifyForm sku="S1" availability={sold} />)
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('is accessible and posts natively without JS (method, hidden fields, required consent)', async () => {
    const { container } = render(<RestockNotifyForm sku="S1" market="MX" action="/avisame" availability={sold} locale="es-MX" />)
    const form = container.querySelector('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/avisame')
    expect((form.querySelector('[name=sku]') as HTMLInputElement).value).toBe('S1')
    expect((form.querySelector('[name=locale]') as HTMLInputElement).value).toBe('es-MX')
    expect((form.querySelector('[name=consent]') as HTMLInputElement).required).toBe(true)
    await noViolations(container)
  })

  it('submits through the SDK and confirms in place', async () => {
    const sku = ((await client.products.get('calcetines-paquete')) as Product).variants[0]!.sku
    const onSubscribed = vi.fn()
    const spy = vi.spyOn(client.restock, 'subscribe')
    const { container } = render(
      <StorefrontProvider client={client}>
        <RestockNotifyForm sku={sku} availability={sold} onSubscribed={onSubscribed} />
      </StorefrontProvider>,
    )
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByLabelText(/Acepto recibir/))
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!)
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Listo'))
    expect(spy).toHaveBeenCalledWith({ sku, locale: 'es-MX', consent: true, email: 'a@b.co' })
    expect(onSubscribed).toHaveBeenCalled()
  })

  it('shows an alert on failure', async () => {
    const { container } = render(
      <StorefrontProvider client={client}>
        <RestockNotifyForm sku="NOPE" availability={sold} />
      </StorefrontProvider>,
    )
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'a@b.co' } })
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!)
    })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No pudimos guardar'))
  })
})

function Harness() {
  const c = useCart()
  return (
    <div>
      <StockConflictAlert />
      {c.cart?.lines.map((l) => (
        <div key={l.id} data-testid={`line-${l.merchandise.sku}`}>
          <span data-testid="qty">{l.quantity}</span>
          <CartLineProblem line={l} />
        </div>
      ))}
      <button type="button" onClick={() => void c.updateLines([{ id: c.cart!.lines[0]!.id, quantity: 9 }])}>
        pedir 9
      </button>
    </div>
  )
}

describe('cart line problem and recoverable 409', () => {
  async function cartWithUmbrella(): Promise<Cart> {
    const p = (await client.products.get('paraguas-compacto')) as Product // stock 3 (low)
    return client.carts.create({ lines: [{ variant_id: p.variants[0]!.id, quantity: 2 }] })
  }

  it('409 shows our text and the affected line, keeps the cart, and "Ajustar a N" recovers', async () => {
    const initialCart = await cartWithUmbrella()
    const { container } = render(
      <CartProvider client={client} initialCart={initialCart}>
        <Harness />
      </CartProvider>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('pedir 9'))
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Algunos productos cambiaron de existencias')
    expect(alert.textContent).not.toMatch(/insuficientes|Only/)
    expect(alert.textContent).toContain('Paraguas compacto')
    expect(alert.textContent).toContain('Solo puedes llevar 3')
    expect(document.activeElement).toBe(alert)
    expect(screen.getByTestId('qty').textContent).toBe('2')
    await noViolations(container)
    await act(async () => {
      fireEvent.click(screen.getByText('Ajustar a 3'))
    })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByTestId('qty').textContent).toBe('3')
  })

  it('"Quitar" removes the line', async () => {
    const initialCart = await cartWithUmbrella()
    render(
      <CartProvider client={client} initialCart={initialCart}>
        <Harness />
      </CartProvider>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('pedir 9'))
    })
    await screen.findByRole('alert')
    await act(async () => {
      fireEvent.click(screen.getAllByText('Quitar')[0]!)
    })
    await waitFor(() => expect(screen.queryByTestId(/^line-/)).toBeNull())
  })

  it('shows the line problem on load, before any checkout', async () => {
    const p = (await client.products.get('llanta-225-45-r17-runflat')) as Product // stock 2
    const v = p.variants[0]!
    const a = await client.carts.create({ lines: [{ variant_id: v.id, quantity: 2 }] })
    const b = await client.carts.create({ lines: [{ variant_id: v.id, quantity: 2 }] })
    await client.carts.setBuyer(a.id, { email: 'a@b.co' })
    await client.carts.setDelivery(a.id, { method: 'pickup', branch_id: (await client.shop.get()).branches[0]!.id })
    await client.carts.checkout(a.id, { payment_method: 'card', return_url: 'https://x' })
    const loaded = (await client.carts.get(b.id)) as Cart
    const { container } = render(
      <CartProvider client={client} initialCart={loaded}>
        <Harness />
      </CartProvider>,
    )
    expect(container.querySelector('[data-cart-line-problem=out_of_stock]')?.textContent).toContain('Ya no hay existencias')
    expect(screen.queryByText(/Ajustar a/)).toBeNull()
    await noViolations(container)
  })

  it('StockConflictAlert ignores other errors', () => {
    const { container } = render(<StockConflictAlert error={new Error('boom')} />)
    expect(container.textContent).toBe('')
  })
})
