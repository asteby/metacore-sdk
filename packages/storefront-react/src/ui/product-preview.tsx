/**
 * Product preview of the storefront: ONE picture-plus-text pattern for every place a product is listed (cart drawer,
 * checkout summary, "Mis pedidos", order detail). Headless (`data-sf-preview*`, `classNames`), styled by
 * `product-preview.css` (plain CSS on the store tokens, dark mode included), SSR-safe.
 *
 * - `ProductThumb`: the picture alone. Fixed aspect ratio, `object-fit: contain` on a soft surface (parts photographed
 *   on white are never cropped), responsive `srcset` through the shared `Image`, lazy by default, a shimmer while it
 *   loads and an elegant fallback (initial of the name, or a package glyph) when there is no image, it is broken, or
 *   the product no longer exists. Optional quantity badge.
 * - `ProductPreview`: thumb + name (2 lines) + variant + SKU + quantity x unit price, with the line total aligned right.
 * - `ProductThumbStack`: overlapped thumbs with a "+N" counter (order cards).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Image as ImageData } from '@asteby/storefront'
import { Image, type ImageLoader } from '../components.js'

type ThumbState = 'loading' | 'loaded' | 'fallback'

/** First letter(s) of the name for the fallback: two initials from two words, one otherwise. Empty when nothing usable. */
export function productInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFKC')
    .split(/[\s\-_/.,()]+/)
    .map((w) => Array.from(w).find((c) => /\p{L}|\p{N}/u.test(c)) ?? '')
    .filter(Boolean)
  if (words.length === 0) return ''
  return (words.length > 1 ? words[0]! + words[1]! : words[0]!).toLocaleUpperCase()
}

export type ProductThumbClassNames = Partial<Record<'root' | 'img' | 'fallback' | 'badge', string>>

export type ProductThumbImage = { url: string; alt?: string | null; width?: number; height?: number }

export type ProductThumbProps = {
  /** Picture of the product or variant. `null`/missing: shows the fallback. */
  image?: ProductThumbImage | null
  /** Name of the product: alt of the picture (unless `decorative`) and source of the fallback initial. */
  name?: string | null
  /** Side in px. Default 56. */
  size?: number
  /** Aspect ratio of the box, `w/h`. Default `1/1`. */
  ratio?: string
  /** `contain` (default) never crops; `cover` fills the box. */
  fit?: 'contain' | 'cover'
  /** Quantity badge, shown when greater than 1. */
  quantity?: number
  /** The name sits next to it as text: the picture has `alt=""` and the fallback is hidden from screen readers. Default false. */
  decorative?: boolean
  /** Slight zoom on hover (honours `prefers-reduced-motion`). Default true. */
  zoom?: boolean
  /** Above the fold: eager load. */
  priority?: boolean
  sizes?: string
  loader?: ImageLoader | null
  className?: string
  classNames?: ProductThumbClassNames
}

/** The picture of a product with fixed ratio, shimmer, lazy loading and a fallback that always looks designed. */
export function ProductThumb({
  image,
  name,
  size = 56,
  ratio = '1/1',
  fit = 'contain',
  quantity,
  decorative = false,
  zoom = true,
  priority = false,
  sizes,
  loader,
  className,
  classNames: cx = {},
}: ProductThumbProps) {
  const url = image?.url || null
  const [state, setState] = useState<ThumbState>(url ? 'loading' : 'fallback')
  const box = useRef<HTMLSpanElement>(null)
  // A new picture (another variant) starts over; a missing one goes straight to the fallback.
  useEffect(() => {
    const img = box.current?.querySelector('img')
    // The browser may have loaded the picture before hydration: no `load` event will come.
    setState(!url ? 'fallback' : img?.complete ? (img.naturalWidth > 0 ? 'loaded' : 'fallback') : 'loading')
  }, [url])

  const label = name?.trim() || ''
  const initials = productInitials(label)
  const showBadge = typeof quantity === 'number' && quantity > 1
  const a11y = state === 'fallback' && !decorative && label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': decorative || state === 'fallback' ? true : undefined }
  return (
    <span
      ref={box}
      className={[cx.root, className].filter(Boolean).join(' ') || undefined}
      style={{ ['--sf-preview-size' as string]: `${size}px`, ['--sf-preview-ratio' as string]: ratio.replace(':', '/') }}
      data-sf-thumb=""
      data-state={state}
      data-fit={fit}
      data-zoom={zoom || undefined}
      {...a11y}
    >
      {url && state !== 'fallback' ? (
        <Image
          data={{ url, alt: image?.alt ?? null, ...(image?.width ? { width: image.width } : {}), ...(image?.height ? { height: image.height } : {}) }}
          alt={decorative ? '' : (image?.alt ?? label)}
          aspectRatio={ratio}
          sizes={sizes ?? `${size * 2}px`}
          widths={[Math.round(size), Math.round(size * 2), Math.round(size * 3)]}
          {...(loader !== undefined ? { loader } : {})}
          priority={priority}
          className={cx.img}
          onLoad={() => setState('loaded')}
          onError={() => setState('fallback')}
        />
      ) : null}
      {state === 'fallback' ? (
        <span className={cx.fallback} data-sf-thumb-fallback="" aria-hidden="true">
          {initials ? <span data-sf-thumb-initial="">{initials}</span> : <PackageGlyph />}
        </span>
      ) : null}
      {showBadge ? (
        <span className={cx.badge} data-sf-thumb-qty="" aria-hidden="true">
          {quantity}
        </span>
      ) : null}
    </span>
  )
}

function PackageGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="45%" height="45%" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  )
}

export type ProductPreviewClassNames = Partial<Record<'root' | 'media' | 'body' | 'name' | 'variant' | 'meta' | 'sku' | 'qty' | 'price' | 'total' | 'unit', string>> & { thumb?: ProductThumbClassNames }

export type ProductPreviewProps = Pick<ProductThumbProps, 'image' | 'size' | 'ratio' | 'fit' | 'zoom' | 'priority' | 'sizes' | 'loader'> & {
  name: string
  /** "Rojo / L". Omit for default variants. */
  variant?: string | null
  sku?: string | null
  /** Quantity: a badge on the picture (> 1) and "Cantidad N" under the name. */
  quantity?: number
  /** Unit price, already formatted. Shown next to the quantity when it is greater than 1. */
  unitPrice?: ReactNode
  /** Line total, already formatted: aligned right, the strongest number. */
  total?: ReactNode
  /** Link on the name (product page). */
  href?: string | null
  /** Rendered under the text (status, note, actions). */
  children?: ReactNode
  /** Text of the quantity for screen readers and the meta line. Default `Cantidad {n}`. */
  quantityLabel?: string
  /** Name shown when the line has none (product deleted). Default `Producto no disponible`. */
  unavailableLabel?: string
  className?: string
  classNames?: ProductPreviewClassNames
}

/**
 * A product line: picture, name (2 lines), variant, SKU, quantity and prices with a clear hierarchy. Degrades to a
 * designed placeholder when the product has no image or no longer exists (empty name).
 */
export function ProductPreview({
  image,
  name,
  variant,
  sku,
  quantity,
  unitPrice,
  total,
  href,
  children,
  size = 64,
  ratio,
  fit,
  zoom,
  priority,
  sizes,
  loader,
  quantityLabel,
  unavailableLabel = 'Producto no disponible',
  className,
  classNames: cx = {},
}: ProductPreviewProps) {
  const missing = !name.trim()
  const title = missing ? unavailableLabel : name
  const hasQty = typeof quantity === 'number' && Number.isFinite(quantity)
  return (
    <div className={[cx.root, className].filter(Boolean).join(' ') || undefined} data-sf-preview="" data-missing={missing || undefined}>
      <span className={cx.media} data-sf-preview-media="">
        <ProductThumb
          image={image}
          name={missing ? null : name}
          size={size}
          decorative
          {...(ratio ? { ratio } : {})}
          {...(fit ? { fit } : {})}
          {...(zoom !== undefined ? { zoom } : {})}
          {...(priority ? { priority } : {})}
          {...(sizes ? { sizes } : {})}
          {...(loader !== undefined ? { loader } : {})}
          {...(hasQty ? { quantity: quantity! } : {})}
          {...(cx.thumb ? { classNames: cx.thumb } : {})}
        />
      </span>
      <span className={cx.body} data-sf-preview-body="">
        <span className={cx.name} data-sf-preview-name="">
          {href && !missing ? <a href={href}>{title}</a> : title}
        </span>
        {variant ? (
          <span className={cx.variant} data-sf-preview-variant="">
            {variant}
          </span>
        ) : null}
        {sku ? (
          <span className={cx.sku} data-sf-preview-sku="">
            SKU {sku}
          </span>
        ) : null}
        {hasQty ? (
          <span className={cx.meta} data-sf-preview-meta="">
            <span className={cx.qty} data-sf-preview-qty="">
              {(quantityLabel ?? 'Cantidad {n}').replace('{n}', String(quantity))}
            </span>
            {unitPrice != null && quantity! > 1 ? (
              <span className={cx.unit} data-sf-preview-unit="">
                {' · '}
                {unitPrice}
              </span>
            ) : null}
          </span>
        ) : null}
        {children}
      </span>
      {total != null ? (
        <span className={cx.total} data-sf-preview-total="">
          {total}
        </span>
      ) : unitPrice != null && !(hasQty && quantity! > 1) ? (
        <span className={cx.price} data-sf-preview-total="">
          {unitPrice}
        </span>
      ) : null}
    </div>
  )
}

export type ProductThumbStackProps = {
  items: ReadonlyArray<{ image?: ProductThumbImage | null; name?: string | null }>
  /** Thumbs shown before "+N". Default 4. */
  max?: number
  size?: number
  /** Screen reader text for the hidden remainder, `{n}` = how many. Default `y {n} más`. */
  moreLabel?: string
  className?: string
}

/** Overlapped thumbs with a "+N" counter: the products of an order at a glance. */
export function ProductThumbStack({ items, max = 4, size = 44, moreLabel = 'y {n} más', className }: ProductThumbStackProps) {
  if (items.length === 0) return null
  const shown = items.length > max ? items.slice(0, max - 1) : items
  const rest = items.length - shown.length
  return (
    <span className={className} data-sf-thumb-stack="" style={{ ['--sf-preview-size' as string]: `${size}px` }}>
      {shown.map((it, i) => (
        <ProductThumb key={i} image={it.image ?? null} name={it.name ?? null} size={size} zoom={false} />
      ))}
      {rest > 0 ? (
        <span data-sf-thumb-more="" role="img" aria-label={moreLabel.replace('{n}', String(rest))}>
          +{rest}
        </span>
      ) : null}
    </span>
  )
}
