import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Image, type ImageLoader } from '../components.js'
import { useResolvedLocale } from '../locale.js'
import { clampIndex, galleryImages, isLowResImage, LOW_RES_MAX, variantImageIndex, type GalleryImage, type GalleryProduct, type GalleryVariant } from './gallery-model.js'
import { fillProductText, productMessages, type ProductMessages } from './messages.js'

export type ProductGalleryClassNames = Partial<
  Record<
    | 'root'
    | 'viewport'
    | 'track'
    | 'slide'
    | 'image'
    | 'counter'
    | 'previous'
    | 'next'
    | 'thumbnails'
    | 'thumbnail'
    | 'thumbnailImage'
    | 'placeholder',
    string
  >
>

/** One `<source>` of a `<picture>` (e.g. a WebP or AVIF `srcset` built by the store). */
export type GallerySource = { srcSet: string; type?: string; sizes?: string; media?: string }

export type ProductGalleryProps = {
  /** The product: `images` (else `featured_image`) and `title` (accessible names and the `alt` fallback). */
  product: GalleryProduct
  /** Explicit list (already ordered by the store); `product.images` when omitted. */
  images?: readonly GalleryImage[] | null
  /** Selected variant: its image (`variant_id`, else the URL of `variant.image`) becomes the active slide. */
  variant?: GalleryVariant | null
  /** `srcset` URL builder per width (the SDK's `?width=` by default; `null` disables `srcset`). */
  loader?: ImageLoader | null
  /** `<picture>` sources per image (e.g. WebP/AVIF from the store's image server); none → a plain `<img>`. */
  sources?: (image: GalleryImage, widths: readonly number[]) => readonly GallerySource[] | null | undefined
  /** Candidate widths of the main image (capped at its intrinsic width). */
  widths?: readonly number[]
  sizes?: string
  thumbnailWidths?: readonly number[]
  thumbnailSizes?: string
  /** Longest side (px) up to which a photo is shown at its real size instead of being stretched (default 300). */
  lowResMax?: number
  /** The first visible image is the LCP: eager with `fetchpriority="high"` (default `true`). */
  priority?: boolean
  /** What to show without images (a mockup, a brand drawing); a neutral box with an accessible name by default. */
  placeholder?: ReactNode
  /** Accessible name of the gallery; «Imágenes de {title}» by default. */
  label?: string
  /** Called after the active image changes (swipe, keys, buttons, thumbnails or variant). */
  onIndexChange?: (index: number, image: GalleryImage) => void
  locale?: string
  messages?: Partial<ProductMessages>
  className?: string
  classNames?: ProductGalleryClassNames
}

// Layout effect in the browser (no flash of image 0 before jumping to the variant's), plain effect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const MAIN_WIDTHS = [480, 720, 960, 1280] as const
const THUMB_WIDTHS = [160] as const

const cx = (...parts: Array<string | undefined | false>): string | undefined => parts.filter(Boolean).join(' ') || undefined

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isRtl(el: HTMLElement): boolean {
  return typeof getComputedStyle === 'function' && getComputedStyle(el).direction === 'rtl'
}

/** Default placeholder: a neutral square with a picture glyph and an accessible name. */
function Placeholder({ label, className }: { label: string; className?: string }) {
  return (
    <div data-sf-gallery-placeholder="" role="img" aria-label={label} className={className}>
      <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5-9 9" />
      </svg>
    </div>
  )
}

/**
 * Product gallery for any store. It detects how many images there are:
 * - **0**: the `placeholder` (or a neutral box), never a hole.
 * - **1**: the image alone, no thumbnails, no controls.
 * - **2+**: a carousel with scroll-snap (swipe on touch, works without JavaScript), previous/next buttons, a «2 de 5»
 *   counter announced to screen readers, keyboard (←/→, Home/End on the focused carousel) and a thumbnail strip.
 *
 * The selected variant's image becomes the active slide. Small photos (≤ `lowResMax` px, or `low_res: true`) are shown
 * at their real size, centered and never stretched. Every image carries its width and height and the box has a fixed
 * aspect ratio (`--sf-gallery-ratio`), so nothing moves while it loads. Style with `product.css` and `classNames`.
 */
export function ProductGallery({
  product,
  images: imagesProp,
  variant,
  loader,
  sources,
  widths = MAIN_WIDTHS,
  sizes = '(min-width: 1024px) 50vw, 100vw',
  thumbnailWidths = THUMB_WIDTHS,
  thumbnailSizes = '80px',
  lowResMax = LOW_RES_MAX,
  priority = true,
  placeholder,
  label,
  onIndexChange,
  locale,
  messages,
  className,
  classNames,
}: ProductGalleryProps) {
  const loc = useResolvedLocale(locale)
  const m = productMessages(loc, messages)
  const images = galleryImages(product, imagesProp, variant)
  const count = images.length
  const target = variantImageIndex(images, variant)
  const baseId = useId()
  const trackId = `${baseId}-track`

  const [rawActive, setActive] = useState(() => Math.max(0, target))
  const active = clampIndex(rawActive, count)
  const activeRef = useRef(active)
  activeRef.current = active
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLUListElement>(null)
  // Index a programmatic scroll is heading to: the scroll events on the way do not move the counter.
  const pending = useRef<number | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(false)
  const notified = useRef(active)
  const onIndexChangeRef = useRef(onIndexChange)
  onIndexChangeRef.current = onIndexChange

  const scrollToIndex = (index: number, smooth: boolean) => {
    const el = trackRef.current
    if (!el) return
    const left = (isRtl(el) ? -1 : 1) * index * el.clientWidth
    pending.current = index
    clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => (pending.current = null), 900)
    if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
    else el.scrollLeft = left
  }

  const select = (index: number, smooth = true) => {
    const next = clampIndex(index, count)
    setActive(next)
    scrollToIndex(next, smooth)
  }

  // First paint: a variant chosen by URL starts on its image (instantly, before paint). Later variant changes slide to it.
  useIsomorphicLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (activeRef.current > 0) scrollToIndex(activeRef.current, false)
      return
    }
    if (target >= 0 && target !== activeRef.current) select(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, target])

  useEffect(() => () => clearTimeout(pendingTimer.current), [])

  // The active thumbnail stays in view inside its own strip (never scrolls the page).
  useEffect(() => {
    const strip = thumbsRef.current
    const item = strip?.children[active] as HTMLElement | undefined
    if (strip && item && strip.scrollWidth > strip.clientWidth && typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: item.offsetLeft - (strip.clientWidth - item.clientWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
    if (notified.current !== active) {
      notified.current = active
      const img = images[active]
      if (img) onIndexChangeRef.current?.(active, img)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const onScroll = () => {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const index = clampIndex(Math.abs(el.scrollLeft) / el.clientWidth, count)
    if (pending.current !== null) {
      if (index !== pending.current) return
      pending.current = null
    }
    if (index !== activeRef.current) setActive(index)
  }
  // A finger, wheel or trackpad takes over from a programmatic scroll.
  const release = () => {
    pending.current = null
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rtl = isRtl(e.currentTarget)
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>
    let next: number | null = null
    if (e.key in step) next = activeRef.current + step[e.key]!
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    if (next === null) return
    e.preventDefault()
    select(next)
  }

  const title = product.title
  const name = label ?? fillProductText(m['gallery.label'], { title })

  if (count === 0) {
    return (
      <div data-sf-gallery="" data-state="empty" className={cx(className, classNames?.root)}>
        <div data-sf-gallery-viewport="" className={classNames?.viewport}>
          {placeholder ?? <Placeholder label={fillProductText(m['gallery.empty'], { title })} className={classNames?.placeholder} />}
        </div>
      </div>
    )
  }

  const multiple = count > 1
  const renderImage = (img: GalleryImage, i: number, thumb: boolean) => {
    const w = thumb ? thumbnailWidths : widths
    const lowRes = isLowResImage(img, lowResMax)
    // Image 0 is what shows before hydration; the variant's is what shows after: both load first.
    const lead = !thumb && priority && (i === 0 || i === target)
    const picture = sources?.(img, w)?.filter((s) => s.srcSet)
    const el = (
      <Image
        data={img}
        widths={w}
        sizes={thumb ? thumbnailSizes : sizes}
        {...(loader !== undefined ? { loader } : {})}
        priority={lead}
        alt={thumb ? '' : img.alt?.trim() || title}
        draggable={false}
        data-low-res={lowRes ? '' : undefined}
        className={thumb ? classNames?.thumbnailImage : classNames?.image}
      />
    )
    if (!picture?.length) return el
    return (
      <picture data-sf-gallery-picture="">
        {picture.map((s, k) => (
          <source key={k} srcSet={s.srcSet} {...(s.type ? { type: s.type } : {})} sizes={s.sizes ?? (thumb ? thumbnailSizes : sizes)} {...(s.media ? { media: s.media } : {})} />
        ))}
        {el}
      </picture>
    )
  }

  const vars = { index: active + 1, count }
  return (
    <section
      data-sf-gallery=""
      data-state={multiple ? 'multiple' : 'single'}
      data-count={count}
      aria-label={name}
      {...(multiple ? { 'aria-roledescription': m['gallery.roledescription'] } : {})}
      className={cx(className, classNames?.root)}
    >
      <div data-sf-gallery-viewport="" className={classNames?.viewport}>
        <div
          ref={trackRef}
          id={trackId}
          data-sf-gallery-track=""
          className={classNames?.track}
          {...(multiple
            ? { tabIndex: 0, role: 'group', 'aria-label': m['gallery.track'], onKeyDown, onScroll, onPointerDown: release, onTouchStart: release, onWheel: release }
            : {})}
        >
          {images.map((img, i) => (
            <div
              key={img.url}
              id={`${baseId}-slide-${i}`}
              data-sf-gallery-slide=""
              data-active={i === active ? '' : undefined}
              className={classNames?.slide}
              {...(multiple
                ? { role: 'group', 'aria-roledescription': m['gallery.slide.roledescription'], 'aria-label': fillProductText(m['gallery.slide'], { index: i + 1, count }) }
                : {})}
            >
              {renderImage(img, i, false)}
            </div>
          ))}
        </div>
        {multiple ? (
          <>
            <button
              type="button"
              data-sf-gallery-nav="previous"
              className={classNames?.previous}
              aria-label={m['gallery.previous']}
              aria-controls={trackId}
              aria-disabled={active === 0 ? 'true' : undefined}
              onClick={() => {
                if (!(active === 0)) select(active - 1)
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              data-sf-gallery-nav="next"
              className={classNames?.next}
              aria-label={m['gallery.next']}
              aria-controls={trackId}
              aria-disabled={active === count - 1 ? 'true' : undefined}
              onClick={() => {
                if (!(active === count - 1)) select(active + 1)
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <p data-sf-gallery-counter="" className={classNames?.counter} aria-live="polite" aria-atomic="true">
              <span aria-hidden="true">{fillProductText(m['gallery.counter'], vars)}</span>
              <span data-sf-gallery-sr="">{fillProductText(m['gallery.slide'], vars)}</span>
            </p>
          </>
        ) : null}
      </div>
      {multiple ? (
        <ul ref={thumbsRef} data-sf-gallery-thumbnails="" className={classNames?.thumbnails} aria-label={m['gallery.thumbnails']}>
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                data-sf-gallery-thumbnail=""
                className={classNames?.thumbnail}
                aria-label={fillProductText(m['gallery.thumbnail'], { index: i + 1, count })}
                aria-controls={trackId}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => select(i)}
              >
                {renderImage(img, i, true)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
