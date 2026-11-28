// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Cart, CartLine } from '@asteby/storefront'
import { CartDrawer, cartOptimistic, closeCartDrawer, openCartDrawer, type CartDrawerLabels, type CartDrawerPaths } from './index.js'
import { addPendingPrices, optimisticSubtotal, scaleLineTotal, stockCap } from './optimistic-quantity.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const labels: CartDrawerLabels = {
  title: 'Tu carrito', close: 'Cerrar', empty: 'Vacío', subtotal: 'Subtotal', checkout: 'Pagar', viewCart: 'Ver carrito',
  remove: 'Quitar', increase: 'Más', decrease: 'Menos',
}
const paths: CartDrawerPaths = { cart: '/carrito', checkout: '/pagar' }

const line = (id: string, quantity: number, total: string, discount?: string): CartLine =>
  ({
    id,
    quantity,
    merchandise: { id: `v-${id}`, title: 'Default Title', product: { handle: `p-${id}`, title: `Producto ${id}`, featured_image: null } },
    cost: { total: mxn(total), unit: mxn('50.00'), compare_at_unit: null, ...(discount ? { discount: mxn(discount) } : {}) },
  }) as unknown as CartLine
const cart = (lines: CartLine[], subtotal: string): Cart =>
  ({ id: 'c1', lines, total_quantity: lines.reduce((n, l) => n + l.quantity, 0), cost: { subtotal: mxn(subtotal) } }) as unknown as Cart

it('estimates pending additions from unit quotes, including an empty cart', () => {
  const rows = [{ price: mxn('55.99'), quantity: 2 }]
  expect(addPendingPrices(null, rows)).toEqual(mxn('111.98'))
  expect(addPendingPrices(mxn('31.99'), rows)).toEqual(mxn('143.97'))
  expect(addPendingPrices(mxn('31.99'), [...rows, { quantity: 1 }])).toBeNull()
  expect(addPendingPrices({ amount: '0.00', currency_code: 'USD' }, rows)).toBeNull()
})

describe('cantidad optimista: cálculo puro', () => {
  it('escala el precio de la línea por la cantidad, conservando los decimales de OPS', () => {
    expect(scaleLineTotal(line('1', 2, '100.00'), 3)).toEqual(mxn('150.00'))
    expect(scaleLineTotal(line('1', 2, '674.10'), 1)).toEqual(mxn('337.05'))
    expect(scaleLineTotal(line('1', 2, '100.00'), 0)).toEqual(mxn('0.00'))
    expect(scaleLineTotal(line('1', 2, '100'), 3)).toEqual(mxn('150'))
  })

  it('una cantidad inválida o una línea sin cantidad devuelve lo de OPS', () => {
    expect(scaleLineTotal(line('1', 0, '100.00'), 3)).toEqual(mxn('100.00'))
    expect(scaleLineTotal(line('1', 2, '100.00'), -1)).toEqual(mxn('100.00'))
    expect(scaleLineTotal(line('1', 2, '100.00'), Number.NaN)).toEqual(mxn('100.00'))
  })

  it('subtotal: sin borradores es el de OPS tal cual', () => {
    const c = cart([line('1', 2, '100.00')], '100.00')
    expect(optimisticSubtotal(c, {})).toBe(c.cost.subtotal)
    expect(optimisticSubtotal(c, { '1': 2 })).toBe(c.cost.subtotal)
  })

  it('subtotal sin descuento de línea: cambia en la proporción del precio de la línea', () => {
    const c = cart([line('1', 2, '100.00'), line('2', 1, '40.00')], '140.00')
    expect(optimisticSubtotal(c, { '1': 3 })).toEqual(mxn('190.00'))
    expect(optimisticSubtotal(c, { '1': 1, '2': 2 })).toEqual(mxn('130.00'))
  })

  it('subtotal ANTES del descuento (precio de línea con descuento): mide el cambio en la base del subtotal', () => {
    // 1 pieza: 100.00 bruto, 10.00 de descuento, 90.00 de línea; OPS manda el subtotal bruto
    const c = cart([line('1', 1, '90.00', '10.00')], '100.00')
    expect(optimisticSubtotal(c, { '1': 2 })).toEqual(mxn('200.00'))
    // y el precio de la línea sigue escalando el total con descuento
    expect(scaleLineTotal(c.lines[0] as CartLine, 2)).toEqual(mxn('180.00'))
  })

  it('subtotal DESPUÉS del descuento: se mide en esa base', () => {
    const c = cart([line('1', 1, '90.00', '10.00')], '90.00')
    expect(optimisticSubtotal(c, { '1': 2 })).toEqual(mxn('180.00'))
  })

  it('nunca baja de cero', () => {
    const c = cart([line('1', 2, '100.00')], '100.00')
    expect(optimisticSubtotal(c, { '1': 0 })).toEqual(mxn('0.00'))
  })
})

describe('CartDrawer: cantidad optimista con envío programático', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    act(() => closeCartDrawer())
    cleanup()
    vi.useRealTimers()
  })

  const setup = (over: { debounce?: number } = {}) => {
    const submit = vi.fn()
    let formData: FormData | null = null
    const Form = (p: Record<string, unknown>) => <form {...p} />
    const useLineForm = () => ({ Form, formData, submit })
    const props = { labels, paths, useLineForm, ...(over.debounce === undefined ? {} : { quantityDebounceMs: over.debounce }) }
    const view = (c: Cart) => <CartDrawer cart={c} {...props} />
    const r = render(view(cart([line('1', 2, '100.00')], '100.00')))
    act(() => openCartDrawer())
    return { submit, setFormData: (f: FormData | null) => (formData = f), rerender: (c: Cart) => r.rerender(view(c)) }
  }
  const more = () => fireEvent.click(screen.getByLabelText('Más'))
  const less = () => fireEvent.click(screen.getByLabelText('Menos'))
  const subtotalText = () => document.querySelector('[data-sf-cart-subtotal-value]')?.textContent ?? ''
  const priceText = () => document.querySelector('[data-sf-cart-price]')?.textContent ?? ''

  it('al hacer clic mueve cantidad, precio de línea y subtotal al instante, sin esperar a OPS', () => {
    const { submit } = setup()
    more()
    expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('3')
    expect(priceText()).toContain('150.00')
    expect(subtotalText()).toContain('150.00')
    expect(document.querySelector('[data-sf-cart-drawer]')?.hasAttribute('data-sf-cart-syncing')).toBe(true)
    expect(document.querySelector('[data-sf-cart-price]')?.hasAttribute('data-sf-optimistic')).toBe(true)
    expect(submit).not.toHaveBeenCalled()
  })

  it('agrupa los clics seguidos en UNA petición con la cantidad final', () => {
    const { submit } = setup()
    more()
    more()
    more()
    expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('5')
    act(() => void vi.advanceTimersByTime(249))
    expect(submit).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(submit).toHaveBeenCalledTimes(1)
    const [body, options] = submit.mock.calls[0] as [FormData, { method: string; action: string }]
    expect(Object.fromEntries(body.entries())).toEqual({ intent: 'update', line_id: '1', quantity: '5' })
    expect(options).toEqual({ method: 'post', action: '/carrito' })
  })

  it('mas y menos seguidos mandan la cantidad neta', () => {
    const { submit } = setup()
    more()
    less()
    less()
    act(() => void vi.advanceTimersByTime(250))
    expect((submit.mock.calls[0]?.[0] as FormData).get('quantity')).toBe('1')
  })

  it('quantityDebounceMs=0: una petición por clic', () => {
    const { submit } = setup({ debounce: 0 })
    more()
    more()
    expect(submit).toHaveBeenCalledTimes(2)
    expect((submit.mock.calls[1]?.[0] as FormData).get('quantity')).toBe('4')
  })

  it('al llegar la respuesta de OPS con la cantidad elegida, el borrador se retira y manda lo de OPS', () => {
    const { rerender } = setup()
    more()
    act(() => void vi.advanceTimersByTime(250))
    rerender(cart([line('1', 3, '147.00')], '147.00'))
    expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('3')
    expect(priceText()).toContain('147.00') // el precio de OPS (con su descuento), no el estimado
    expect(subtotalText()).toContain('147.00')
    expect(document.querySelector('[data-sf-cart-drawer]')?.hasAttribute('data-sf-cart-syncing')).toBe(false)
  })

  it('si OPS responde con otra cantidad (tope de existencias), se muestra la de OPS', () => {
    const { rerender, setFormData } = setup()
    more()
    more() // 4
    act(() => void vi.advanceTimersByTime(250))
    const inFlight = new FormData()
    inFlight.set('intent', 'update')
    inFlight.set('quantity', '4')
    setFormData(inFlight)
    rerender(cart([line('1', 2, '100.00')], '100.00')) // petición en vuelo
    setFormData(null)
    rerender(cart([line('1', 3, '150.00')], '150.00')) // OPS dejó 3
    expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('3')
    expect(document.querySelector('[data-sf-cart-drawer]')?.hasAttribute('data-sf-cart-syncing')).toBe(false)
  })

  it('bajar a 0 oculta la fila al instante y manda la cantidad 0', () => {
    const { submit } = setup()
    less()
    less()
    expect(screen.queryByText('Producto 1')).toBeNull()
    act(() => void vi.advanceTimersByTime(250))
    expect((submit.mock.calls[0]?.[0] as FormData).get('quantity')).toBe('0')
  })
})

describe('CartDrawer: sin envío programático (formulario nativo)', () => {
  afterEach(() => {
    act(() => closeCartDrawer())
    cleanup()
  })

  it('no intercepta el clic: cada botón sigue siendo un submit con su cantidad', () => {
    render(<CartDrawer cart={cart([line('1', 2, '100.00')], '100.00')} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    const plus = screen.getByLabelText('Más') as HTMLButtonElement
    expect(plus.type).toBe('submit')
    expect(plus.value).toBe('3')
    const allowed = fireEvent.click(plus)
    expect(allowed).toBe(true) // no se llamó a preventDefault
    expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('2')
  })
})

const withStock = (l: CartLine, available: number | null): CartLine =>
  ({ ...l, merchandise: { ...(l.merchandise as object), quantity_available: available } }) as unknown as CartLine

describe('tope de existencias', () => {
  it('stockCap: entero sin negativos; null o no numérico = sin tope', () => {
    expect(stockCap(withStock(line('1', 1, '10.00'), 3))).toBe(3)
    expect(stockCap(withStock(line('1', 1, '10.00'), 2.9))).toBe(2)
    expect(stockCap(withStock(line('1', 1, '10.00'), -4))).toBe(0)
    expect(stockCap(withStock(line('1', 1, '10.00'), null))).toBeNull()
    expect(stockCap(line('1', 1, '10.00'))).toBeNull()
  })

  describe('en el cajón', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      cartOptimistic.reset()
    })
    afterEach(() => {
      act(() => closeCartDrawer())
      cleanup()
      cartOptimistic.reset()
      vi.useRealTimers()
    })
    const mount = (available: number | null, quantity: number, extra: Record<string, unknown> = {}) => {
      const submit = vi.fn()
      const Form = (p: Record<string, unknown>) => <form {...p} />
      render(<CartDrawer cart={cart([withStock(line('1', quantity, '100.00'), available)], '100.00')} labels={labels} paths={paths} useLineForm={() => ({ Form, formData: null, submit })} {...extra} />)
      act(() => openCartDrawer())
      return submit
    }

    it('no deja subir más de lo que hay: no manda nada, no cambia la cantidad y avisa', () => {
      const submit = mount(3, 3)
      fireEvent.click(screen.getByLabelText('Más'))
      act(() => void vi.advanceTimersByTime(500))
      expect(submit).not.toHaveBeenCalled()
      expect(document.querySelector('[data-sf-cart-qty-value]')?.textContent).toBe('3')
      expect(document.querySelector('[data-sf-cart-notice]')?.textContent).toContain('Solo hay 3 disponibles de Producto 1')
    })

    it('hasta el tope sí sube', () => {
      const submit = mount(3, 2)
      fireEvent.click(screen.getByLabelText('Más'))
      act(() => void vi.advanceTimersByTime(250))
      expect((submit.mock.calls[0]?.[0] as FormData).get('quantity')).toBe('3')
      expect(document.querySelector('[data-sf-cart-notice]')).toBeNull()
    })

    it('bajar siempre se permite, aunque la línea ya esté por encima del tope', () => {
      const submit = mount(1, 3)
      fireEvent.click(screen.getByLabelText('Menos'))
      act(() => void vi.advanceTimersByTime(250))
      expect((submit.mock.calls[0]?.[0] as FormData).get('quantity')).toBe('2')
    })

    it('sin dato de stock no hay tope', () => {
      const submit = mount(null, 5)
      fireEvent.click(screen.getByLabelText('Más'))
      act(() => void vi.advanceTimersByTime(250))
      expect((submit.mock.calls[0]?.[0] as FormData).get('quantity')).toBe('6')
    })

    it('onQuantityLimit sustituye al aviso del cajón', () => {
      const onQuantityLimit = vi.fn()
      mount(2, 2, { onQuantityLimit })
      fireEvent.click(screen.getByLabelText('Más'))
      expect(onQuantityLimit).toHaveBeenCalledWith(expect.objectContaining({ max: 2 }))
      expect(document.querySelector('[data-sf-cart-notice]')).toBeNull()
    })

    it('agotado (0) usa el texto de agotado', () => {
      mount(0, 1)
      fireEvent.click(screen.getByLabelText('Más'))
      expect(document.querySelector('[data-sf-cart-notice]')?.textContent).toContain('se agotó')
    })
  })
})
