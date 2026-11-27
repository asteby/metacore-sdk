import type { ReactNode } from 'react'
import { defineSection, type SectionSchema } from '../sections.js'
import { Banner, bannerFields, type BannerClassNames, type BannerData, type BannerImageSize, type BannerLinkProps } from './banner.js'
import { HeroSlider, type HeroSliderClassNames, type HeroSliderProps } from './hero-slider.js'

/**
 * One slide of the `banner_carousel` section: a `Banner` (see `./banner`). The shop's own slides (page editor) may carry a
 * message (`eyebrow`, `title`, `text`, `cta_label`) as real HTML, so it is translated per language and market and never baked
 * into the image. The slides the `storefront_content` addon merges in from «Banners del carrusel» (`synced_slides`) are image +
 * link only.
 */
export type BannerSlide = BannerData

export type BannerCarouselClassNames = HeroSliderClassNames & BannerClassNames

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

/**
 * Hero carousel of campaign banners on `HeroSlider`. The first picture is the LCP (`fetchpriority=high`), the others are
 * lazy; every picture has its size. The first slide's title is the page `<h1>` (the rest are `<h2>`). A slide without a
 * message (a synced banner) is wholly a link. Style with `@asteby/storefront-react/hero.css` and `classNames`.
 */
export function BannerCarousel({ slides, resolveHref, renderLink, imageSize, classNames, ...slider }: BannerCarouselProps) {
  if (slides.length === 0) return null
  return (
    <HeroSlider
      {...slider}
      classNames={classNames}
      slides={slides.map((s, i) => (
        <Banner key={s.image} {...s} priority={i === 0} headingLevel={i === 0 ? 'h1' : 'h2'} resolveHref={resolveHref} renderLink={renderLink} imageSize={imageSize} classNames={classNames} />
      ))}
    />
  )
}

/**
 * Closed props schema of the `banner_carousel` section — the type the `storefront_content` addon recognises to mix in the
 * synced banners (`synced_slides`: before / after / replace / off). `slides` follow the addon's shape
 * (`image`, `image_mobile`, `alt`, `url`) plus the optional message and the banner formula (`focus`, `text_position`, `text_vertical`, `text_size`, `scrim`).
 */
export const bannerCarouselSchema = {
  slides: {
    kind: 'list',
    label: 'Diapositivas',
    default: [],
    items: bannerFields,
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
