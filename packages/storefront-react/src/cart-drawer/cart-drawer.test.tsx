// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import type { Cart, CartLine } from '@asteby/storefront'
import { CartDrawer, closeCartDrawer, handleCartLinkClick, isCartDrawerOpen, openCartDrawer, useCartDrawer, useOpenCartDrawerWhenDone, type CartDrawerLabels, type CartDrawerPaths } from './index.js'

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const labels: CartDrawerLabels = {
  title: 'Tu carrito', close: 'Cerrar', empty: 'Vacío', emptyHint: 'Agrega algo', browse: 'Ver tienda', subtotal: 'Subtotal',
  note: 'Se calcula al pagar', checkout: 'Pagar', viewCart: 'Ver carrito', remove: 'Quitar', increase: 'Más', decrease: 'Menos',
}
const paths: CartDrawerPaths = { cart: '/carrito', checkout: '/pagar', browse: '/tienda', product: (h) => `/p/${h}` }

const line = (id: string, quantity: number, variantTitle = 'Default Title'): CartLine => ({
  id,
  quantity,
  merchandise: { id: `v-${id}`, title: variantTitle, product: { handle: `prod-${id}`, title: `Producto ${id}`, featured_image: null } },
  cost: { total: mxn('100.00'), unit: mxn('50.00'), compare_at_unit: null },
} as unknown as CartLine)
const cart = (lines: CartLine[]): Cart =>
  ({ id: 'c1', lines, total_quantity: lines.reduce((n, l) => n + l.quantity, 0), cost: { subtotal: mxn('300.00') } }) as unknown as Cart

afterEach(() => {
  act(() => closeCartDrawer())
  cleanup()
  document.documentElement.style.overflow = ''
})

describe('CartDrawer', () => {
  it('no se pinta cerrado, ni en el servidor', () => {
    expect(renderToString(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} />)).toBe('')
    const { container } = render(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} />)
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('abre con openCartDrawer: título con cantidad, líneas, subtotal de OPS y enlaces', () => {
    render(<CartDrawer cart={cart([line('1', 2, 'Chocolate'), line('2', 1)])} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    const dlg = screen.getByRole('dialog', { hidden: true })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Tu carrito (3)', hidden: true })).toBeTruthy()
    expect(screen.getByText('Chocolate')).toBeTruthy()
    expect(screen.queryByText('Default Title')).toBeNull()
    expect(screen.getByText(/300/)).toBeTruthy() // cart.cost.subtotal, sin recalcular
    expect(screen.getByText('Se calcula al pagar')).toBeTruthy()
    expect(screen.getByText('Pagar').closest('a')?.getAttribute('href')).toBe('/pagar')
    expect(screen.getByText('Ver carrito').closest('a')?.getAttribute('href')).toBe('/carrito')
    expect(screen.getByText('Producto 1').closest('a')?.getAttribute('href')).toBe('/p/prod-1')
  })

  it('bloquea el scroll del fondo mientras está abierto y lo restaura', () => {
    render(<CartDrawer cart={cart([line('1', 1)])} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    expect(document.documentElement.style.overflow).toBe('hidden')
    act(() => closeCartDrawer())
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('cierra con la X, con Esc y con clic en el fondo', () => {
    render(<CartDrawer cart={cart([line('1', 1)])} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    fireEvent.click(screen.getByLabelText('Cerrar', { selector: 'button' }))
    expect(isCartDrawerOpen()).toBe(false)

    act(() => openCartDrawer())
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { cancelable: true }))
    expect(isCartDrawerOpen()).toBe(false)

    act(() => openCartDrawer())
    fireEvent.click(screen.getByRole('dialog', { hidden: true }))
    expect(isCartDrawerOpen()).toBe(false)
  })

  it('formularios nativos hacia la acción de ruta: cantidad ±1 y quitar', () => {
    render(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    const inc = screen.getByLabelText('Más') as HTMLButtonElement
    const dec = screen.getByLabelText('Menos') as HTMLButtonElement
    expect(inc.value).toBe('3')
    expect(dec.value).toBe('1')
    const form = inc.closest('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/carrito')
    expect((form.querySelector('[name=intent]') as HTMLInputElement).value).toBe('update')
    expect((form.querySelector('[name=line_id]') as HTMLInputElement).value).toBe('1')
    const rm = screen.getByText('Quitar').closest('form')!
    expect((rm.querySelector('[name=intent]') as HTMLInputElement).value).toBe('remove')
  })

  it('useLineForm: pinta la cantidad optimista y oculta la línea al quitar', () => {
    let pending: FormData | null = null
    const Form = (p: Record<string, unknown>) => <form {...p} />
    const useLineForm = () => ({ Form, formData: pending })
    const { rerender } = render(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} useLineForm={useLineForm} />)
    act(() => openCartDrawer())
    pending = new FormData()
    pending.set('intent', 'update')
    pending.set('quantity', '5')
    rerender(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} useLineForm={useLineForm} />)
    expect(screen.getByText('5')).toBeTruthy()
    pending = new FormData()
    pending.set('intent', 'remove')
    rerender(<CartDrawer cart={cart([line('1', 2)])} labels={labels} paths={paths} useLineForm={useLineForm} />)
    expect(screen.queryByText('Producto 1')).toBeNull()
  })

  it('contrato de campos configurable', () => {
    render(<CartDrawer cart={cart([line('1', 1)])} labels={labels} paths={paths} form={{ intentField: 'op', lineField: 'line', quantityField: 'qty', updateIntent: 'set', removeIntent: 'del' }} />)
    act(() => openCartDrawer())
    expect((screen.getByLabelText('Más') as HTMLButtonElement).name).toBe('qty')
    const rm = screen.getByText('Quitar').closest('form')!
    expect((rm.querySelector('[name=op]') as HTMLInputElement).value).toBe('del')
  })

  it('estado vacío con enlace para seguir comprando', () => {
    render(<CartDrawer cart={cart([])} labels={labels} paths={paths} />)
    act(() => openCartDrawer())
    expect(screen.getByText('Vacío')).toBeTruthy()
    expect(screen.getByText('Ver tienda').closest('a')?.getAttribute('href')).toBe('/tienda')
    expect(screen.queryByText('Pagar')).toBeNull()
  })

  it('barra de envío con progressbar, aviso, upsell y renderers inyectados', () => {
    render(
      <CartDrawer
        cart={cart([line('1', 1)])}
        labels={labels}
        paths={paths}
        shipping={{ message: 'Te faltan $50', percent: 40, progressLabel: 'Avance' }}
        upsell={<p>Sugerido X</p>}
        upsellTitle="Podría interesarte"
        renderMoney={(m) => `MONEY:${m.amount}`}
      />,
    )
    act(() => openCartDrawer())
    const bar = screen.getByRole('progressbar', { name: 'Avance', hidden: true })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('Sugerido X')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Podría interesarte', hidden: true })).toBeTruthy()
    expect(screen.getByText('MONEY:300.00')).toBeTruthy()
  })

  it('renderLink y classNames', () => {
    render(
      <CartDrawer
        cart={cart([line('1', 1)])}
        labels={labels}
        paths={paths}
        classNames={{ dialog: 'mi-dialogo', checkout: 'mi-pagar' }}
        renderLink={({ href, children, className }) => <a data-x="1" href={`/mx${href}`} className={className}>{children}</a>}
      />,
    )
    act(() => openCartDrawer())
    expect(screen.getByRole('dialog', { hidden: true }).className).toBe('mi-dialogo')
    const pay = screen.getByText('Pagar').closest('a')!
    expect(pay.getAttribute('href')).toBe('/mx/pagar')
    expect(pay.className).toBe('mi-pagar')
  })

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<CartDrawer cart={cart([line('1', 2, 'Vainilla')])} labels={labels} paths={paths} shipping={{ message: 'Envío', percent: 10, progressLabel: 'Avance' }} />)
    act(() => openCartDrawer())
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([])
  })
})

describe('store y helpers', () => {
  it('useCartDrawer refleja el estado', () => {
    function Probe() {
      const { open, openDrawer, closeDrawer } = useCartDrawer()
      return (
        <div>
          <span data-testid="s">{String(open)}</span>
          <button onClick={openDrawer}>o</button>
          <button onClick={closeDrawer}>c</button>
        </div>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('s').textContent).toBe('false')
    fireEvent.click(screen.getByText('o'))
    expect(screen.getByTestId('s').textContent).toBe('true')
    fireEvent.click(screen.getByText('c'))
    expect(screen.getByTestId('s').textContent).toBe('false')
  })

  it('useOpenCartDrawerWhenDone abre al terminar el agregado, no al empezar ni si se omite', () => {
    function Probe({ skip }: { skip?: boolean }) {
      const [busy, setBusy] = useState(false)
      useOpenCartDrawerWhenDone(busy, { skip: !!skip })
      return <button onClick={() => setBusy((b) => !b)}>t</button>
    }
    const { unmount } = render(<Probe />)
    fireEvent.click(screen.getByText('t'))
    expect(isCartDrawerOpen()).toBe(false)
    fireEvent.click(screen.getByText('t'))
    expect(isCartDrawerOpen()).toBe(true)
    act(() => closeCartDrawer())
    unmount()
    render(<Probe skip />)
    fireEvent.click(screen.getByText('t'))
    fireEvent.click(screen.getByText('t'))
    expect(isCartDrawerOpen()).toBe(false)
  })

  it('handleCartLinkClick abre con clic normal y respeta modificadores', () => {
    const mk = (o: Partial<Parameters<typeof handleCartLinkClick>[0]> = {}) => ({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...o })
    const meta = mk({ metaKey: true })
    handleCartLinkClick(meta)
    expect(meta.preventDefault).not.toHaveBeenCalled()
    expect(isCartDrawerOpen()).toBe(false)
    const ok = mk()
    handleCartLinkClick(ok)
    expect(ok.preventDefault).toHaveBeenCalled()
    expect(isCartDrawerOpen()).toBe(true)
  })
})
