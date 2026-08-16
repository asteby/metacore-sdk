import * as React from 'react'
import { Package } from 'lucide-react'
import { Card } from '@/primitives/card'
import { cn } from '@/lib/utils'

export type ProductTileProps = {
  title: string
  subtitle?: string | null
  /** Already-formatted price / cost line (caller owns currency). */
  price: React.ReactNode
  imageUrl?: string | null
  disabled?: boolean
  /** Corner overlay (stock badge, etc.). */
  badge?: React.ReactNode
  /** Hover affordance (e.g. +). Shown only when not disabled. */
  hoverAction?: React.ReactNode
  onClick?: () => void
  className?: string
}

/**
 * Dense product card for till grids (POS / purchases). Presentation-only —
 * pricing, stock rules and add-to-cart live in the addon.
 *
 * Uses inline `aspectRatio` (not Tailwind `aspect-*`) so federated remotes
 * keep the ratio even when the host CSS scanner misses arbitrary utilities.
 */
export function ProductTile({
  title,
  subtitle,
  price,
  imageUrl,
  disabled = false,
  badge,
  hoverAction,
  onClick,
  className,
}: ProductTileProps) {
  return (
    <Card
      className={cn(
        'group flex flex-col gap-0 overflow-hidden p-0 py-0 transition-all duration-200',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-primary/40 cursor-pointer hover:shadow-md active:scale-[0.98]',
        className
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div
        className='bg-muted relative w-full overflow-hidden'
        style={{ aspectRatio: '4 / 3' }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- till tiles are host-agnostic
          <img
            src={imageUrl}
            alt={title}
            className='size-full object-cover'
          />
        ) : (
          <div className='flex size-full items-center justify-center'>
            <Package className='text-muted-foreground size-10 opacity-40' />
          </div>
        )}
        {badge ? (
          <div className='absolute top-2 right-2'>{badge}</div>
        ) : hoverAction && !disabled ? (
          <div
            className={cn(
              'bg-primary text-primary-foreground absolute top-2 right-2 flex size-7 items-center justify-center rounded-full opacity-0 shadow transition-opacity',
              'group-hover:opacity-100'
            )}
          >
            {hoverAction}
          </div>
        ) : null}
      </div>
      <div className='flex flex-col gap-0.5 p-2.5'>
        <span className='text-card-foreground line-clamp-2 text-sm leading-tight font-medium'>
          {title}
        </span>
        {subtitle ? (
          <span className='text-muted-foreground truncate font-mono text-xs'>
            {subtitle}
          </span>
        ) : null}
        <div className='text-sm'>{price}</div>
      </div>
    </Card>
  )
}

/** Resolve media key / absolute URL for till tiles. Empty → no image. */
export function resolveTillImageUrl(image: string | null | undefined): string {
  if (!image) return ''
  if (/^https?:\/\//.test(image) || image.startsWith('/')) return image
  return `/api/media/${image}`
}
