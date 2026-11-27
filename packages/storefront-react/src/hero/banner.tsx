import type { CSSProperties, ReactNode } from 'react'
import type { SectionSchema } from '../sections.js'

/**
 * «Banner formula» — one way to edit every banner image of a storefront from OPS, instead of a patch per section.
 *
 * Two small schema fragments any section can spread into its (closed) props schema:
 *  - `bannerFocusField`   → `focus`: which part of the picture stays in frame when it is cropped (phones, cards).
 *  - `bannerLayoutFields` → `text_position`, `text_vertical`, `text_size`, `scrim`: where the message sits, how big the title is
 *                           and how strong the veil is, so the text never covers the product.
 * and one primitive, `<Banner>`: picture (desktop + mobile source, focal point, size) plus an optional message with
 * its veil. Every field is optional and the defaults reproduce the previous look (text left, centred vertically, the
 * usual veil, picture centred), so already published pages do not change.
 */

export const BANNER_FOCUS = ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type BannerFocus = (typeof BANNER_FOCUS)[number]

export const BANNER_TEXT_POSITIONS = ['left', 'center', 'right'] as const
export type BannerTextPosition = (typeof BANNER_TEXT_POSITIONS)[number]

export const BANNER_TEXT_VERTICALS = ['top', 'middle', 'bottom'] as const
export type BannerTextVertical = (typeof BANNER_TEXT_VERTICALS)[number]

export const BANNER_TEXT_SIZES = ['small', 'medium', 'large'] as const
export type BannerTextSize = (typeof BANNER_TEXT_SIZES)[number]

export const BANNER_SCRIMS = ['none', 'soft', 'medium', 'strong'] as const
export type BannerScrim = (typeof BANNER_SCRIMS)[number]

const FOCUS_POSITION: Record<BannerFocus, string> = {
  center: '50% 50%',
  top: '50% 0%',
  bottom: '50% 100%',
  left: '0% 50%',
  right: '100% 50%',
  'top-left': '0% 0%',
  'top-right': '100% 0%',
  'bottom-left': '0% 100%',
  'bottom-right': '100% 100%',
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)

/** CSS `object-position` for a `focus` value; `undefined` for an unknown or empty one (the browser default, centred). */
export function bannerObjectPosition(focus: unknown): string | undefined {
  return isOneOf(BANNER_FOCUS, focus) && focus !== 'center' ? FOCUS_POSITION[focus] : undefined
}

/** Style for a cropped `<img>`: `<img style={bannerImageStyle(props.focus)} />`. Nothing when the focus is the default. */
export function bannerImageStyle(focus: unknown): CSSProperties | undefined {
  const objectPosition = bannerObjectPosition(focus)
  return objectPosition ? { objectPosition } : undefined
}

/** `focus`: the part of the picture that must stay visible when the frame crops it (typically on phones). */
export const bannerFocusField = {
  focus: {
    kind: 'select',
    label: 'Punto focal de la imagen (lo que no se recorta)',
    default: 'center',
    options: [
      { value: 'center', label: 'Centro' },
      { value: 'top', label: 'Arriba' },
      { value: 'bottom', label: 'Abajo' },
      { value: 'left', label: 'Izquierda' },
      { value: 'right', label: 'Derecha' },
      { value: 'top-left', label: 'Arriba a la izquierda' },
      { value: 'top-right', label: 'Arriba a la derecha' },
      { value: 'bottom-left', label: 'Abajo a la izquierda' },
      { value: 'bottom-right', label: 'Abajo a la derecha' },
    ],
  },
} as const satisfies SectionSchema

/** Where the message sits over the picture and how strong the veil behind it is. */
export const bannerLayoutFields = {
  text_position: {
    kind: 'select',
    label: 'Texto a la',
    default: 'left',
    options: [
      { value: 'left', label: 'Izquierda' },
      { value: 'center', label: 'Centro' },
      { value: 'right', label: 'Derecha' },
    ],
  },
  text_vertical: {
    kind: 'select',
    label: 'Texto en la parte',
    default: 'middle',
    options: [
      { value: 'top', label: 'De arriba' },
      { value: 'middle', label: 'Del medio' },
      { value: 'bottom', label: 'De abajo' },
    ],
  },
  text_size: {
    kind: 'select',
    label: 'Tamaño del titular',
    default: 'medium',
    options: [
      { value: 'small', label: 'Pequeño' },
      { value: 'medium', label: 'Mediano' },
      { value: 'large', label: 'Grande' },
    ],
  },
  scrim: {
    kind: 'select',
    label: 'Velo detrás del texto',
    default: 'medium',
    options: [
      { value: 'none', label: 'Sin velo' },
      { value: 'soft', label: 'Suave' },
      { value: 'medium', label: 'Medio' },
      { value: 'strong', label: 'Fuerte' },
    ],
  },
} as const satisfies SectionSchema

/** The whole image + message formula (desktop and mobile picture, alt, link, message, focus and layout) for a list item. */
export const bannerFields = {
  image: { kind: 'image', label: 'Imagen ancha (1800×700; sin texto dentro)', required: true },
  image_mobile: { kind: 'image', label: 'Imagen para móvil (900×700)' },
  alt: { kind: 'text', label: 'Descripción de la imagen' },
  url: { kind: 'url', label: 'Enlace (toda la diapositiva o el botón)' },
  eyebrow: { kind: 'text', label: 'Etiqueta' },
  title: { kind: 'text', label: 'Titular' },
  text: { kind: 'text', label: 'Texto' },
  cta_label: { kind: 'text', label: 'Texto del botón' },
  ...bannerFocusField,
  ...bannerLayoutFields,
} as const satisfies SectionSchema

/** The shape of one banner as the editor stores it (every field after `image` is optional). */
export type BannerData = {
  image: string
  image_mobile?: string
  alt?: string
  url?: string
  eyebrow?: string
  title?: string
  text?: string
  cta_label?: string
  focus?: string
  text_position?: string
  text_vertical?: string
  text_size?: string
  scrim?: string
}

export type BannerLinkProps = { href: string; className?: string; children: ReactNode }

export type BannerClassNames = {
  /** A banner with a message (the picture plus the text over it). */
  message?: string
  image?: string
  scrim?: string
  content?: string
  eyebrow?: string
  title?: string
  text?: string
  cta?: string
}

/** Pixel size of the pictures, so nothing shifts while they load (wide 1800×700, mobile 900×700 by default). */
export type BannerImageSize = { width: number; height: number; mobileWidth: number; mobileHeight: number }
export const DEFAULT_BANNER_IMAGE_SIZE: BannerImageSize = { width: 1800, height: 700, mobileWidth: 900, mobileHeight: 700 }

export type BannerProps = BannerData & {
  /** `true` for the LCP picture (`fetchpriority=high`); the others load lazily. */
  priority?: boolean
  /** Heading level of the title (`h1` only for the page's first banner). Default `h2`. */
  headingLevel?: 'h1' | 'h2' | 'h3'
  /** Turns `url` into the link target (e.g. the store's `menuHref`). Default: as is. */
  resolveHref?: (url: string) => string
  /** Renders a link (a router `<Link>`); default a plain `<a>`. */
  renderLink?: (props: BannerLinkProps) => ReactNode
  imageSize?: Partial<BannerImageSize>
  classNames?: BannerClassNames
}

const defaultLink = ({ href, className, children }: BannerLinkProps) => (
  <a href={href} className={className}>
    {children}
  </a>
)

/**
 * One banner: the picture (desktop + mobile source, `focus` as `object-position`, fixed size) and, when it has a message,
 * the veil and the text positioned by `text_position` / `text_vertical` / `scrim`. A banner without a message (a banner
 * synced from another system) is wholly a link. Style with `@asteby/storefront-react/hero.css` and `classNames`.
 */
export function Banner({ priority, headingLevel = 'h2', resolveHref = (u) => u, renderLink = defaultLink, imageSize, classNames, ...b }: BannerProps) {
  const size = { ...DEFAULT_BANNER_IMAGE_SIZE, ...imageSize }
  const hasText = Boolean(b.title || b.eyebrow || b.text)
  const picture = (
    <picture>
      {b.image_mobile ? <source media="(max-width: 700px)" srcSet={b.image_mobile} width={size.mobileWidth} height={size.mobileHeight} /> : null}
      <img
        data-sf-banner-image=""
        data-with-message={hasText ? '' : undefined}
        src={b.image}
        alt={b.alt ?? ''}
        width={size.width}
        height={size.height}
        {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
        decoding="async"
        className={classNames?.image}
        style={bannerImageStyle(b.focus)}
      />
    </picture>
  )
  if (!hasText) return b.url ? <>{renderLink({ href: resolveHref(b.url), children: picture })}</> : picture

  const Heading = headingLevel
  return (
    <div
      data-sf-banner=""
      data-text-position={isOneOf(BANNER_TEXT_POSITIONS, b.text_position) ? b.text_position : undefined}
      data-text-vertical={isOneOf(BANNER_TEXT_VERTICALS, b.text_vertical) ? b.text_vertical : undefined}
      data-text-size={isOneOf(BANNER_TEXT_SIZES, b.text_size) ? b.text_size : undefined}
      data-scrim={isOneOf(BANNER_SCRIMS, b.scrim) ? b.scrim : undefined}
      className={classNames?.message}
    >
      {picture}
      <div data-sf-banner-scrim="" aria-hidden="true" className={classNames?.scrim} />
      <div data-sf-banner-content="" className={classNames?.content}>
        {b.eyebrow ? (
          <p data-sf-banner-eyebrow="" className={classNames?.eyebrow}>
            {b.eyebrow}
          </p>
        ) : null}
        {b.title ? (
          <Heading data-sf-banner-title="" className={classNames?.title}>
            {b.title}
          </Heading>
        ) : null}
        {b.text ? (
          <p data-sf-banner-text="" className={classNames?.text}>
            {b.text}
          </p>
        ) : null}
        {b.cta_label && b.url ? renderLink({ href: resolveHref(b.url), className: classNames?.cta, children: b.cta_label }) : null}
      </div>
    </div>
  )
}
