import type { ReactNode } from 'react'
import { defineSection, type SectionSchema } from '../sections.js'
import { HeroSlider, type HeroSliderClassNames, type HeroSliderProps } from './hero-slider.js'

/**
 * One slide of the `banner_carousel` section. The shop's own slides (page editor) may carry a message (`eyebrow`, `title`,
 * `text`, `cta_label`) as real HTML, so it is translated per language and market and never baked into the image. The slides
 * the `storefront_content` addon merges in from «Banners del carrusel» (`synced_slides`) are image + link only.
 */
export type BannerSlide = {
  image: string
  image_mobile?: string
  alt?: string
  url?: string
  eyebrow?: string
  title?: string
  text?: string
  cta_label?: string
}

export type BannerLinkProps = { href: string; className?: string; children: ReactNode }

export type BannerCarouselClassNames = HeroSliderClassNames & {
  /** A slide with a message (the picture plus the text over it). */
  message?: string
  scrim?: string
  content?: string
  eyebrow?: string
  title?: string
  text?: string
  cta?: string
  image?: string
}

/** Pixel size of the pictures, so nothing shifts while they load (wide 1800×700, mobile 900×700 by default). */
export type BannerImageSize = { width: number; height: number; mobileWidth: number; mobileHeight: number }
export const DEFAULT_BANNER_IMAGE_SIZE: BannerImageSize = { width: 1800, height: 700, mobileWidth: 900, mobileHeight: 700 }

export type BannerCarouselProps = Omit<HeroSliderProps, 'slides' | 'classNames'> & {
  slides: readonly BannerSlide[]
  /**
   * Turns a slide `url` into the link target (e.g. the store's `menuHref`, which resolves `collection:` and market prefixes).
   * Default: the url as is.
   */
  resolveHref?: (url: string) => string
  /** Renders a link (a router `<Link>`); default a plain `<a>`. */
  renderLink?: (props: BannerLinkProps) => ReactNode
  imageSize?: Partial<BannerImageSize>
  classNames?: BannerCarouselClassNames
}

const defaultLink = ({ href, className, children }: BannerLinkProps) => (
  <a href={href} className={className}>
    {children}
  </a>
)

/**
 * Hero carousel of campaign banners on `HeroSlider`. The first picture is the LCP (`fetchpriority=high`), the others are
 * lazy; every picture has its size. The first slide's title is the page `<h1>` (the rest are `<h2>`). A slide without a
 * message (a synced banner) is wholly a link. Style with `@asteby/storefront-react/hero.css` and `classNames`.
 */
export function BannerCarousel({ slides, resolveHref = (u) => u, renderLink = defaultLink, imageSize, classNames, ...slider }: BannerCarouselProps) {
  const size = { ...DEFAULT_BANNER_IMAGE_SIZE, ...imageSize }
  if (slides.length === 0) return null
  return (
    <HeroSlider
      {...slider}
      classNames={classNames}
      slides={slides.map((s, i) => {
        const hasText = Boolean(s.title || s.eyebrow || s.text)
        const picture = (
          <picture>
            {s.image_mobile ? <source media="(max-width: 700px)" srcSet={s.image_mobile} width={size.mobileWidth} height={size.mobileHeight} /> : null}
            <img
              data-sf-banner-image=""
              data-with-message={hasText ? '' : undefined}
              src={s.image}
              alt={s.alt ?? ''}
              width={size.width}
              height={size.height}
              {...(i === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
              decoding="async"
              className={classNames?.image}
            />
          </picture>
        )
        if (!hasText) return s.url ? <span key={s.image}>{renderLink({ href: resolveHref(s.url), children: picture })}</span> : <span key={s.image}>{picture}</span>
        const Heading = i === 0 ? 'h1' : 'h2'
        return (
          <div key={s.image} data-sf-banner="" className={classNames?.message}>
            {picture}
            <div data-sf-banner-scrim="" aria-hidden="true" className={classNames?.scrim} />
            <div data-sf-banner-content="" className={classNames?.content}>
              {s.eyebrow ? (
                <p data-sf-banner-eyebrow="" className={classNames?.eyebrow}>
                  {s.eyebrow}
                </p>
              ) : null}
              {s.title ? (
                <Heading data-sf-banner-title="" className={classNames?.title}>
                  {s.title}
                </Heading>
              ) : null}
              {s.text ? (
                <p data-sf-banner-text="" className={classNames?.text}>
                  {s.text}
                </p>
              ) : null}
              {s.cta_label && s.url ? renderLink({ href: resolveHref(s.url), className: classNames?.cta, children: s.cta_label }) : null}
            </div>
          </div>
        )
      })}
    />
  )
}

/**
 * Closed props schema of the `banner_carousel` section — the type the `storefront_content` addon recognises to mix in the
 * synced banners (`synced_slides`: before / after / replace / off). `slides` follow the addon's shape
 * (`image`, `image_mobile`, `alt`, `url`) plus the optional message.
 */
export const bannerCarouselSchema = {
  slides: {
    kind: 'list',
    label: 'Diapositivas',
    default: [],
    items: {
      image: { kind: 'image', label: 'Imagen ancha (1800×700; sin texto dentro)', required: true },
      image_mobile: { kind: 'image', label: 'Imagen para móvil (900×700)' },
      alt: { kind: 'text', label: 'Descripción de la imagen' },
      url: { kind: 'url', label: 'Enlace (toda la diapositiva o el botón)' },
      eyebrow: { kind: 'text', label: 'Etiqueta' },
      title: { kind: 'text', label: 'Titular' },
      text: { kind: 'text', label: 'Texto' },
      cta_label: { kind: 'text', label: 'Texto del botón' },
    },
  },
  synced_slides: {
    kind: 'select',
    label: 'Banners sincronizados',
    default: 'before',
    options: [
      { value: 'before', label: 'Antes de los míos' },
      { value: 'after', label: 'Después de los míos' },
      { value: 'replace', label: 'Reemplazar los míos' },
      { value: 'off', label: 'No mostrar' },
    ],
  },
} as const satisfies SectionSchema

export type BannerCarouselSectionOptions = Omit<BannerCarouselProps, 'slides'> & {
  /** Section type (default `banner_carousel`, the one the addon mixes synced banners into). */
  type?: string
  label?: string
  description?: string
  /** Section wrapper, e.g. the store's page container. Default: a bare `<section>`. */
  wrap?: (carousel: ReactNode) => ReactNode
}

/**
 * Ready-made `banner_carousel` section for a store's `SectionRegistry`:
 * `new SectionRegistry([bannerCarouselSection({ resolveHref: menuHref, renderLink: (p) => <Link to={p.href} … /> })])`.
 */
export function bannerCarouselSection({ type = 'banner_carousel', label = 'Carrusel de portada', description = 'Varias campañas rotando: imagen y, si quieres, etiqueta, titular, texto y botón. Mezcla los banners sincronizados.', wrap, ...carousel }: BannerCarouselSectionOptions = {}) {
  return defineSection({
    type,
    label,
    description,
    schema: bannerCarouselSchema,
    component: function BannerCarouselSection({ slides }) {
      if (slides.length === 0) return null
      const body = <BannerCarousel {...carousel} slides={slides as readonly BannerSlide[]} />
      return <>{wrap ? wrap(body) : <section>{body}</section>}</>
    },
  })
}
