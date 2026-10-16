import { createElement, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react'
import { formatMoney, parseMoney, type FormatMoneyOptions, type Image as ImageData, type Money as MoneyData, type Product, type ProductVariant } from '@asteby/storefront'
import { useOptionalStorefront } from './context.js'

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type MoneyProps<As extends ElementType = 'span'> = FormatMoneyOptions & {
  data: MoneyData
  /** Element to render (default `span`). */
  as?: As
  /** Overrides the provider locale. */
  locale?: string
} & Omit<ComponentPropsWithoutRef<As>, 'children' | 'as'>

/** Formats `Money` with the provider locale (or `locale`). */
export function Money<As extends ElementType = 'span'>({
  data,
  as,
  locale,
  withoutTrailingZeros,
  withoutCurrency,
  currencyDisplay,
  ...rest
}: MoneyProps<As>) {
  const sf = useOptionalStorefront()
  const text = formatMoney(data, locale ?? sf?.locale, {
    ...(withoutTrailingZeros !== undefined ? { withoutTrailingZeros } : {}),
    ...(withoutCurrency !== undefined ? { withoutCurrency } : {}),
    ...(currencyDisplay !== undefined ? { currencyDisplay } : {}),
  })
  return createElement(as ?? 'span', rest, text)
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export const DEFAULT_IMAGE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1600] as const

/** Builds the URL for one srcset width. */
export type ImageLoader = (src: string, width: number, height?: number) => string

/**
 * Default loader: adds `?width=<w>` (the convention of most image CDNs and of
 * the OPS image proxy). URLs that cannot be parsed are returned unchanged.
 */
export const defaultImageLoader: ImageLoader = (src, width, height) => {
  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(src)
    const url = new URL(src, 'http://relative.invalid')
    url.searchParams.set('width', String(width))
    if (height) url.searchParams.set('height', String(height))
    return isAbsolute ? url.toString() : url.pathname + url.search + url.hash
  } catch {
    return src
  }
}

export type ImageProps = Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'srcSet' | 'width' | 'height'> & {
  data: ImageData
  /** `sizes` attribute (default `100vw`). */
  sizes?: string
  /** Candidate widths for `srcset` (capped at the intrinsic width when known). */
  widths?: readonly number[]
  /** URL builder per width (default adds `?width=`). Pass `null` to disable srcset. */
  loader?: ImageLoader | null
  /** Above-the-fold image: eager loading and `fetchpriority="high"`. */
  priority?: boolean
  /** Forces an aspect ratio, e.g. `1/1` or `4/3`, used for width/height and srcset heights. */
  aspectRatio?: string
}

function parseRatio(ratio: string | undefined): number | null {
  if (!ratio) return null
  const [w, h] = ratio.split(/[/:]/).map((n) => Number.parseFloat(n))
  return w && h ? w / h : null
}

/** Responsive `<img>` with `srcset`, lazy by default, intrinsic size to avoid layout shift. */
export function Image({
  data,
  sizes = '100vw',
  widths = DEFAULT_IMAGE_WIDTHS,
  loader = defaultImageLoader,
  priority = false,
  aspectRatio,
  alt,
  loading,
  decoding,
  ...rest
}: ImageProps) {
  const ratio = parseRatio(aspectRatio) ?? (data.width && data.height ? data.width / data.height : null)
  let candidates = [...widths].sort((a, b) => a - b)
  if (data.width) {
    const capped = candidates.filter((w) => w <= data.width!)
    candidates = capped.length ? capped : [data.width]
  }
  const srcSet = loader
    ? candidates.map((w) => `${loader(data.url, w, ratio ? Math.round(w / ratio) : undefined)} ${w}w`).join(', ')
    : undefined
  const width = data.width ?? candidates[candidates.length - 1]
  const height = data.height ?? (ratio && width ? Math.round(width / ratio) : undefined)
  return (
    <img
      src={data.url}
      alt={alt ?? data.alt ?? ''}
      {...(srcSet ? { srcSet, sizes } : {})}
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      decoding={decoding ?? (priority ? 'auto' : 'async')}
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      {...rest}
    />
  )
}

// ---------------------------------------------------------------------------
// ProductPrice
// ---------------------------------------------------------------------------

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

export type ProductPriceProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  product?: Pick<Product, 'price_range' | 'compare_at_price_range'> | null
  variant?: Pick<ProductVariant, 'price' | 'compare_at_price'> | null
  /** Prefix shown when the product has a price range and no variant is selected (default `Desde`). */
  fromLabel?: ReactNode
  /** Accessible label for the compare-at price (default `Precio anterior`). */
  compareAtLabel?: string
  locale?: string
  withoutTrailingZeros?: boolean
}

/**
 * Price with optional compare-at (strikethrough). With a `variant` it shows
 * that variant; otherwise the product's minimum price (prefixed with
 * `fromLabel` when prices vary).
 */
export function ProductPrice({
  product,
  variant,
  fromLabel = 'Desde',
  compareAtLabel = 'Precio anterior',
  locale,
  withoutTrailingZeros,
  ...rest
}: ProductPriceProps) {
  let price: MoneyData | null = null
  let compareAt: MoneyData | null = null
  let isRange = false
  if (variant) {
    price = variant.price
    compareAt = variant.compare_at_price
  } else if (product) {
    price = product.price_range.min
    compareAt = product.compare_at_price_range?.min ?? null
    isRange = product.price_range.min.amount !== product.price_range.max.amount
  }
  if (!price) return null
  const onSale = compareAt !== null && parseMoney(compareAt) > parseMoney(price)
  const opts = { ...(locale ? { locale } : {}), ...(withoutTrailingZeros !== undefined ? { withoutTrailingZeros } : {}) }
  return (
    <div data-on-sale={onSale || undefined} {...rest}>
      {isRange ? <span data-price-prefix="">{fromLabel} </span> : null}
      <Money data={price} data-price="" {...opts} />
      {onSale && compareAt ? (
        <>
          {' '}
          <s data-compare-at-price="">
            <span style={VISUALLY_HIDDEN}>{compareAtLabel}: </span>
            <Money data={compareAt} {...opts} />
          </s>
        </>
      ) : null}
    </div>
  )
}
