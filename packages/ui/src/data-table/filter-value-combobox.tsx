import * as React from 'react'
import { CheckIcon } from '@radix-ui/react-icons'
import { cn } from '@/lib/utils'
import { resolveColorCss } from '@/lib/option-colors'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/primitives/command'
import type { FilterOption } from './column-filter-control'

export interface FilterValueComboboxProps {
  /** Inline options (static / already-loaded select values). */
  staticOptions?: FilterOption[]
  /**
   * Lazy loader (facet columns). Called with the search term when the combobox
   * mounts and on debounced typing. When set, options stream in server-side and
   * cmdk's client filter is disabled.
   */
  loadOptions?: (q?: string) => Promise<FilterOption[]>
  /** Currently-selected values (multi-select). */
  selected: string[]
  /** Toggle a value in/out of the selection. */
  onToggle: (value: string) => void
  searchPlaceholder?: string
  loadingLabel?: string
  emptyLabel?: string
  className?: string
}

/**
 * The multi-value checkbox combobox shared by every filter surface: the facet
 * popover in `ColumnFilterControl` and the kanban lane funnel. Renders a search
 * box, a checkbox + color dot + right-aligned count per option, and lazy-loads
 * from `loadOptions` when given (otherwise filters `staticOptions` client-side).
 * Purely a value picker — the caller owns any Apply/Clear affordance.
 */
export function FilterValueCombobox({
  staticOptions,
  loadOptions,
  selected,
  onToggle,
  searchPlaceholder = 'Buscar valores...',
  loadingLabel = 'Cargando…',
  emptyLabel = 'Sin resultados.',
  className,
}: FilterValueComboboxProps) {
  const [query, setQuery] = React.useState('')
  const [options, setOptions] = React.useState<FilterOption[]>(
    staticOptions ?? []
  )
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!loadOptions) {
      setOptions(staticOptions ?? [])
      return
    }
    let cancelled = false
    const handle = setTimeout(
      () => {
        setLoading(true)
        loadOptions(query.trim() || undefined)
          .then((opts) => {
            if (!cancelled) setOptions(Array.isArray(opts) ? opts : [])
          })
          .catch(() => {
            if (!cancelled) setOptions([])
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      query ? 250 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, loadOptions])

  const selectedSet = new Set(selected)

  return (
    <Command shouldFilter={!loadOptions} className={className}>
      <CommandInput
        placeholder={searchPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{loading ? loadingLabel : emptyLabel}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selectedSet.has(option.value)
            return (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => onToggle(option.value)}
                onPointerDown={(e) => e.preventDefault()}
              >
                <div
                  className={cn(
                    'mr-2 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                    isSelected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-muted-foreground/50 opacity-70 [&_svg]:invisible'
                  )}
                >
                  <CheckIcon className='h-3.5 w-3.5' />
                </div>
                {option.color && (
                  <span
                    className='mr-1 size-2.5 rounded-full shrink-0'
                    style={{ backgroundColor: resolveColorCss(option.color) }}
                  />
                )}
                <span className='truncate'>{option.label}</span>
                {typeof option.count === 'number' && (
                  <span className='ml-auto pl-2 text-xs tabular-nums text-muted-foreground'>
                    {option.count}
                  </span>
                )}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
