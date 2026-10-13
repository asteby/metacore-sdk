import * as React from 'react'
import { cn } from '@/lib/utils'
import { TabsList, TabsTrigger } from '../primitives/tabs'

/**
 * Horizontally scrollable pill tabs that stick to the top of their scroll
 * container with a blurred backdrop. Use inside `<Tabs>`; pair with
 * `PillTabsTrigger` (icon + text stay visible on phones).
 */
export function PillTabsList({ className, children, ...props }: React.ComponentProps<typeof TabsList>) {
  return (
    <div
      data-slot='pill-tabs'
      className='bg-background/80 sticky top-0 z-10 -mx-4 border-b px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-2'
    >
      <TabsList
        className={cn(
          'h-auto w-full min-w-0 justify-start gap-1 overflow-x-auto bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className
        )}
        {...props}
      >
        {children}
      </TabsList>
    </div>
  )
}

export interface PillTabsTriggerProps extends React.ComponentProps<typeof TabsTrigger> {
  /**
   * Optional counter shown after the label (filter tabs: «Abiertas 12»). It is
   * part of the accessible name; `undefined` hides it, `0` shows it.
   */
  count?: number
  /** Formats the counter (e.g. compact or locale-aware). Default `String`. */
  formatCount?: (n: number) => string
}

export function PillTabsTrigger({ className, count, formatCount = String, children, ...props }: PillTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-10 flex-none gap-1.5 rounded-full px-3.5 data-[state=active]:shadow-none',
        className
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          data-slot='pill-tabs-count'
          className='bg-foreground/10 rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums'
        >
          {formatCount(count)}
        </span>
      )}
    </TabsTrigger>
  )
}
