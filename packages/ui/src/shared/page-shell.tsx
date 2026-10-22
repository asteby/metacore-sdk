import * as React from 'react'
import { cn } from '../lib/utils'

const WIDTHS = {
  narrow: 'max-w-3xl',
  default: 'max-w-7xl',
  wide: 'max-w-[96rem]',
  full: 'max-w-none',
} as const

export interface PageShellProps extends React.ComponentProps<'div'> {
  /** Max content width. Default `default` (80rem). */
  width?: keyof typeof WIDTHS
  /** Usually a `<PageHeader />`; rendered first. */
  header?: React.ReactNode
}

/**
 * Page container with the single gutter (`px-4` → `sm:px-6` → `lg:px-8`),
 * `min-w-0` so wide children cannot push the page sideways, a bottom
 * safe-area inset, and a `@container/page` for container queries.
 */
export function PageShell({ width = 'default', header, className, children, ...props }: PageShellProps) {
  return (
    <div
      data-slot='page-shell'
      className={cn(
        '@container/page mx-auto flex w-full min-w-0 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:gap-6 sm:px-6 sm:pt-6 lg:px-8',
        WIDTHS[width],
        className,
      )}
      {...props}
    >
      {header}
      {children}
    </div>
  )
}
