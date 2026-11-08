// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddDialog, type QuickAddDialogProps } from './quick-add-dialog'

afterEach(cleanup)

// happy-dom reports every <img> as already complete (and empty): a real browser says `false` while the file is in flight.
const proto = HTMLImageElement.prototype
const original = Object.getOwnPropertyDescriptor(proto, 'complete')
beforeEach(() => Object.defineProperty(proto, 'complete', { configurable: true, get: () => false }))
afterEach(() => (original ? Object.defineProperty(proto, 'complete', original) : delete (proto as { complete?: unknown }).complete))

const money = (amount: string) => ({ amount, currency_code: 'MXN' })
const img = (url: string) => ({ url, alt: null, width: 800, height: 800 })
const variant = (id: string, flavor: string, over: Record<string, unknown> = {}) => ({
  id,
  sku: id,
  title: flavor,
  selected_options: [{ name: 'Sabor', value: flavor }],
  price: money('799.00'),
  compare_at_price: null,
  available_for_sale: true,
  quantity_available: null,
  image: null,
  barcode: null,
  ...over,
})
const product = {
  handle: 'themis-vegan-protein-2-lbs',
  title: 'Themis Vegan Protein 2 lbs',
  vendor: 'Gods',
  featured_image: img('https://cdn.test/main.jpg'),
  images: [img('https://cdn.test/main.jpg')],
  variants: [
    variant('v1', 'Chocolate', { image: img('https://cdn.test/choc.jpg') }),
    variant('v2', 'Vainilla'),
    variant('v3', 'Fresa', { available_for_sale: false }),
  ],
} as unknown as QuickAddDialogProps['product']

function Harness(p: Partial<QuickAddDialogProps> & { startOpen?: boolean }) {
  const [open, setOpen] = useState(p.startOpen ?? true)
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <QuickAddDialog product={product} productHref="/mx/productos/themis-vegan-protein-2-lbs" {...p} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('QuickAddDialog', () => {
  it('renders nothing while closed and is SSR-safe', () => {
    render(<QuickAddDialog open={false} onClose={() => {}} product={product} productHref="/x" />)
    expect(document.querySelector('dialog')).toBeNull()
    expect(() => renderToString(<QuickAddDialog open product={product} productHref="/x" onClose={() => {}} />)).not.toThrow()
  })

  it('is a named modal with picture, name, price, options, quantity, add button and a link to the product', () => {
    render(<Harness rating={<span>4.8 (12)</span>} />)
    const dialog = screen.getByRole('dialog', { name: /themis vegan protein/i })
    expect(within(dialog).getByText('4.8 (12)')).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup')).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: /chocolate/i })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /agregar al carrito/i })).toBeTruthy()
    const links = within(dialog).getAllByRole('link', { hidden: true })
    expect(links.length).toBe(3) // picture, name and the explicit one
    expect(links.every((a) => a.getAttribute('href') === '/mx/productos/themis-vegan-protein-2-lbs')).toBe(true)
    expect(within(dialog).getByRole('link', { name: /ver producto completo: themis/i })).toBeTruthy()
  })

  it('preselects the first available variant, shows its picture and marks sold-out ones disabled', () => {
    render(<Harness />)
    const choc = screen.getByRole('radio', { name: /chocolate/i }) as HTMLInputElement
    expect(choc.checked).toBe(true)
    expect(document.querySelector('[data-sf-quickadd-media] img')!.getAttribute('src')).toContain('choc.jpg')
    const fresa = screen.getByRole('radio', { name: /fresa/i }) as HTMLInputElement
    expect(fresa.disabled).toBe(true)
    expect(screen.getByText('Agotado')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /vainilla/i }))
    expect((screen.getByRole('radio', { name: /vainilla/i }) as HTMLInputElement).checked).toBe(true)
    // no own image for Vainilla: falls back to the product's
    expect(document.querySelector('[data-sf-quickadd-media] img')!.getAttribute('src')).toContain('main.jpg')
  })

  it('submits the chosen variant and quantity with the hidden fields, through onSubmit', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(<Harness onSubmit={onSubmit as never} action="/mx/carrito" />)
    fireEvent.click(screen.getByRole('radio', { name: /vainilla/i }))
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }))
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad/i }))
    const form = document.querySelector('form')!
    expect(form.getAttribute('action')).toBe('/mx/carrito')
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const sel = (onSubmit.mock.calls[0] as unknown as [unknown, { variant: { id: string }; quantity: number }])[1]
    expect(sel.variant.id).toBe('v2')
    expect(sel.quantity).toBe(3)
    const data = new FormData(form)
    expect(data.get('intent')).toBe('add')
    expect(data.get('variant_id')).toBe('v2')
    expect(data.get('quantity')).toBe('3')
  })

  it('caps the quantity by stock and says so', () => {
    const p = { ...product, variants: [variant('v1', 'Chocolate', { quantity_available: 2 }), variant('v2', 'Vainilla')] } as unknown as QuickAddDialogProps['product']
    render(<Harness product={p} />)
    expect(screen.getByText(/quedan 2 disponibles/i)).toBeTruthy()
    const inc = screen.getByRole('button', { name: /aumentar cantidad/i }) as HTMLButtonElement
    fireEvent.click(inc)
    fireEvent.click(inc)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2')
    expect(inc.disabled).toBe(true)
    expect(screen.getByText(/máximo disponible/i)).toBeTruthy()
    const dec = screen.getByRole('button', { name: /disminuir cantidad/i }) as HTMLButtonElement
    fireEvent.click(dec)
    fireEvent.click(dec)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('1')
    expect(dec.disabled).toBe(true)
  })

  it('closes with the X, Escape (cancel) and a backdrop click, and gives focus back to the opener', () => {
    render(<Harness startOpen={false} />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)
    fireEvent(document.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    expect(document.querySelector('dialog')).toBeNull()

    fireEvent.click(opener)
    const dlg = document.querySelector('dialog')!
    fireEvent.click(within(dlg).getByRole('radiogroup'))
    expect(document.querySelector('dialog')).not.toBeNull() // click inside does not close
    fireEvent.click(dlg)
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('moves focus into the dialog (the selected option) and uses a router link when given', () => {
    render(
      <Harness
        renderLink={({ href, children, ...rest }) => (
          <a data-router="" href={href} {...rest}>
            {children}
          </a>
        )}
      />,
    )
    expect(document.querySelector('dialog')!.contains(document.activeElement)).toBe(true)
    expect(document.querySelectorAll('a[data-router]').length).toBe(3)
  })

  it('lets the product link follow the chosen variant', () => {
    render(<Harness productHref={(v) => `/mx/productos/x${v ? `?variante=${v.id}` : ''}`} />)
    expect(screen.getByRole('link', { name: /ver producto completo/i }).getAttribute('href')).toBe('/mx/productos/x?variante=v1')
    fireEvent.click(screen.getByRole('radio', { name: /vainilla/i }))
    expect(screen.getByRole('link', { name: /ver producto completo/i }).getAttribute('href')).toBe('/mx/productos/x?variante=v2')
  })

  it('closes when the product link is followed (the list keeps its place)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('link', { name: /ver producto completo/i }))
    expect(document.querySelector('dialog')).toBeNull()
  })

  it('shows the pending label and the error, and works in English', () => {
    render(<Harness pending error="No se pudo agregar" locale="en-US" />)
    expect(screen.getByRole('alert').textContent).toBe('No se pudo agregar')
    expect(document.querySelector('[data-sf-quickadd-eyebrow]')!.textContent).toBe('Choose your option')
    expect(screen.getByRole('link', { name: /view full product/i })).toBeTruthy()
    expect((document.querySelector('[data-sf-quickadd-submit]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('sold-out product: the add button is disabled and asks to choose', () => {
    const p = { ...product, variants: [variant('v1', 'A', { available_for_sale: false })] } as unknown as QuickAddDialogProps['product']
    render(<Harness product={p} />)
    expect((document.querySelector('[data-sf-quickadd-submit]') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/elige una presentación para continuar/i)).toBeTruthy()
  })

  it('shows the compare-at price struck through', () => {
    const p = { ...product, variants: [variant('v1', 'A', { compare_at_price: money('999.00') }), variant('v2', 'B')] } as unknown as QuickAddDialogProps['product']
    render(<Harness product={p} />)
    expect(document.querySelector('[data-sf-quickadd-was]')!.textContent).toMatch(/999/)
  })
})
