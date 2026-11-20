import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Base placeholder block. Radius comes from `--skeleton-radius` (theme token,
 * falls back to `rounded-md`) so every skeleton in a host shares one corner.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn(
        'bg-accent animate-pulse rounded-[var(--skeleton-radius,var(--radius-md,0.375rem))] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}

interface SkeletonRowProps extends React.ComponentProps<'div'> {
  /** Leading round avatar/icon placeholder. Default true. */
  avatar?: boolean
  /** Text lines (1-3). Default 2. */
  lines?: 1 | 2 | 3
  /** `lg` = two-line list rows (inbox); default matches notification/menu rows. */
  size?: 'default' | 'lg'
}

const LINE_WIDTHS = ['w-2/5', 'w-4/5', 'w-3/5']

/**
 * One list-row placeholder sized by the skeleton tokens (`--skeleton-row-h`,
 * `--skeleton-avatar`, `--skeleton-line-h`), which shrink under
 * `data-ui-density='compact'`.
 */
function SkeletonRow({
  avatar = true,
  lines = 2,
  size = 'default',
  className,
  style,
  ...props
}: SkeletonRowProps) {
  const rowVar = size === 'lg' ? '--skeleton-row-h-lg' : '--skeleton-row-h'
  const rowFallback = size === 'lg' ? '4.75rem' : '3.25rem'
  return (
    <div
      data-slot='skeleton-row'
      aria-hidden
      className={cn('flex items-center gap-3 px-3.5', className)}
      style={{ height: `var(${rowVar}, ${rowFallback})`, ...style }}
      {...props}
    >
      {avatar && (
        <Skeleton
          className='shrink-0 rounded-full'
          style={{
            width: 'var(--skeleton-avatar, 2.5rem)',
            height: 'var(--skeleton-avatar, 2.5rem)',
          }}
        />
      )}
      <div className='flex flex-1 flex-col gap-2'>
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className={cn(LINE_WIDTHS[i % LINE_WIDTHS.length], i > 0 && 'opacity-70')}
            style={{ height: 'var(--skeleton-line-h, 0.75rem)' }}
          />
        ))}
      </div>
    </div>
  )
}

interface SkeletonListProps extends Omit<SkeletonRowProps, 'children'> {
  rows?: number
  /** Screen-reader text; the list is a polite busy live region. */
  label?: string
}

/** A busy live region holding `rows` SkeletonRow placeholders. */
function SkeletonList({ rows = 4, label, className, ...row }: SkeletonListProps) {
  return (
    <div
      role='status'
      aria-busy='true'
      aria-live='polite'
      data-slot='skeleton-list'
      className={className}
    >
      {label ? <span className='sr-only'>{label}</span> : null}
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} {...row} />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonRow, SkeletonList }
