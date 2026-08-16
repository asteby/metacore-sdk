import { Skeleton } from '@/primitives/skeleton'
import { cn } from '@/lib/utils'

export type ProductTileSkeletonGridProps = {
  count?: number
  className?: string
}

/** Loading placeholders matching {@link ProductTile} aspect ratio. */
export function ProductTileSkeletonGrid({
  count = 10,
  className,
}: ProductTileSkeletonGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className='border-border flex flex-col gap-0 overflow-hidden rounded-xl border shadow-sm'
        >
          <Skeleton
            style={{ aspectRatio: '4 / 3' }}
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
