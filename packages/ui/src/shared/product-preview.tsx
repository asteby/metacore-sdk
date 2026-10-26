import * as React from 'react'
import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/primitives/dialog'

/**
 * Product preview of the admin apps (OPS): ONE picture-plus-text pattern for every place a product is listed —
 * order / quote / sale lines, pickers, record details. Screens compose it; none draws its own thumbnail.
 *
 * - `ProductThumb`: the picture alone. Fixed aspect ratio, `object-contain` on a soft surface (parts photographed on
 *   white are never cropped), lazy + async decoding, shimmer while it loads, and a designed fallback (initial of the
 *   name, or a package glyph) when there is no image, it fails, or the product no longer exists. `zoomable` opens a
 *   light lightbox (dialog) with the full picture; the hover lifts the image slightly.
 * - `ProductPreview`: thumb + name (2 lines) + variant + SKU + quantity and prices with a clear hierarchy.
 *
 * Plain Tailwind on the theme tokens (`bg-muted`, `text-muted-foreground`, `border`): light and dark come for free.
 * The sibling for the stores (no Tailwind) is `@asteby/storefront-react/ui` `ProductThumb`/`ProductPreview`, same
 * props and the same fallback rules.
 */

export type ProductThumbSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIDE: Record<ProductThumbSize, string> = {
  xs: 'size-8 rounded-md text-[0.6875rem]',
  sm: 'size-10 rounded-md text-xs',
  md: 'size-14 rounded-lg text-sm',
  lg: 'size-20 rounded-xl text-lg',
  xl: 'size-28 rounded-xl text-2xl',
}

/** Letters of the fallback: two initials for two words, one otherwise, '' when nothing usable. */
export function productInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFKC')
    .split(/[\s\-_/.,()]+/)
    .map((w) => Array.from(w).find((c) => /\p{L}|\p{N}/u.test(c)) ?? '')
    .filter(Boolean)
  if (words.length === 0) return ''
  return (words.length > 1 ? words[0]! + words[1]! : words[0]!).toLocaleUpperCase()
}

type ThumbState = 'loading' | 'loaded' | 'fallback'

export interface ProductThumbProps {
  /** Resolved URL of the picture (product or variant). Empty / nullish: the fallback. */
  src?: string | null
  /** `srcset` when the host has derivatives (e.g. 320 px thumb + main). */
  srcSet?: string
  /** `sizes` for the `srcset`. */
  sizes?: string
  /** Product name: alt text, zoom title and source of the fallback initial. */
  name?: string | null
  size?: ProductThumbSize
  /** `contain` (default) never crops; `cover` fills the box. */
  fit?: 'contain' | 'cover'
  /** Aspect ratio of the box, CSS `aspect-ratio` value. Default `1 / 1`. */
  ratio?: string
  /** The name sits next to the picture as text: `alt=""` and the fallback is hidden from screen readers. */
  decorative?: boolean
  /** Click opens the picture large. Ignored without a working picture. */
  zoomable?: boolean
  /** Label of the zoom button (`Ver imagen de {name}` by default is built from `zoomLabel`). */
  zoomLabel?: string
  /** Quantity badge, shown when greater than 1. */
  quantity?: number
  /** Above the fold: eager load. */
  priority?: boolean
  className?: string
}

/** Picture of a product with fixed ratio, shimmer, lazy loading and a fallback that always looks designed. */
export function ProductThumb({
  src,
  srcSet,
  sizes,
  name,
  size = 'md',
  fit = 'contain',
  ratio = '1 / 1',
  decorative = false,
  zoomable = false,
  zoomLabel = 'Ampliar imagen',
  quantity,
  priority = false,
  className,
}: ProductThumbProps) {
  const url = src?.trim() || null
  const [state, setState] = React.useState<ThumbState>(url ? 'loading' : 'fallback')
  const [open, setOpen] = React.useState(false)
  const box = React.useRef<HTMLSpanElement>(null)

  // A new picture (another variant) starts over. One the browser already loaded (cache, SSR) never fires `load`.
  React.useEffect(() => {
    const img = box.current?.querySelector('img')
    setState(!url ? 'fallback' : img?.complete ? (img.naturalWidth > 0 ? 'loaded' : 'fallback') : 'loading')
  }, [url])

  const label = name?.trim() || ''
  const initials = productInitials(label)
  const showImg = !!url && state !== 'fallback'
  const canZoom = zoomable && showImg

  const picture = (
    <span
      ref={box}
      data-slot='product-thumb'
      data-state={state}
      style={{ aspectRatio: ratio }}
      className={cn(
        'bg-muted text-muted-foreground relative inline-block shrink-0 overflow-hidden align-middle',
        'ring-border/70 ring-1 ring-inset',
        SIDE[size],
        // Shimmer only while the file is in flight.
        state === 'loading' &&
          'before:via-foreground/10 before:absolute before:inset-0 before:animate-pulse before:bg-gradient-to-r before:from-transparent before:to-transparent motion-reduce:before:animate-none',
        className,
      )}
      {...(state === 'fallback' && !decorative && label ? { role: 'img', 'aria-label': label } : {})}
      {...(decorative || (state === 'fallback' && !label) ? { 'aria-hidden': true } : {})}
    >
      {showImg ? (
        <img
          src={url}
          {...(srcSet ? { srcSet, sizes } : {})}
          alt={decorative || canZoom ? '' : label}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'auto' : 'async'}
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={(e) => {
            // A host that retries another derivative (thumb -> main) rewrites `src` before this runs: not a failure yet.
            if (e.currentTarget.getAttribute('src') !== url) return
            setState('fallback')
          }}
          className={cn(
            'size-full transition-transform duration-200 ease-out motion-reduce:transition-none',
            fit === 'cover' ? 'object-cover' : 'object-contain p-[6%] mix-blend-multiply dark:mix-blend-normal',
            canZoom && 'group-hover/thumb:scale-105',
          )}
        />
      ) : (
        <span
          aria-hidden
          data-slot='product-thumb-fallback'
          className='from-foreground/[0.03] to-foreground/[0.09] text-muted-foreground/70 absolute inset-0 grid place-items-center bg-gradient-to-br font-semibold leading-none tracking-wide'
        >
          {initials ? <span>{initials}</span> : <Package className='size-[45%]' strokeWidth={1.6} />}
        </span>
      )}
      {typeof quantity === 'number' && quantity > 1 ? (
        <span
          aria-hidden
          data-slot='product-thumb-qty'
          className='bg-foreground/80 text-background absolute end-0.5 top-0.5 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.6875rem] font-bold tabular-nums'
        >
          {quantity}
        </span>
      ) : null}
    </span>
  )

  if (!canZoom) return picture
  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        aria-label={label ? `${zoomLabel}: ${label}` : zoomLabel}
        data-slot='product-thumb-zoom'
        className='group/thumb focus-visible:ring-ring inline-flex shrink-0 cursor-zoom-in rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
      >
        {picture}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-[min(92vw,44rem)] gap-3 p-3 sm:p-4'>
          <DialogTitle className='truncate pe-8 text-base'>{label || zoomLabel}</DialogTitle>
          <DialogDescription className='sr-only'>{zoomLabel}</DialogDescription>
          <div className='bg-muted grid max-h-[75vh] place-items-center overflow-hidden rounded-lg'>
            <img src={url!} alt={label} className='max-h-[75vh] w-full object-contain' />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export interface ProductPreviewProps extends Pick<ProductThumbProps, 'src' | 'srcSet' | 'sizes' | 'fit' | 'ratio' | 'zoomable' | 'zoomLabel' | 'priority'> {
  /** Product name. Empty = the product no longer exists: a "no disponible" row, never a blank one. */
  name?: string | null
  /** Variant ("Rojo / L"). */
  variant?: React.ReactNode
  sku?: string | null
  quantity?: number | null
  /** Unit price, formatted. Shown next to the quantity when it is greater than 1. */
  unitPrice?: React.ReactNode
  /** Line total, formatted: right-aligned, the strongest number. */
  total?: React.ReactNode
  /** Trailing cell when there is no total (status badge, action). */
  trailing?: React.ReactNode
  /** Under the text: status, location, notes. */
  children?: React.ReactNode
  size?: ProductThumbSize
  /** Prefix of the SKU. Default `SKU`. */
  skuLabel?: string
  /** "Cantidad" label. Default `Cantidad`. */
  quantityLabel?: string
  /** Text for a product that no longer exists. */
  unavailableLabel?: string
  className?: string
}

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 })

/**
 * A product line: picture, name (2 lines), variant, SKU, quantity and prices with a clear hierarchy.
 * Degrades to a designed placeholder when there is no image or no product.
 */
export function ProductPreview({
  src,
  srcSet,
  sizes,
  name,
  variant,
  sku,
  quantity,
  unitPrice,
  total,
  trailing,
  children,
  size = 'md',
  fit,
  ratio,
  zoomable,
  zoomLabel,
  priority,
  skuLabel = 'SKU',
  quantityLabel = 'Cantidad',
  unavailableLabel = 'Producto no disponible',
  className,
}: ProductPreviewProps) {
  const label = name?.trim() ?? ''
  const missing = !label
  const hasQty = typeof quantity === 'number' && Number.isFinite(quantity)
  return (
    <div data-slot='product-preview' {...(missing ? { 'data-missing': '' } : {})} className={cn('flex min-w-0 items-start gap-3', className)}>
      <ProductThumb
        src={src}
        {...(srcSet ? { srcSet } : {})}
        {...(sizes ? { sizes } : {})}
        name={label || null}
        size={size}
        decorative={!zoomable}
        {...(fit ? { fit } : {})}
        {...(ratio ? { ratio } : {})}
        {...(zoomable ? { zoomable } : {})}
        {...(zoomLabel ? { zoomLabel } : {})}
        {...(priority ? { priority } : {})}
        {...(hasQty ? { quantity: quantity! } : {})}
      />
      <div className='min-w-0 flex-1 space-y-0.5'>
        <p
          data-slot='product-preview-name'
          title={label || undefined}
          className={cn('line-clamp-2 break-words text-sm leading-snug font-medium', missing && 'text-muted-foreground italic')}
        >
          {label || unavailableLabel}
        </p>
        {variant ? <p className='text-muted-foreground truncate text-xs'>{variant}</p> : null}
        {sku ? (
          <p data-slot='product-preview-sku' className='text-muted-foreground truncate text-xs tabular-nums'>
            {skuLabel} {sku}
          </p>
        ) : null}
        {hasQty ? (
          <p data-slot='product-preview-qty' className='text-muted-foreground text-xs tabular-nums'>
            {quantityLabel} {nf.format(quantity!)}
            {unitPrice != null && quantity! > 1 ? <span> · {unitPrice}</span> : null}
          </p>
        ) : null}
        {children}
      </div>
      {total != null || (unitPrice != null && !(hasQty && quantity! > 1)) ? (
        <p data-slot='product-preview-total' className='shrink-0 text-end text-sm font-semibold tabular-nums'>
          {total ?? unitPrice}
        </p>
      ) : (
        (trailing ?? null)
      )}
    </div>
  )
}
