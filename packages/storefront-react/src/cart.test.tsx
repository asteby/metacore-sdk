// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStorefrontClient, type Product } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import { AddToCartButton, CartProvider, StorefrontProvider, readCartCookie, toMerchandise, useCart, type CartContextValue } from './index.js'

const BASE = 'https://mock.local/api/gw'

function setup(latencyMs = 0) {
  const mock = createMockStorefront({ latencyMs })
  const client = createStorefrontClient({ baseUrl: BASE, token: 'pk_test', fetch: mock.fetch })
  return { mock, client }
}

let api: CartContextValue
function Probe() {
  api = useCart()
  return (
    <output data-testid="cart">
      {api.totalQuantity}|{api.status}|{api.cart?.cost.subtotal.amount ?? '-'}|{api.error?.message ?? ''}
    </output>
  )
}

afterEach(() => {
  cleanup()
  document.cookie = 'sf_cart=; Max-Age=0; Path=/'
})

describe('CartProvider', () => {
  it('creates the cart on first add, persists the id in sf_cart and adds optimistically', async () => {
    const { client } = setup(30)
    const product = (await client.products.get('playera-basica')) as Product
    const variant = product.variants[0]!
    render(
      <StorefrontProvider client={client}>
        <CartProvider>
          <Probe />
          <AddToCartButton variantId={variant.id} quantity={2} merchandise={toMerchandise(product, variant)}>
            Agregar
          </AddToCartButton>
        </CartProvider>
      </StorefrontProvider>,
    )
    expect(screen.getByTestId('cart').textContent).toBe('0|idle|-|')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    // Optimistic: visible before the server answers.
    await waitFor(() => expect(screen.getByTestId('cart').textContent).toBe('2|updating|498.00|'))
    expect(screen.getByRole('button')).toHaveProperty('disabled', true)
    await waitFor(() => expect(screen.getByTestId('cart').textContent).toBe('2|idle|498.00|'))
    expect(api.cart?.lines[0]!.id).not.toMatch(/^optimistic:/)
    expect(readCartCookie()).toBe(api.cartId)
    expect(api.cartId).toMatch(/^cart_/)
  })

  it('rolls back a failed optimistic update and keeps earlier ones', async () => {
    const { client } = setup(10)
    const product = (await client.products.get('paraguas-compacto')) as Product // stock 3
    const variant = product.variants[0]!
    const initialCart = await client.carts.create({ lines: [{ variant_id: variant.id, quantity: 1 }] })
    render(
      <CartProvider client={client} initialCart={initialCart}>
        <Probe />
      </CartProvider>,
    )
    const lineId = initialCart.lines[0]!.id
    let first: Promise<unknown>
    let second: Promise<unknown>
    act(() => {
      first = api.updateLines([{ id: lineId, quantity: 2 }])
      second = api.updateLines([{ id: lineId, quantity: 9 }]) // exceeds stock → 409
    })
    expect(screen.getByTestId('cart').textContent).toMatch(/^9\|updating/)
    await act(async () => {
      await first
      await second
    })
    expect(screen.getByTestId('cart').textContent).toBe('2|idle|598.00|Algunos productos ya no tienen existencias suficientes')
    expect(api.error).toMatchObject({ status: 409, code: 'insufficient_stock' })
  })

  it('removes lines optimistically', async () => {
    const { client } = setup(10)
    const product = (await client.products.get('taza-ceramica')) as Product
    const initialCart = await client.carts.create({ lines: [{ variant_id: product.variants[0]!.id, quantity: 3 }] })
    render(
      <CartProvider client={client} initialCart={initialCart}>
        <Probe />
      </CartProvider>,
    )
    let p: Promise<unknown>
    act(() => {
      p = api.removeLines([initialCart.lines[0]!.id])
    })
    expect(screen.getByTestId('cart').textContent).toBe('0|updating|0.00|')
    await act(async () => {
      await p
    })
    expect(screen.getByTestId('cart').textContent).toBe('0|idle|0.00|')
  })

  it('hydrates from the cookie and drops unknown carts', async () => {
    const { client } = setup()
    const product = (await client.products.get('gorra-clasica')) as Product
    const existing = await client.carts.create({ lines: [{ variant_id: product.variants[0]!.id, quantity: 4 }] })
    document.cookie = `sf_cart=${existing.id}; Path=/`
    render(
      <CartProvider client={client}>
        <Probe />
      </CartProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('cart').textContent).toBe('4|idle|796.00|'))
    cleanup()

    document.cookie = 'sf_cart=cart_gone; Path=/'
    render(
      <CartProvider client={client}>
        <Probe />
      </CartProvider>,
    )
    await waitFor(() => expect(readCartCookie()).toBeNull())
    expect(api.cart).toBeNull()
  })

  it('applies discount codes through the API', async () => {
    const { client } = setup()
    const product = (await client.products.get('lampara-mesa')) as Product
    const initialCart = await client.carts.create({ lines: [{ variant_id: product.variants[0]!.id, quantity: 1 }] })
    render(
      <CartProvider client={client} initialCart={initialCart}>
        <Probe />
      </CartProvider>,
    )
    await act(async () => {
      await api.setDiscountCodes(['BIENVENIDA10'])
    })
    expect(api.cart?.cost.discount.amount).toBe('119.90')
    expect(api.cart?.discount_codes).toEqual([{ code: 'BIENVENIDA10', applicable: true }])
  })
})
