// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductPreview, ProductThumb, productInitials } from './index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// happy-dom says every <img> is already complete; a browser says false while the file is in flight.
const proto = HTMLImageElement.prototype
const original = Object.getOwnPropertyDescriptor(proto, 'complete')
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.defineProperty(proto, 'complete', { configurable: true, get: () => false })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  if (original) Object.defineProperty(proto, 'complete', original)
  else delete (proto as { complete?: unknown }).complete
})
const mount = (el: React.ReactElement) => act(() => root.render(el))
const fire = (el: Element, type: string) => act(() => void el.dispatchEvent(new Event(type)))

describe('productInitials', () => {
  it('one letter per word up to two; empty when nothing usable', () => {
    expect(productInitials('Balata')).toBe('B')
    expect(productInitials('filtro de aceite')).toBe('FD')
    expect(productInitials('— · —')).toBe('')
    expect(productInitials(undefined)).toBe('')
  })
})

describe('ProductThumb', () => {
  it('no image: initial fallback named for screen readers', () => {
    mount(<ProductThumb src={null} name='Balata cerámica' />)
    const t = host.querySelector('[data-slot=product-thumb]')!
    expect(t.getAttribute('data-state')).toBe('fallback')
    expect(t.getAttribute('role')).toBe('img')
    expect(t.getAttribute('aria-label')).toBe('Balata cerámica')
    expect(host.querySelector('[data-slot=product-thumb-fallback]')!.textContent).toBe('BC')
  })

  it('no image and no name: package glyph, hidden from screen readers', () => {
    mount(<ProductThumb src='' />)
    expect(host.querySelector('[data-slot=product-thumb-fallback] svg')).not.toBeNull()
    expect(host.querySelector('[data-slot=product-thumb]')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('lazy image, loading then loaded; failure drops to the fallback', () => {
    mount(<ProductThumb src='https://cdn.test/a.jpg' name='Aceite' />)
    const t = host.querySelector('[data-slot=product-thumb]')!
    const img = t.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('alt')).toBe('Aceite')
    expect(t.getAttribute('data-state')).toBe('loading')
    fire(img, 'load')
    expect(t.getAttribute('data-state')).toBe('loaded')
    fire(img, 'error')
    expect(t.getAttribute('data-state')).toBe('fallback')
    expect(t.querySelector('img')).toBeNull()
  })

  it('an error while a host swaps the src to another derivative is not a failure', () => {
    mount(<ProductThumb src='https://cdn.test/a_320.webp' name='Aceite' />)
    const img = host.querySelector('img')!
    img.setAttribute('src', 'https://cdn.test/a.webp') // what lib/catalog-images does on the capture phase
    fire(img, 'error')
    expect(host.querySelector('[data-slot=product-thumb]')!.getAttribute('data-state')).toBe('loading')
  })

  it('decorative: empty alt; zoomable: a labelled button that opens the picture large', () => {
    mount(<ProductThumb src='/a.png' name='Aceite' decorative quantity={4} />)
    expect(host.querySelector('img')!.getAttribute('alt')).toBe('')
    expect(host.querySelector('[data-slot=product-thumb-qty]')!.textContent).toBe('4')
    mount(<ProductThumb src='/a.png' name='Aceite' zoomable zoomLabel='Ampliar' />)
    const btn = host.querySelector('[data-slot=product-thumb-zoom]') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Ampliar: Aceite')
    act(() => btn.click())
    expect(document.body.querySelector('[role=dialog] img')!.getAttribute('src')).toBe('/a.png')
  })

  it('not zoomable when there is no working picture', () => {
    mount(<ProductThumb src={null} name='X' zoomable />)
    expect(host.querySelector('[data-slot=product-thumb-zoom]')).toBeNull()
  })
})

describe('ProductPreview', () => {
  it('hierarchy: name, variant, SKU, quantity with unit price; total on the right', () => {
    const html = renderToStaticMarkup(<ProductPreview name='Balata' variant='Delantera' sku='BC-1' quantity={2} unitPrice='$749.00' total='$1,498.00' />)
    const body = (() => {
      const d = document.createElement('div')
      d.innerHTML = html
      return d
    })()
    expect(body.querySelector('[data-slot=product-preview-name]')!.textContent).toBe('Balata')
    expect(body.querySelector('[data-slot=product-preview-sku]')!.textContent).toBe('SKU BC-1')
    expect(body.querySelector('[data-slot=product-preview-qty]')!.textContent).toBe('Cantidad 2 · $749.00')
    expect(body.querySelector('[data-slot=product-preview-total]')!.textContent).toBe('$1,498.00')
  })

  it('missing product: a complete, labelled row', () => {
    mount(<ProductPreview name='' quantity={1} total='$10.00' />)
    expect(host.querySelector('[data-slot=product-preview]')!.hasAttribute('data-missing')).toBe(true)
    expect(host.querySelector('[data-slot=product-preview-name]')!.textContent).toBe('Producto no disponible')
    expect(host.querySelector('[data-slot=product-thumb-fallback] svg')).not.toBeNull()
  })

  it('single unit: the unit price is the right-hand number', () => {
    mount(<ProductPreview name='Aceite' quantity={1} unitPrice='$99.00' />)
    expect(host.querySelector('[data-slot=product-preview-total]')!.textContent).toBe('$99.00')
    expect(host.querySelector('[data-slot=product-preview-qty]')!.textContent).toBe('Cantidad 1')
  })
})
