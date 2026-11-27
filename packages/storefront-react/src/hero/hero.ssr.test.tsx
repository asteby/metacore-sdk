import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SectionRegistry, Sections } from '../sections.js'
import { BannerCarousel, HeroSlider, bannerCarouselSchema, bannerCarouselSection, heroMessages } from './index.js'

describe('HeroSlider without JavaScript (server render)', () => {
  it('one slide: no arrows, dots or pause', () => {
    const html = renderToString(<HeroSlider slides={[<p key="a">uno</p>]} locale="es" />)
    expect(html).toContain('uno')
    expect(html).toContain('data-state="single"')
    expect(html).not.toContain('<button')
  })

  it('several: every slide in the DOM, carousel roles, a dot per slide and the pause button', () => {
    const html = renderToString(<HeroSlider slides={[<p key="a">a</p>, <p key="b">b</p>, <p key="c">c</p>]} locale="es" />)
    expect(html).toContain('data-state="multiple"')
    expect(html).toContain('aria-roledescription="carrusel"')
    expect(html.match(/data-sf-hero-slide=""/g)).toHaveLength(3)
    expect(html.match(/data-sf-hero-dot=""/g)).toHaveLength(3)
    expect(html).toContain('Diapositiva 2 de 3')
    expect(html).toContain('aria-label="Pausar el carrusel"')
  })

  it('english texts, host overrides and no pause button when autoplay is off', () => {
    const html = renderToString(<HeroSlider slides={[<p key="a">a</p>, <p key="b">b</p>]} locale="en-US" messages={{ 'hero.next': 'Siguiente!' }} autoplay={false} />)
    expect(html).toContain('Slide 1 of 2')
    expect(html).toContain('Siguiente!')
    expect(html).not.toContain('data-sf-hero-pause')
  })

  it('no slides: nothing', () => {
    expect(renderToString(<HeroSlider slides={[]} locale="es" />)).toBe('')
  })
})

const slides = [
  { image: '/a.webp', image_mobile: '/a-m.webp', alt: 'Campaña A', title: 'Rendimiento', text: 'Ciencia aplicada', cta_label: 'Ver', url: 'collection:proteinas' },
  { image: '/b.webp', alt: 'Banner sincronizado', url: '/us/collections/creatinas' },
  { image: '/c.webp', title: 'Tercero' },
]

describe('BannerCarousel (server render)', () => {
  it('one h1 (the first message) and h2 for the rest; the message is real text, not in the picture', () => {
    const html = renderToString(<BannerCarousel slides={slides} locale="es" />)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html.match(/<h2/g)).toHaveLength(1)
    expect(html).toContain('Rendimiento')
    expect(html).toContain('Ciencia aplicada')
  })

  it('first picture is the LCP, the rest lazy, all with size; the mobile source carries its own size', () => {
    const html = renderToString(<BannerCarousel slides={slides} locale="es" />)
    expect(html.match(/<img[^>]*fetchPriority="high"/gi)).toHaveLength(1)
    expect(html.match(/<img[^>]*loading="lazy"/gi)).toHaveLength(2)
    for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
      expect(tag).toMatch(/ width="1800"/)
      expect(tag).toMatch(/ height="700"/)
    }
    expect(html).toMatch(/<source[^>]*media="\(max-width: 700px\)"[^>]*width="900"[^>]*height="700"/)
  })

  it('a slide without message is wholly a link; resolveHref and renderLink are injected (no router coupling)', () => {
    const html = renderToString(
      <BannerCarousel
        slides={slides}
        locale="es"
        resolveHref={(u) => (u.startsWith('collection:') ? `/us/collections/${u.slice(11)}` : u)}
        renderLink={({ href, className, children }) => (
          <a data-link="" href={href} className={className}>
            {children}
          </a>
        )}
      />,
    )
    expect(html).toContain('data-link="" href="/us/collections/creatinas"')
    expect(html).toContain('href="/us/collections/proteinas"')
    expect(html).toContain('>Ver</a>')
  })

  it('classNames reach the markup and the default link is a plain <a>', () => {
    const html = renderToString(<BannerCarousel slides={slides} locale="es" classNames={{ title: 'my-title', cta: 'my-cta', eyebrow: 'my-eyebrow' }} />)
    expect(html).toContain('class="my-title"')
    expect(html).toContain('class="my-cta"')
    expect(html).toMatch(/<a [^>]*href="collection:proteinas"/)
  })

  it('no slides: nothing', () => {
    expect(renderToString(<BannerCarousel slides={[]} locale="es" />)).toBe('')
  })
})

describe('banner_carousel section', () => {
  it('is registered with the type the storefront_content addon recognises and a closed schema (slides + synced_slides)', () => {
    const section = bannerCarouselSection()
    expect(section.type).toBe('banner_carousel')
    expect(Object.keys(bannerCarouselSchema)).toEqual(['slides', 'synced_slides'])
    expect(bannerCarouselSchema.synced_slides.default).toBe('before')
    expect(bannerCarouselSchema.synced_slides.options.map((o) => o.value)).toEqual(['before', 'after', 'replace', 'off'])
    expect(Object.keys(bannerCarouselSchema.slides.items)).toEqual(['image', 'image_mobile', 'alt', 'url', 'eyebrow', 'title', 'text', 'cta_label', 'focus', 'text_position', 'text_vertical', 'text_size', 'scrim'])
  })

  it('renders a page through the registry and validates its props', () => {
    const registry = new SectionRegistry([bannerCarouselSection({ locale: 'en-US', wrap: (c) => <div data-wrap="">{c}</div> })])
    const out = renderToString(<Sections registry={registry} sections={[{ id: 'hero', type: 'banner_carousel', props: { slides: [{ image: '/a.webp', title: 'Hello' }, { image: '/b.webp' }] } }]} />)
    expect(out).toContain('data-wrap=""')
    expect(out).toContain('Hello')
    expect(out).toContain('Slide 2 of 2')
  })

  it('texts follow the locale (es / en) with overrides on top', () => {
    expect(heroMessages('es-MX')['hero.next']).toBe('Diapositiva siguiente')
    expect(heroMessages('en-US')['hero.next']).toBe('Next slide')
    expect(heroMessages('en', { 'hero.next': 'x' })['hero.next']).toBe('x')
  })
})
