import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SegmentedControlItem<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** Hide the text and keep it as the accessible name (icon-only segment). */
  iconOnly?: boolean
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string>
  extends Omit<React.ComponentProps<'div'>, 'onChange' | 'defaultValue'> {
  items: ReadonlyArray<SegmentedControlItem<T>>
  value: T
  onValueChange: (value: T) => void
  /** Accessible name of the group, e.g. «Vista». */
  'aria-label': string
  size?: 'sm' | 'default'
}

/**
 * Exclusive choice between a few views or modes (list/kanban, día/semana). A
 * `radiogroup` of buttons: arrow keys move and select, Home/End jump, only the
 * selected segment is in the tab order. Selected state is shown by fill AND
 * `aria-checked`, never by color alone. Theme tokens only.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  size = 'default',
  className,
  ...props
}: SegmentedControlProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0)

  const move = (from: number, delta: number | 'first' | 'last') => {
    if (enabled.length === 0) return
    const pos = enabled.indexOf(from)
    const nextPos =
      delta === 'first' ? 0 : delta === 'last' ? enabled.length - 1 : (pos + delta + enabled.length) % enabled.length
    const next = enabled[nextPos]
    refs.current[next]?.focus()
    onValueChange(items[next].value)
  }

  const onKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    }
    const delta = keys[e.key]
    if (delta === undefined) return
    e.preventDefault()
    move(i, delta)
  }

  return (
    <div
      role='radiogroup'
      data-slot='segmented-control'
      className={cn('bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5', className)}
      {...props}
    >
      {items.map((it, i) => {
        const selected = it.value === value
        const Icon = it.icon
        return (
          <button
            key={it.value}
            ref={el => {
              refs.current[i] = el
            }}
            type='button'
            role='radio'
            aria-checked={selected}
            aria-label={it.iconOnly ? it.label : undefined}
            title={it.iconOnly ? it.label : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={it.disabled}
            data-state={selected ? 'on' : 'off'}
            onClick={() => onValueChange(it.value)}
            onKeyDown={onKeyDown(i)}
            className={cn(
              'focus-visible:ring-ring inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon aria-hidden='true' className='size-4' />}
            {!it.iconOnly && it.label}
          </button>
        )
      })}
    </div>
  )
}
