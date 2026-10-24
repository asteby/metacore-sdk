// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { useState } from 'react'
import type { Cart, CartLine } from '@asteby/storefront'
import { CartDrawer, cartOptimistic, closeCartDrawer, defaultAddOutcome, describeAddFailure, isCartDrawerOpen, useOptimisticAdd, useOptimisticCartCount, type CartDrawerLabels, type CartDrawerPaths } from './index.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const labels: CartDrawerLabels = {
  title: 'Tu carrito', close: 'Cerrar', empty: 'Vacío', subtotal: 'Subtotal', checkout: 'Pagar', viewCart: 'Ver carrito',
  remove: 'Quitar', increase: 'Más', decrease: 'Menos',
}
const paths: CartDrawerPaths = { cart: '/carrito', checkout: '/pagar' }
const realLine = (id: string, variant: string, quantity: number): CartLine =>
  ({ id, quantity, merchandise: { id: variant, title: 'Default Title', product: { handle: `h-${variant}`, title: `Real ${variant}`, featured_image: null } }, cost: { total: mxn('100.00'), unit: mxn('50.00'), compare_at_unit: null } }) as unknown as CartLine
const cart = (lines: CartLine[]): Cart => ({ id: 'c', lines, total_quantity: lines.reduce((n, l) => n + l.quantity, 0), cost: { subtotal: mxn('300.00') } }) as unknown as Cart
const input = (v: string, extra = {}) => ({ variantId: v, title: `Bujía ${v}`, price: mxn('59.00'), ...extra })

afterEach(() => {
  act(() => {
    cartOptimistic.reset()
    closeCartDrawer()
  })
  cleanup()
  vi.useRealTimers()
})

const mount = (c: Cart | null = null) => render(<CartDrawer cart={c} labels={labels} paths={paths} />)

describe('estado optimista del cajón', () => {
  it('agregar: fila al instante, cajón abierto, contador y estado «Agregando…»; confirmar la quita', () => {
    mount()
    let id = ''
    act(() => { id = cartOptimistic.add(input('v1')) })
    expect(isCartDrawerOpen()).toBe(true)
    expect(screen.getByText('Bujía v1')).toBeTruthy()
    expect(screen.getByText(/Agregando…/)).toBeTruthy()
    expect(screen.getByText(/calculando…/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tu carrito (1)', hidden: true })).toBeTruthy()
    expect(screen.getByRole('status', { hidden: true }).textContent).toContain('Agregado al carrito')
    act(() => cartOptimistic.confirm(id))
    expect(screen.queryByText('Bujía v1')).toBeNull()
  })

  it('no roba el foco al botón de cierre', () => {
    mount()
    act(() => { cartOptimistic.add(input('v1')) })
    expect(document.activeElement).not.toBe(screen.getByLabelText('Cerrar', { selector: 'button' }))
  })

  it('fallo: quita la fila, revierte el contador, avisa en es-MX y cierra el cajón vacío', () => {
    mount()
    let id = ''
    act(() => { id = cartOptimistic.add(input('v1')) })
    act(() => cartOptimistic.rollback(id, 'sin existencias suficientes'))
    expect(screen.queryByText('Bujía v1')).toBeNull()
    expect(isCartDrawerOpen()).toBe(false)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('No pudimos agregar Bujía v1: sin existencias suficientes')
    fireEvent.click(screen.getByLabelText('Descartar aviso'))
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('')
  })

  it('doble clic con la misma clave no duplica; misma variante suma en una sola fila', () => {
    mount()
    act(() => {
      cartOptimistic.add(input('v1', { key: 'click-1' }))
      cartOptimistic.add(input('v1', { key: 'click-1' }))
    })
    expect(screen.getAllByText('Bujía v1')).toHaveLength(1)
    expect(screen.getByText(/×1/)).toBeTruthy()
    act(() => { cartOptimistic.add(input('v1', { key: 'click-2' })) })
    expect(screen.getAllByText('Bujía v1')).toHaveLength(1)
    expect(screen.getByText(/×2/)).toBeTruthy()
  })

  it('dos productos y confirmaciones en orden inverso no se pisan', () => {
    mount()
    let a = ''
    let b = ''
    act(() => {
      a = cartOptimistic.add(input('v1'))
      b = cartOptimistic.add(input('v2'))
    })
    expect(screen.getByRole('heading', { name: 'Tu carrito (2)', hidden: true })).toBeTruthy()
    act(() => cartOptimistic.confirm(b))
    expect(screen.getByText('Bujía v1')).toBeTruthy()
    expect(screen.queryByText('Bujía v2')).toBeNull()
    act(() => cartOptimistic.rollback(a, 'x'))
    expect(screen.queryByText('Bujía v1')).toBeNull()
  })

  it('si la variante ya está en el carrito real, suma la cantidad en esa línea sin duplicarla', () => {
    mount(cart([realLine('L1', 'v1', 2)]))
    act(() => { cartOptimistic.add(input('v1')) })
    expect(screen.getAllByText('Real v1')).toHaveLength(1)
    expect(screen.queryByText('Bujía v1')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Tu carrito (3)', hidden: true })).toBeTruthy()
  })

  it('tiempo agotado revierte con aviso', () => {
    vi.useFakeTimers()
    mount()
    act(() => { cartOptimistic.add(input('v1'), { timeoutMs: 1000 }) })
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.getByRole('alert').textContent).toContain('tardó demasiado')
  })

  it('Escape cierra el cajón', () => {
    mount()
    act(() => { cartOptimistic.add(input('v1')) })
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }))
    expect(isCartDrawerOpen()).toBe(false)
  })

  it('axe: sin violaciones con fila provisional y con aviso', async () => {
    const { container } = mount()
    act(() => { cartOptimistic.add(input('v1')) })
    act(() => { cartOptimistic.rollback(cartOptimistic.add(input('v2')), 'revisa tu conexión') })
    const res = await axe.run(container, { rules: { region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
  })
})

function Store({ fetcher, children }: { fetcher: { state: string; data?: unknown }; children?: never }) {
  const { add } = useOptimisticAdd(fetcher)
  const count = useOptimisticCartCount(0)
  return (
    <>
      <span data-testid="count">{count}</span>
      <button onClick={() => add(input('v1'), () => {})}>Agregar</button>
    </>
  )
}

describe('useOptimisticAdd', () => {
  it('confirma al terminar el fetcher y revierte si trae error', () => {
    mount()
    const { rerender } = render(<Store fetcher={{ state: 'idle' }} />)
    fireEvent.click(screen.getByText('Agregar'))
    expect(screen.getByTestId('count').textContent).toBe('1')
    rerender(<Store fetcher={{ state: 'submitting' }} />)
    rerender(<Store fetcher={{ state: 'idle', data: { cart: 1 } }} />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('')

    fireEvent.click(screen.getByText('Agregar'))
    rerender(<Store fetcher={{ state: 'submitting' }} />)
    rerender(<Store fetcher={{ state: 'idle', data: { error: { code: 'store_not_ready' } } }} />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByRole('alert').textContent).toContain('la tienda está cerrada')
  })

  it('desmontar a medias descarta la fila sin aviso', () => {
    mount()
    const view = render(<Store fetcher={{ state: 'idle' }} />)
    fireEvent.click(screen.getByText('Agregar'))
    view.unmount()
    expect(cartOptimistic.getSnapshot().rows).toHaveLength(0)
    expect(cartOptimistic.getSnapshot().notices).toHaveLength(0)
  })
})

describe('motivos', () => {
  it('traduce 409, tienda cerrada, red y 5xx', () => {
    expect(describeAddFailure({ status: 409 })).toBe('sin existencias suficientes')
    expect(describeAddFailure({ code: 'store_not_ready' })).toBe('la tienda está cerrada por ahora')
    expect(describeAddFailure({ status: 0 })).toBe('revisa tu conexión')
    expect(describeAddFailure({ status: 503 })).toBe('hubo un problema, intenta de nuevo')
    expect(defaultAddOutcome({ status: 409 })).toEqual({ ok: false, reason: 'sin existencias suficientes' })
    expect(defaultAddOutcome(undefined)).toEqual({ ok: true })
  })
})
