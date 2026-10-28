// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  FaviconAvatar,
  LinkPreviewCard,
  MediaGrid,
  SourceBadge,
  domainFromUrl,
  formatRelativeTime,
  type LinkPreviewData,
} from './index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NOW = new Date('2026-10-13T12:00:00Z')
const DATA: LinkPreviewData = {
  url: 'https://www.ejemplo-noticias.mx/zona-norte/nota-1?utm=x',
  title: 'Inauguran obra hidráulica en Villa de Álvarez',
  description: 'El gobierno estatal entregó la obra con una inversión de 12 mdp.',
  imageUrl: 'https://cdn.ejemplo-noticias.mx/img/1.jpg',
  siteName: 'Ejemplo Noticias',
  faviconUrl: 'https://www.ejemplo-noticias.mx/favicon.ico',
  kind: 'article',
  publishedAt: '2026-10-13T09:00:00Z',
  lang: 'es',
}

describe('helpers', () => {
  it('domainFromUrl strips www and path, tolerates malformed input', () => {
    expect(domainFromUrl('https://www.Example.com/a/b?c=1')).toBe('example.com')
    expect(domainFromUrl('example.org/path')).toBe('example.org')
    expect(domainFromUrl('')).toBe('')
  })

  it('formatRelativeTime uses Intl.RelativeTimeFormat with the given locale', () => {
    expect(formatRelativeTime('2026-10-13T09:00:00Z', { now: NOW })).toBe('hace 3 horas')
    expect(formatRelativeTime('2026-10-12T12:00:00Z', { now: NOW })).toBe('ayer')
    expect(formatRelativeTime('2026-10-13T11:59:50Z', { now: NOW, locale: 'en' })).toBe('now')
    expect(formatRelativeTime('2026-09-29T12:00:00Z', { now: NOW, locale: 'en' })).toBe('2 weeks ago')
    expect(formatRelativeTime('no-es-fecha', { now: NOW })).toBe('')
  })

  it('formatRelativeTime treats YYYY-MM-DD as a local calendar day (no fake hours)', () => {
    const now = new Date(2026, 9, 13, 9, 30)
    expect(formatRelativeTime('2026-10-13', { now })).toBe('hoy')
    expect(formatRelativeTime('2026-10-12', { now })).toBe('ayer')
    expect(formatRelativeTime('2026-10-10', { now })).toBe('hace 3 días')
    expect(formatRelativeTime('2026-09-29', { now, locale: 'en' })).toBe('2 weeks ago')
  })
})

describe('LinkPreviewCard', () => {
  it('rich: lazy image with fixed 16:9 box, source, relative <time>, stretched external link', () => {
    const html = renderToStaticMarkup(<LinkPreviewCard data={DATA} now={NOW} badges={<span>Seguridad</span>} />)
    expect(html).toContain('data-variant="rich"')
    expect(html).toContain('aspect-video')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).toContain('Ejemplo Noticias')
    expect(html).toContain('<time dateTime="2026-10-13T09:00:00.000Z"')
    expect(html).toContain('hace 3 horas')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('href="https://www.ejemplo-noticias.mx/zona-norte/nota-1?utm=x"')
    expect(html).toContain('Seguridad')
    expect(html).toContain('lang="es"')
    expect(html).toMatch(/<h3[^>]*>.*Inauguran obra/)
  })

  it('falls back to favicon + domain + initial when there is no image', () => {
    const html = renderToStaticMarkup(
      <LinkPreviewCard data={{ url: 'https://medio.mx/n', title: 'Sin imagen' }} now={NOW} />
    )
    expect(html).toContain('data-slot="link-preview-fallback"')
    expect(html).toContain('medio.mx')
    expect(html).toContain('>M<')
    expect(html).not.toContain('<img')
  })

  it('resolveImageUrl maps image and favicon (backend proxy)', () => {
    const proxy = (u: string) => `/api/img?u=${encodeURIComponent(u)}`
    const html = renderToStaticMarkup(<LinkPreviewCard data={DATA} resolveImageUrl={proxy} now={NOW} />)
    expect(html).toContain(`src="/api/img?u=${encodeURIComponent(DATA.imageUrl!)}"`)
    expect(html).toContain(`src="/api/img?u=${encodeURIComponent(DATA.faviconUrl!)}"`)
    expect(html).not.toContain('src="https://cdn.ejemplo-noticias.mx')
  })

  it.each([
    ['compact', 'aspect-square w-10'],
    ['row', 'aspect-square w-20'],
    ['hero', 'aspect-video'],
  ] as const)('%s variant uses a fixed media box', (variant, cls) => {
    const html = renderToStaticMarkup(<LinkPreviewCard data={DATA} variant={variant} now={NOW} />)
    expect(html).toContain(`data-variant="${variant}"`)
    expect(html).toContain(cls)
  })

  it('hero uses h2; href=null renders no link; external=false drops target', () => {
    expect(renderToStaticMarkup(<LinkPreviewCard data={DATA} variant='hero' now={NOW} />)).toContain('<h2')
    expect(renderToStaticMarkup(<LinkPreviewCard data={DATA} href={null} now={NOW} />)).not.toContain('<a ')
    expect(renderToStaticMarkup(<LinkPreviewCard data={DATA} external={false} now={NOW} />)).not.toContain('target=')
  })

  it('video/post kinds show a labelled chip; author is shown', () => {
    const html = renderToStaticMarkup(
      <LinkPreviewCard data={{ ...DATA, kind: 'video', author: 'Redacción' }} now={NOW} />
    )
    expect(html).toContain('Video')
    expect(html).toContain('Por Redacción')
  })

  it('loading renders a busy skeleton without the image', () => {
    const html = renderToStaticMarkup(<LinkPreviewCard data={DATA} loading />)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Cargando vista previa')
    expect(html).not.toContain('<img')
  })
})

describe('LinkPreviewCard (DOM)', () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })
  function mount(node: React.ReactNode) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(node))
    return host
  }

  it('onSelect makes the title a button and keeps the external link as a labelled secondary action', () => {
    const onSelect = vi.fn()
    const el = mount(<LinkPreviewCard data={DATA} onSelect={onSelect} now={NOW} />)
    const button = el.querySelector('h3 button') as HTMLButtonElement
    expect(button.textContent).toContain('Inauguran obra')
    act(() => button.click())
    expect(onSelect).toHaveBeenCalledTimes(1)
    const link = el.querySelector('a[aria-label]') as HTMLAnchorElement
    expect(link.getAttribute('aria-label')).toBe('Abrir en ejemplo-noticias.mx (pestaña nueva)')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('swaps a broken image for the fallback and reveals a loaded one', () => {
    const el = mount(<LinkPreviewCard data={DATA} now={NOW} />)
    const media = el.querySelector('[data-slot="link-preview-media"]')!
    const img = media.querySelector('img')!
    expect(media.getAttribute('data-status')).toBe('loading')
    act(() => img.dispatchEvent(new Event('load')))
    expect(media.getAttribute('data-status')).toBe('loaded')
    act(() => img.dispatchEvent(new Event('error')))
    expect(media.getAttribute('data-status')).toBe('fallback')
    expect(el.querySelector('[data-slot="link-preview-fallback"]')).not.toBeNull()
  })

  it('FaviconAvatar shows the initial when the favicon fails', () => {
    const el = mount(<FaviconAvatar faviconUrl='https://x.mx/f.ico' domain='x.mx' name='Xalapa Hoy' />)
    act(() => el.querySelector('img')!.dispatchEvent(new Event('error')))
    expect(el.textContent).toBe('X')
  })
})

describe('SourceBadge and MediaGrid', () => {
  it('SourceBadge prefers the site name and keeps the domain as title', () => {
    const html = renderToStaticMarkup(<SourceBadge domain='medio.mx' siteName='El Medio' suffix={<span>· 2 h</span>} />)
    expect(html).toContain('El Medio')
    expect(html).toContain('title="medio.mx"')
    expect(html).toContain('· 2 h')
  })

  it('MediaGrid uses an auto-fill grid that collapses to one column, or a list', () => {
    const grid = renderToStaticMarkup(<MediaGrid aria-label='Evidencias' minItemWidth={300}><div /></MediaGrid>)
    expect(grid).toContain('repeat(auto-fill, minmax(min(100%, 300px), 1fr))')
    expect(grid).toContain('aria-label="Evidencias"')
    const list = renderToStaticMarkup(<MediaGrid layout='list' gap='sm'><div /></MediaGrid>)
    expect(list).toContain('flex flex-col')
    expect(list).toContain('gap-2')
  })
})
