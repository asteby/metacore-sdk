// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import { createMockStorefront } from '@asteby/storefront/mock'
import { ProductGallery, galleryImages, isLowResImage, variantImageIndex, type GalleryImage } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }

const img = (n: number, extra: Partial<GalleryImage> = {}): GalleryImage => ({ url: `https://cdn.test/${n}.jpg`, alt: `Foto ${n}`, width: 800, height: 800, ...extra })
const product = (images: GalleryImage[]) => ({ title: 'Balatas delanteras', images, featured_image: images[0] ?? null })

describe('galleryImages / variantImageIndex / isLowResImage', () => {
  it('uses images, then featured_image, drops empty and repeated URLs', () => {
    expect(galleryImages({ title: 't', images: [], featured_image: img(9) }).map((i) => i.url)).toEqual(['https://cdn.test/9.jpg'])
    expect(galleryImages({ title: 't', images: [img(1), { url: '  ', alt: null }, img(1), img(2)] }).map((i) => i.url)).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'])
    expect(galleryImages({ title: 't' })).toEqual([])
  })
  it('puts the variant image first only when the list lacks it', () => {
    const list = [img(1), img(2)]
    expect(galleryImages({ title: 't', images: list }, null, { id: 'v', image: img(2) }).map((i) => i.url)).toEqual(['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'])
    expect(galleryImages({ title: 't', images: list }, null, { id: 'v', image: img(7) })[0]!.url).toBe('https://cdn.test/7.jpg')
  })
  it('selects by variant_id first, then by the variant image URL', () => {
    const list = [img(1), img(2, { variant_id: 'rojo' }), img(3)]
    expect(variantImageIndex(list, { id: 'rojo', image: img(3) })).toBe(1)
    expect(variantImageIndex(list, { id: 'azul', image: img(3) })).toBe(2)
    expect(variantImageIndex(list, { id: 'azul', image: null })).toBe(-1)
    expect(variantImageIndex(list, null)).toBe(-1)
  })
  it('marks as small a photo with a known longest side ≤ 300 px or low_res', () => {
    expect(isLowResImage({ width: 100, height: 100 })).toBe(true)
    expect(isLowResImage({ width: 300, height: 120 })).toBe(true)
    expect(isLowResImage({ width: 301, height: 120 })).toBe(false)
    expect(isLowResImage({})).toBe(false)
    expect(isLowResImage({ low_res: true })).toBe(true)
    expect(isLowResImage({ width: 100, height: 100, low_res: false })).toBe(false)
    expect(isLowResImage({ width: 500, height: 500 }, 600)).toBe(true)
  })
})

describe('<ProductGallery /> detects 0, 1 or several images', () => {
  it('0 images: a placeholder with an accessible name, or the store own', async () => {
    const { container, rerender } = render(<ProductGallery product={product([])} />)
    const ph = container.querySelector('[data-sf-gallery-placeholder]')!
    expect(ph.getAttribute('role')).toBe('img')
    expect(ph.getAttribute('aria-label')).toBe('Sin imagen: Balatas delanteras')
    expect(container.querySelector('[data-sf-gallery]')!.getAttribute('data-state')).toBe('empty')
    expect((await axe.run(container, AXE)).violations).toEqual([])
    rerender(<ProductGallery product={product([])} placeholder={<svg role="img" aria-label="Mockup" />} />)
    expect(container.querySelector('[aria-label="Mockup"]')).toBeTruthy()
    expect(container.querySelector('[data-sf-gallery-placeholder]')).toBeNull()
  })

  it('1 image: just the image, with priority and size, no thumbnails or controls', async () => {
    const { container } = render(<ProductGallery product={product([img(1)])} />)
    expect(container.querySelector('[data-sf-gallery]')!.getAttribute('data-state')).toBe('single')
    const im = container.querySelectorAll('img')
    expect(im).toHaveLength(1)
    expect(im[0]!.getAttribute('fetchpriority')).toBe('high')
    expect(im[0]!.getAttribute('width')).toBe('800')
    expect(im[0]!.getAttribute('height')).toBe('800')
    expect(container.querySelector('[data-sf-gallery-thumbnails]')).toBeNull()
    expect(container.querySelector('[data-sf-gallery-nav]')).toBeNull()
    expect(container.querySelector('[data-sf-gallery-counter]')).toBeNull()
    expect(container.querySelector('[data-sf-gallery-track]')!.hasAttribute('tabindex')).toBe(false)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('several images: carousel, counter, thumbnails; only the first is the LCP', async () => {
    const { container, getByRole } = render(<ProductGallery product={product([img(1), img(2), img(3), img(4), img(5)])} />)
    const root = container.querySelector('[data-sf-gallery]')!
    expect(root.getAttribute('data-state')).toBe('multiple')
    expect(root.getAttribute('aria-label')).toBe('Imágenes de Balatas delanteras')
    expect(root.getAttribute('aria-roledescription')).toBe('carrusel')
    const slides = container.querySelectorAll('[data-sf-gallery-slide]')
    expect(slides).toHaveLength(5)
    expect(slides[1]!.getAttribute('aria-label')).toBe('Imagen 2 de 5')
    expect(container.querySelector('[data-sf-gallery-counter]')!.textContent).toContain('1 de 5')
    expect(container.querySelector('[data-sf-gallery-counter]')!.getAttribute('aria-live')).toBe('polite')
    const thumbs = container.querySelectorAll('[data-sf-gallery-thumbnail]')
    expect(thumbs).toHaveLength(5)
    expect(thumbs[0]!.getAttribute('aria-current')).toBe('true')
    expect(thumbs[3]!.getAttribute('aria-label')).toBe('Ver imagen 4 de 5')
    // The thumbnail image is decorative (the button carries the name); main images get their alt.
    expect(thumbs[0]!.querySelector('img')!.getAttribute('alt')).toBe('')
    const main = container.querySelectorAll('[data-sf-gallery-slide] img')
    expect(main[0]!.getAttribute('alt')).toBe('Foto 1')
    expect(main[0]!.getAttribute('fetchpriority')).toBe('high')
    expect(main[1]!.getAttribute('loading')).toBe('lazy')
    expect(getByRole('button', { name: 'Imagen anterior' }).getAttribute('aria-disabled')).toBe('true')
    expect(container.querySelector('[data-sf-gallery-track]')!.getAttribute('aria-label')).toBe('Desliza o usa las flechas ← → para ver las imágenes')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('falls back to the product title when OPS sends no alt', () => {
    const { container } = render(<ProductGallery product={product([img(1, { alt: null }), img(2, { alt: '  ' })])} />)
    const main = container.querySelectorAll('[data-sf-gallery-slide] img')
    expect(main[0]!.getAttribute('alt')).toBe('Balatas delanteras')
    expect(main[1]!.getAttribute('alt')).toBe('Balatas delanteras')
  })
})

describe('<ProductGallery /> navigation', () => {
  const five = () => product([img(1), img(2), img(3), img(4), img(5)])
  const counter = (c: HTMLElement) => c.querySelector('[data-sf-gallery-counter] [aria-hidden]')!.textContent

  it('thumbnails, buttons and keys move the active image and scroll the track', () => {
    const scrollTo = vi.fn()
    const onIndexChange = vi.fn()
    const { container, getByRole } = render(<ProductGallery product={five()} onIndexChange={onIndexChange} />)
    const track = container.querySelector('[data-sf-gallery-track]') as HTMLElement
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 400 })
    track.scrollTo = scrollTo as never
    fireEvent.click(getByRole('button', { name: 'Ver imagen 3 de 5' }))
    expect(counter(container)).toBe('3 de 5')
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 800 }))
    expect(onIndexChange).toHaveBeenLastCalledWith(2, expect.objectContaining({ url: 'https://cdn.test/3.jpg' }))
    fireEvent.click(getByRole('button', { name: 'Imagen siguiente' }))
    expect(counter(container)).toBe('4 de 5')
    expect(track.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(track, { key: 'ArrowLeft' })
    expect(counter(container)).toBe('3 de 5')
    fireEvent.keyDown(track, { key: 'End' })
    expect(counter(container)).toBe('5 de 5')
    const next = getByRole('button', { name: 'Imagen siguiente' })
    expect(next.getAttribute('aria-disabled')).toBe('true')
    // At the end the button stays focusable and does nothing.
    next.focus()
    fireEvent.click(next)
    expect(document.activeElement).toBe(next)
    expect(counter(container)).toBe('5 de 5')
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(counter(container)).toBe('5 de 5')
    fireEvent.keyDown(track, { key: 'Home' })
    expect(counter(container)).toBe('1 de 5')
    expect(container.querySelectorAll('[data-sf-gallery-thumbnail]')[0]!.getAttribute('aria-current')).toBe('true')
  })

  it('a swipe (scroll of the track) updates the counter and the thumbnail', () => {
    const { container } = render(<ProductGallery product={five()} />)
    const track = container.querySelector('[data-sf-gallery-track]') as HTMLElement
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 400 })
    fireEvent.pointerDown(track)
    track.scrollLeft = 1210
    fireEvent.scroll(track)
    expect(counter(container)).toBe('4 de 5')
    expect(container.querySelectorAll('[data-sf-gallery-thumbnail]')[3]!.getAttribute('aria-current')).toBe('true')
  })

  it('starts on the selected variant image and follows variant changes', () => {
    const list = [img(1), img(2, { variant_id: 'rojo' }), img(3, { variant_id: 'azul' })]
    const { container, rerender } = render(<ProductGallery product={product(list)} variant={{ id: 'rojo', image: img(2) }} />)
    expect(counter(container)).toBe('2 de 3')
    // Image 0 (visible before hydration) and the variant's (visible after) both load first; the rest wait.
    const main = container.querySelectorAll('[data-sf-gallery-slide] img')
    expect(main[0]!.getAttribute('fetchpriority')).toBe('high')
    expect(main[1]!.getAttribute('fetchpriority')).toBe('high')
    expect(main[2]!.getAttribute('loading')).toBe('lazy')
    rerender(<ProductGallery product={product(list)} variant={{ id: 'azul', image: null }} />)
    expect(counter(container)).toBe('3 de 3')
    rerender(<ProductGallery product={product(list)} variant={{ id: 'otra', image: img(1) }} />)
    expect(counter(container)).toBe('1 de 3')
  })

  it('English texts with locale, overrides with messages', () => {
    const { container, getByRole } = render(<ProductGallery product={product([img(1), img(2)])} locale="en-US" messages={{ 'gallery.next': 'Siguiente foto' }} />)
    expect(container.querySelector('[data-sf-gallery]')!.getAttribute('aria-label')).toBe('Images of Balatas delanteras')
    expect(counter(container)).toBe('1 of 2')
    expect(getByRole('button', { name: 'Siguiente foto' })).toBeTruthy()
  })
})

describe('<ProductGallery /> images', () => {
  it('small photos are flagged to be shown at real size; big ones are not', () => {
    const { container } = render(<ProductGallery product={product([img(1, { width: 100, height: 100 }), img(2), img(3, { width: undefined, height: undefined, low_res: true })])} />)
    const main = container.querySelectorAll('[data-sf-gallery-slide] img')
    expect(main[0]!.hasAttribute('data-low-res')).toBe(true)
    expect(main[1]!.hasAttribute('data-low-res')).toBe(false)
    expect(main[2]!.hasAttribute('data-low-res')).toBe(true)
    // A 100 px photo never asks for a bigger file.
    expect(main[0]!.getAttribute('srcset')).toBe('https://cdn.test/1.jpg?width=100&height=100 100w')
  })

  it('uses the store loader for srcset and <picture> sources when given', () => {
    const loader = (src: string, w: number) => `${src}?w=${w}&fm=webp`
    const sources = (im: GalleryImage, widths: readonly number[]) => [{ type: 'image/avif', srcSet: widths.map((w) => `${im.url}?w=${w}&fm=avif ${w}w`).join(', ') }]
    const { container } = render(<ProductGallery product={product([img(1), img(2)])} loader={loader} sources={sources} classNames={{ image: 'foto', thumbnail: 'mini' }} />)
    const first = container.querySelector('[data-sf-gallery-slide] img')!
    expect(first.getAttribute('srcset')).toContain('https://cdn.test/1.jpg?w=480&fm=webp 480w')
    expect(first.className).toBe('foto')
    const source = container.querySelector('[data-sf-gallery-slide] picture source')!
    expect(source.getAttribute('type')).toBe('image/avif')
    expect(source.getAttribute('srcset')).toContain('?w=720&fm=avif 720w')
    expect(container.querySelector('[data-sf-gallery-thumbnail]')!.className).toBe('mini')
  })

  it('renders the multi-image fixture of the SDK mock', async () => {
    const p = createMockStorefront().state.products.find((x) => x.handle === 'set-sartenes')
    expect(p!.images.length).toBeGreaterThanOrEqual(5)
    const { container } = render(<ProductGallery product={p!} />)
    expect(container.querySelectorAll('[data-sf-gallery-slide]')).toHaveLength(p!.images.length)
    await act(async () => {})
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})
