import * as React from 'react'
import { cn } from '@/lib/utils'
import { touchMinTargetCss } from './constants'

export interface TouchGridProps extends React.ComponentProps<'div'> {
  /** Fixed column count. Omit to auto-fit columns of `minCellWidth`. */
  columns?: number
  /** Min cell width in px for auto-fit. Defaults to 3x the min target. */
  minCellWidth?: number
  /** Min hit target in px for each cell (height floor). */
  minTarget?: number
  /** Gap in px. */
  gap?: number
}

/**
 * Responsive grid for touch tiles (products, options, categories). Cells get a
 * min height equal to the touch target, so any child button stays hittable.
 */
export const TouchGrid = React.forwardRef<HTMLDivElement, TouchGridProps>(
  function TouchGrid(
    { className, columns, minCellWidth, minTarget, gap = 16, style, children, ...props },
    ref,
  ) {
    const cols =
      columns != null
        ? `repeat(${Math.max(1, Math.floor(columns))}, minmax(0, 1fr))`
        : `repeat(auto-fit, minmax(${minCellWidth ?? (minTarget ?? 60) * 3}px, 1fr))`
    return (
      <div
        ref={ref}
        data-slot='touch-grid'
        className={cn('grid', className)}
        style={{
          gridTemplateColumns: cols,
          gridAutoRows: `minmax(${touchMinTargetCss(minTarget)}, auto)`,
          gap,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    )
  },
)
