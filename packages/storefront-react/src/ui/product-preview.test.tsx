// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProductPreview, ProductThumb, ProductThumbStack, productInitials } from './product-preview'

afterEach(cleanup)

// happy-dom reports every <img> as already complete (and empty): a real browser says `false` while the file is in flight.
const proto = HTMLImageElement.prototype
const original = Object.getOwnPropertyDescriptor(proto, 'complete')
beforeEach(() => Object.defineProperty(proto, 'complete', { configurable: true, get: () => false }))
afterEach(() => (original ? Object.defineProperty(proto, 'complete', original) : delete (proto as { complete?: unknown }).complete))

describe('productInitials', () => {
  it('one letter for one word, two for two, none for nothing usable', () => {
    expect(productInitials('Balatas')).toBe('B')
    expect(productInitials('balatas cerámicas delanteras')).toBe('BC')
    expect(productInitials('  (3M) filtro')).toBe('3F')
    expect(productInitials('')).toBe('')
    expect(productInitials(null)).toBe('')
    expect(productInitials('— · —')).toBe('')
  })
})

describe('ProductThumb', () => {
  it('shows the fallback initial when the product has no image, named for screen readers', () => {
    render(<ProductThumb image={null} name="Balata cerámica" />)
    const root = document.querySelector('[data-sf-thumb]')!
    expect(root.getAttribute('data-state')).toBe('fallback')
    expect(root.getAttribute('role')).toBe('img')
    expect(root.getAttribute('aria-label')).toBe('Balata cerámica')
    expect(document.querySelector('[data-sf-thumb-initial]')!.textContent).toBe('BC')
    expect(document.querySelector('img')).toBeNull()
  })

  it('without name or image shows the package glyph and stays decorative-safe', () => {
    render(<ProductThumb image={null} name={null} />)
    expect(document.querySelector('[data-sf-thumb-initial]')).toBeNull()
    expect(document.querySelector('[data-sf-thumb-fallback] svg')).not.toBeNull()
    expect(document.querySelector('[data-sf-thumb]')!.getAttribute('role')).toBeNull()
  })

  it('lazy image with srcset and a loading state that becomes loaded', () => {
    render(<ProductThumb image={{ url: 'https://cdn.test/p.jpg', alt: 'Frente' }} name="Balata" size={56} />)
    const root = document.querySelector('[data-sf-thumb]')!
    const img = root.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('alt')).toBe('Frente')
    expect(img.getAttribute('srcset')).toContain('56w')
    expect(root.getAttribute('data-state')).toBe('loading')
    fireEvent.load(img)
    expect(root.getAttribute('data-state')).toBe('loaded')
  })

  it('a broken image falls back to the initial instead of a broken icon', () => {
    render(<ProductThumb image={{ url: 'https://cdn.test/404.jpg', alt: null }} name="Filtro de aceite" />)
    fireEvent.error(document.querySelector('img')!)
    expect(document.querySelector('[data-sf-thumb]')!.getAttribute('data-state')).toBe('fallback')
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('[data-sf-thumb-initial]')!.textContent).toBe('FD')
  })

  it('decorative: empty alt; quantity badge only above 1 and hidden from screen readers', () => {
    const { rerender } = render(<ProductThumb image={{ url: '/a.png', alt: 'x' }} name="Aceite" decorative quantity={3} />)
    expect(document.querySelector('img')!.getAttribute('alt')).toBe('')
    expect(document.querySelector('[data-sf-thumb-qty]')!.getAttribute('aria-hidden')).toBe('true')
    rerender(<ProductThumb image={{ url: '/a.png', alt: 'x' }} name="Aceite" decorative quantity={1} />)
    expect(document.querySelector('[data-sf-thumb-qty]')).toBeNull()
  })

  it('a new image url starts loading again (another variant)', () => {
    const { rerender } = render(<ProductThumb image={{ url: '/a.png', alt: null }} name="A" />)
    fireEvent.load(document.querySelector('img')!)
    rerender(<ProductThumb image={{ url: '/b.png', alt: null }} name="A" />)
    expect(document.querySelector('[data-sf-thumb]')!.getAttribute('data-state')).toBe('loading')
  })

  it('server HTML: image present with fixed size variables, no layout shift', () => {
    const html = renderToString(<ProductThumb image={{ url: '/a.png', alt: 'x', width: 800, height: 800 }} name="A" size={64} />)
    expect(html).toContain('--sf-preview-size:64px')
    expect(html).toContain('loading="lazy"')
  })
})

describe('ProductPreview', () => {
  it('orders the information: name, variant, SKU, quantity with unit price, total at the end', () => {
    render(<ProductPreview image={null} name="Balata cerámica" variant="Delantera" sku="BC-1" quantity={2} unitPrice="$749.00 c/u" total="$1,498.00" />)
    const body = document.querySelector('[data-sf-preview-body]')!
    expect(body.textContent).toBe('Balata cerámicaDelanteraSKU BC-1Cantidad 2 · $749.00 c/u')
    expect(document.querySelector('[data-sf-preview-total]')!.textContent).toBe('$1,498.00')
    expect(document.querySelector('[data-sf-thumb-qty]')!.textContent).toBe('2')
  })

  it('a product that no longer exists (no name) still renders a complete, labelled row', () => {
    render(<ProductPreview image={null} name="" quantity={1} total="$10.00" />)
    expect(screen.getByText('Producto no disponible')).toBeTruthy()
    expect(document.querySelector('[data-sf-preview]')!.getAttribute('data-missing')).toBe('true')
    expect(document.querySelector('[data-sf-thumb-fallback] svg')).not.toBeNull()
  })

  it('links the name only when there is a product', () => {
    const { rerender } = render(<ProductPreview image={null} name="Aceite" href="/p/aceite" />)
    expect(screen.getByRole('link', { name: 'Aceite' }).getAttribute('href')).toBe('/p/aceite')
    rerender(<ProductPreview image={null} name="" href="/p/x" />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('ProductThumbStack', () => {
  it('shows up to max-1 pictures and a +N counter with an accessible label', () => {
    render(<ProductThumbStack max={3} items={[{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]} />)
    expect(document.querySelectorAll('[data-sf-thumb]')).toHaveLength(2)
    const more = document.querySelector('[data-sf-thumb-more]')!
    expect(more.textContent).toBe('+3')
    expect(more.getAttribute('aria-label')).toBe('y 3 más')
  })
  it('exactly max items: no counter; empty: nothing', () => {
    const { container, rerender } = render(<ProductThumbStack max={3} items={[{ name: 'A' }, { name: 'B' }, { name: 'C' }]} />)
    expect(container.querySelectorAll('[data-sf-thumb]')).toHaveLength(3)
    expect(container.querySelector('[data-sf-thumb-more]')).toBeNull()
    rerender(<ProductThumbStack items={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
