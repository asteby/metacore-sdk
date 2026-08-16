import * as React from 'react'
import { cn } from '@/lib/utils'

export type SelectableQueueCardProps = {
  selected?: boolean
  onSelect?: () => void
  children: React.ReactNode
  className?: string
}

/** Dense selectable card for cashier queues / refund lists. */
export function SelectableQueueCard({
  selected,
  onSelect,
  children,
  className,
}: SelectableQueueCardProps) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className={cn(
        'border-border bg-card hover:bg-muted/40 w-full rounded-xl border p-3 text-left transition-colors',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        selected && 'border-primary bg-primary/5 ring-primary/30 ring-1',
        className
      )}
    >
      {children}
    </button>
  )
}
