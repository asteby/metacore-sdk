import { Skeleton } from '@/primitives/skeleton'
import { cn } from '@/lib/utils'

export type ProductTileSkeletonGridProps = {
  /** Number of placeholders. With `fill` it is the over-draw (default 40). */
  count?: number
  /** Same value as `ProductTile.imageAspect` so the placeholders match. */
  imageAspect?: string
  /**
   * Fill the whole available area: the grid takes the height of its parent and
   * clips the surplus placeholders, so a tall viewport never shows a short
   * strip of skeletons followed by empty space.
   */
  fill?: boolean
  className?: string
}

/** Loading placeholders matching {@link ProductTile} aspect ratio. */
export function ProductTileSkeletonGrid({
  count,
  imageAspect = '4 / 3',
  fill = false,
  className,
}: ProductTileSkeletonGridProps) {
  const total = count ?? (fill ? 40 : 10)
  return (
    <div
      data-fill={fill ? 'true' : undefined}
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        fill && 'h-full content-start overflow-hidden',
        className
      )}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className='border-border flex flex-col gap-0 overflow-hidden rounded-xl border shadow-sm'
        >
          <Skeleton
            style={{ aspectRatio: imageAspect }}
            className='w-full rounded-none'
          />
          <div className='flex flex-col gap-1.5 p-2.5'>
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-3 w-1/2' />
          </div>
        </div>
      ))}
    </div>
  )
}
