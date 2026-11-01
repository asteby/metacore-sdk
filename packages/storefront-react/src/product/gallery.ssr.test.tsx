import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ProductGallery } from './index.js'

const img = (n: number, size = 800) => ({ url: `https://cdn.test/${n}.jpg`, alt: `Foto ${n}`, width: size, height: size })

describe('ProductGallery without JavaScript (server render)', () => {
  it('renders every slide in a scroll-snap track, with size, so a swipe works before hydration', () => {
    const html = renderToString(<ProductGallery product={{ title: 'Filtro', images: [img(1), img(2), img(3)] }} />)
    expect(html.match(/data-sf-gallery-slide=""/g)).toHaveLength(3)
    expect(html).toContain('data-state="multiple"')
    expect(html).toMatch(/<img[^>]*width="800"[^>]*height="800"/)
    expect(html).toContain('1 de 3')
    expect(html.match(/<img[^>]*fetchPriority="high"/gi)).toHaveLength(1)
  })
  it('a single small photo: no strip, flagged to show at real size', () => {
    const html = renderToString(<ProductGallery product={{ title: 'Filtro', images: [img(1, 100)] }} />)
    expect(html).toContain('data-state="single"')
    expect(html).toContain('data-low-res=""')
    expect(html).not.toContain('data-sf-gallery-thumbnails')
  })
  it('no images: the placeholder', () => {
    const html = renderToString(<ProductGallery product={{ title: 'Filtro', images: [], featured_image: null }} />)
    expect(html).toContain('data-sf-gallery-placeholder')
    expect(html).toContain('Sin imagen: Filtro')
  })
})
