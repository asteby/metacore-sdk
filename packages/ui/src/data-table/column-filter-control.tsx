import * as React from 'react'
import { CheckIcon } from '@radix-ui/react-icons'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { type DateRange } from 'react-day-picker'
import { ListFilter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveColorCss } from '@/lib/option-colors'
import { Button } from '@/primitives/button'
import { Label } from '@/primitives/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/primitives/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/primitives/command'
import { Input } from '@/primitives/input'
import { Calendar } from '@/primitives/calendar'

export interface FilterOption {
  label: string
  value: string
  icon?: string
  color?: string
  /**
   * Optional occurrence count for this value across the (server-side) dataset.
   * Set by `facet` filters (see the `/facets` endpoint) and rendered muted +
   * right-aligned in the option row. Absent for inline/relation options.
   */
  count?: number
}

/**
 * Canonical filter-type union shared by every metacore app that renders a
 * DynamicTable or DynamicKanban. Kept open for extension — new niches (BI
 * dashboards, CRM, inventory, catalog) can add variants here instead of each
 * forking the type.
 */
export type ColumnFilterType =
  | 'select'
  | 'boolean'
  | 'text'
  | 'number_range'
  | 'date_range'
  /**
   * Like `select` but the options are resolved server-side from a relation
   * (`filterSearchEndpoint = /options/<ref>`) rather than declared inline.
   * Renders the same multi-value checkbox combobox; the host loads + caches
   * the options into `filterOptions` before they arrive.
   */
  | 'dynamic_select'
  /**
   * A free-text column upgraded to a value picker: instead of a bare
   * "Contiene..." box, it lazily loads the distinct values of the column
   * (with occurrence counts) from a `/facets` endpoint via `loadOptions` when
   * the popover opens, and renders them as a multi-select combobox. Always
   * degrades gracefully: if `loadOptions` is missing / fails / returns nothing
   * it falls back to the plain "Contiene..." text input, and even when options
   * exist it keeps a "Contiene texto…" affordance that emits an `ILIKE:` match.
   * Selected values serialize as equality/`IN:` just like `select`.
   */
  | 'facet'

export interface ColumnFilterMeta {
  filterable?: boolean
  filterType?: ColumnFilterType
  filterKey?: string
  filterOptions?: FilterOption[]
  filterLoading?: boolean
  /**
   * Async search endpoint for server-driven option lookups. When set, the
   * filter renders a searchable combobox backed by the app's API instead of
   * iterating an in-memory filterOptions array. Apps wire this through the
   * standard `/api/options/:model?field=` shape produced by
   * kernel/dynamic.Service.Options.
   */
  filterSearchEndpoint?: string
  selectedValues?: string[]
  onFilterChange?: (filterKey: string, values: string[]) => void
  /**
   * Lazy option loader for `facet` filters. Called with the current search
   * term when the popover opens (and on debounced typing). Resolving to a
   * non-empty array renders the value picker; resolving empty / rejecting
   * degrades the filter to the plain "Contiene..." text input.
   */
  loadOptions?: (q?: string) => Promise<FilterOption[]>
}

export interface ColumnFilterControlProps {
  /** Backend filter key (`f_<filterKey>=…`). */
  filterKey: string
  filterType?: ColumnFilterType
  filterOptions?: FilterOption[]
  filterLoading?: boolean
  filterSearchEndpoint?: string
  selectedValues?: string[]
  onFilterChange?: (filterKey: string, values: string[]) => void
  /** Lazy option loader for `facet` filters (see ColumnFilterMeta.loadOptions). */
  loadOptions?: (q?: string) => Promise<FilterOption[]>
  /**
   * Field label. Rendered inside the trigger in toolbar mode (`showLabel`), so a
   * board/toolbar surface — which has no column headers — still names each
   * filter. Ignored in the icon-only header mode.
   */
  label?: string
  /**
   * Toolbar mode: render a labeled chip trigger (`<ListFilter/> Label (n)`)
   * instead of the icon-only header button. Use on the kanban filter bar.
   */
  showLabel?: boolean
  align?: React.ComponentProps<typeof PopoverContent>['align']
  /** Extra classes on the trigger button. */
  className?: string
}

/**
 * The per-column filter popover — extracted from `FilterableColumnHeader` so it
 * can be reused OUTSIDE a TanStack table header (e.g. the DynamicKanban filter
 * bar). Fully driven by plain props; no `Column` dependency. Supports `select`,
 * `boolean`, `dynamic_select`, `text`, `number_range` and `date_range`, emitting
 * the same wire values the backend `f_<key>` filters expect
 * (`ILIKE:`/`GTE:`/`LTE:`/`YYYY-MM-DD_YYYY-MM-DD`/plain).
 */
export function ColumnFilterControl({
  filterKey,
  filterType = 'select',
  filterOptions,
  filterLoading,
  filterSearchEndpoint,
  selectedValues: selectedValuesProp,
  onFilterChange,
  loadOptions,
  label,
  showLabel = false,
  align = 'start',
  className,
}: ColumnFilterControlProps) {
  // `select`, `boolean` and `dynamic_select` all render the same multi-value
  // checkbox combobox; only the option source differs (inline vs relation
  // endpoint). Treat them uniformly so a relation filter behaves like a static
  // one once its options have loaded.
  const isMultiSelect =
    filterType === 'select' ||
    filterType === 'boolean' ||
    filterType === 'dynamic_select'
  const isFacet = filterType === 'facet'
  const hasOptions = !!filterOptions && filterOptions.length > 0
  const selectedValues = new Set(selectedValuesProp || [])
  const activeCount = selectedValues.size

  const rawTextValue =
    selectedValuesProp && selectedValuesProp.length > 0
      ? selectedValuesProp[0]
      : ''
  const displayTextValue = rawTextValue.replace(
    /^(ILIKE|LIKE|GT|LT|GTE|LTE):/,
    ''
  )

  const parseRangeValues = () => {
    let min = ''
    let max = ''
    for (const v of selectedValuesProp || []) {
      if (v.startsWith('GTE:')) min = v.replace('GTE:', '')
      if (v.startsWith('LTE:')) max = v.replace('LTE:', '')
    }
    return { min, max }
  }
  const rangeValues = parseRangeValues()

  // Date range is serialized as a single "YYYY-MM-DD_YYYY-MM-DD" value (same
  // wire shape the backend expects from the legacy starter-core picker).
  const parseDateRange = (): DateRange | undefined => {
    const val =
      selectedValuesProp && selectedValuesProp.length > 0
        ? selectedValuesProp[0]
        : ''
    if (!val || !val.includes('_')) return undefined
    const [from, to] = val.split('_')
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(`${to}T00:00:00`)
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return undefined
    return { from: fromDate, to: toDate }
  }

  const isActive = (() => {
    if (filterType === 'text') return rawTextValue !== ''
    if (filterType === 'number_range')
      return rangeValues.min !== '' || rangeValues.max !== ''
    if (filterType === 'date_range')
      return (
        (selectedValuesProp || []).length > 0 && selectedValuesProp![0] !== ''
      )
    return activeCount > 0
  })()

  const [localTextValue, setLocalTextValue] = React.useState(displayTextValue)
  const [localMin, setLocalMin] = React.useState(rangeValues.min)
  const [localMax, setLocalMax] = React.useState(rangeValues.max)
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(
    new Set(selectedValues)
  )
  const [localDateRange, setLocalDateRange] = React.useState<
    DateRange | undefined
  >(parseDateRange())
  const [filterOpen, setFilterOpen] = React.useState(false)

  const displayOptions = filterOptions || []
  const selectedKey = (selectedValuesProp || []).join(',')

  React.useEffect(() => {
    setLocalTextValue(displayTextValue)
  }, [displayTextValue])
  React.useEffect(() => {
    setLocalMin(rangeValues.min)
    setLocalMax(rangeValues.max)
  }, [rangeValues.min, rangeValues.max])
  React.useEffect(() => {
    setLocalDateRange(parseDateRange())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])
  React.useEffect(() => {
    if (filterOpen) {
      setLocalSelected(new Set(selectedValuesProp || []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOpen, selectedKey])

  const canFilter =
    hasOptions ||
    filterType === 'text' ||
    filterType === 'number_range' ||
    filterType === 'date_range' ||
    // A facet is always actionable: worst case it degrades to a text "Contiene"
    // box, so it never renders a dead trigger.
    isFacet ||
    // A relation filter is still actionable while its options stream in —
    // surface the trigger (the combobox shows a loading/empty state).
    (filterType === 'dynamic_select' && !!filterSearchEndpoint)
  if (!canFilter) return null

  const handleLocalToggle = (value: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleApplySelect = () => {
    onFilterChange?.(filterKey, Array.from(localSelected))
    setFilterOpen(false)
  }

  const handleClearFilter = () => {
    onFilterChange?.(filterKey, [])
    setLocalTextValue('')
    setLocalMin('')
    setLocalMax('')
    setLocalSelected(new Set())
    setLocalDateRange(undefined)
  }

  const handleDateRangeApply = () => {
    if (localDateRange?.from) {
      const from = format(localDateRange.from, 'yyyy-MM-dd')
      const to = localDateRange.to
        ? format(localDateRange.to, 'yyyy-MM-dd')
        : from
      onFilterChange?.(filterKey, [`${from}_${to}`])
    }
    setFilterOpen(false)
  }

  const handleTextSubmit = () => {
    const trimmed = localTextValue.trim()
    if (trimmed) {
      onFilterChange?.(filterKey, [`ILIKE:${trimmed}`])
    } else {
      onFilterChange?.(filterKey, [])
    }
  }

  const handleNumberRangeSubmit = () => {
    const values: string[] = []
    if (localMin.trim()) values.push(`GTE:${localMin.trim()}`)
    if (localMax.trim()) values.push(`LTE:${localMax.trim()}`)
    onFilterChange?.(filterKey, values)
  }

  const localHasChanges = (() => {
    if (isMultiSelect) {
      const current = new Set(selectedValuesProp || [])
      if (localSelected.size !== current.size) return true
      for (const v of localSelected) {
        if (!current.has(v)) return true
      }
      return false
    }
    return false
  })()

  const trigger = showLabel ? (
    <Button
      variant='outline'
      size='sm'
      className={cn(
        'h-8 gap-1.5 text-xs',
        isActive && 'border-primary/60 text-primary',
        className
      )}
    >
      <ListFilter className='h-3.5 w-3.5' />
      {label || filterKey}
      {isActive && (isMultiSelect || isFacet) && activeCount > 0 && (
        <span className='ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground'>
          {activeCount}
        </span>
      )}
      {isActive && !isMultiSelect && !isFacet && (
        <span className='ml-0.5 h-1.5 w-1.5 rounded-full bg-primary' />
      )}
    </Button>
  ) : (
    <Button
      variant='ghost'
      size='icon'
      className={cn(
        'h-7 w-7 shrink-0',
        isActive
          ? 'text-primary hover:text-primary'
          : 'opacity-70 hover:opacity-100',
        className
      )}
    >
      <div className='relative'>
        <ListFilter className='h-3.5 w-3.5' />
        {isActive && (isMultiSelect || isFacet) && activeCount > 0 && (
          <span className='absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-0.5'>
            {activeCount}
          </span>
        )}
        {isActive && !isMultiSelect && !isFacet && (
          <span className='absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-primary' />
        )}
      </div>
    </Button>
  )

  return (
    <Popover modal={false} open={filterOpen} onOpenChange={setFilterOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0',
          filterType === 'date_range'
            ? 'w-auto'
            : isFacet
              ? 'w-[248px]'
              : 'w-[220px]'
        )}
        align={align}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {isMultiSelect && (hasOptions || filterType === 'dynamic_select') && (
          <Command>
            <CommandInput placeholder='Buscar...' />
            <CommandList>
              <CommandEmpty>
                {filterLoading ? 'Cargando…' : 'Sin resultados.'}
              </CommandEmpty>
              <CommandGroup>
                {displayOptions.map((option) => {
                  const isSelected = localSelected.has(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => handleLocalToggle(option.value)}
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <div
                        className={cn(
                          'mr-2 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                          isSelected
                            ? // Foreground/background is contrast-guaranteed in
                              // both themes, so the checkmark stays legible even
                              // when a brand's primary/primary-foreground pair
                              // collapses to dark-on-dark in dark mode.
                              'border-foreground bg-foreground text-background'
                            : 'border-muted-foreground/50 opacity-70 [&_svg]:invisible'
                        )}
                      >
                        <CheckIcon className='h-3.5 w-3.5' />
                      </div>
                      {option.color && (
                        <span
                          className='mr-1 size-2.5 rounded-full shrink-0'
                          style={{
                            backgroundColor: resolveColorCss(option.color),
                          }}
                        />
                      )}
                      <span className='truncate'>{option.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
            <div className='border-t p-2 flex gap-1.5'>
              <Button
                size='sm'
                variant='outline'
                className='h-7 flex-1 text-xs'
                onClick={() => {
                  handleClearFilter()
                  setFilterOpen(false)
                }}
                disabled={!isActive && localSelected.size === 0}
              >
                Limpiar
              </Button>
              <Button
                size='sm'
                className='h-7 flex-1 text-xs'
                onClick={handleApplySelect}
                disabled={!localHasChanges && localSelected.size === 0}
              >
                Aplicar
                {localSelected.size > 0 ? ` (${localSelected.size})` : ''}
              </Button>
            </div>
          </Command>
        )}

        {isFacet && (
          <FacetFilterBody
            filterKey={filterKey}
            selectedValues={selectedValuesProp || []}
            loadOptions={loadOptions}
            staticOptions={filterOptions}
            onFilterChange={onFilterChange}
            onClose={() => setFilterOpen(false)}
          />
        )}

        {filterType === 'text' && (
          <div className='p-2.5 space-y-2'>
            <Input
              placeholder='Contiene...'
              value={localTextValue}
              onChange={(e) => setLocalTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit()
              }}
              className='h-8 text-sm'
              autoFocus
            />
            <div className='flex gap-1.5'>
              <Button
                size='sm'
                variant='outline'
                className='h-7 flex-1 text-xs'
                onClick={handleClearFilter}
                disabled={!isActive}
              >
                Limpiar
              </Button>
              <Button
                size='sm'
                className='h-7 flex-1 text-xs'
                onClick={handleTextSubmit}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}

        {filterType === 'number_range' && (
          <div className='p-2.5 space-y-2.5'>
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <Label className='text-xs text-muted-foreground'>Min</Label>
                <Input
                  type='number'
                  placeholder='0'
                  value={localMin}
                  onChange={(e) => setLocalMin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNumberRangeSubmit()
                  }}
                  className='h-8 text-sm'
                  autoFocus
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs text-muted-foreground'>Max</Label>
                <Input
                  type='number'
                  placeholder='999999'
                  value={localMax}
                  onChange={(e) => setLocalMax(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNumberRangeSubmit()
                  }}
                  className='h-8 text-sm'
                />
              </div>
            </div>
            <div className='flex gap-1.5'>
              <Button
                size='sm'
                variant='outline'
                className='h-7 flex-1 text-xs'
                onClick={handleClearFilter}
                disabled={!isActive}
              >
                Limpiar
              </Button>
              <Button
                size='sm'
                className='h-7 flex-1 text-xs'
                onClick={handleNumberRangeSubmit}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}

        {filterType === 'date_range' && (
          <div>
            <Calendar
              mode='range'
              selected={localDateRange}
              onSelect={setLocalDateRange}
              locale={es}
              numberOfMonths={1}
              className='p-2'
            />
            {localDateRange?.from && (
              <div className='px-2 pb-1 text-center text-[11px] text-muted-foreground'>
                {format(localDateRange.from, 'dd MMM yyyy', { locale: es })}
                {localDateRange.to &&
                localDateRange.to.getTime() !== localDateRange.from.getTime()
                  ? ` — ${format(localDateRange.to, 'dd MMM yyyy', { locale: es })}`
                  : ' (un día)'}
              </div>
            )}
            <div className='border-t p-1.5 flex gap-1.5'>
              <Button
                size='sm'
                variant='outline'
                className='h-7 flex-1 text-xs'
                onClick={() => {
                  handleClearFilter()
                  setFilterOpen(false)
                }}
                disabled={!isActive && !localDateRange}
              >
                Limpiar
              </Button>
              <Button
                size='sm'
                className='h-7 flex-1 text-xs'
                onClick={handleDateRangeApply}
                disabled={!localDateRange?.from}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Facet filter body — a text column upgraded to a value picker.
// ---------------------------------------------------------------------------

const ILIKE_PREFIX = 'ILIKE:'

interface FacetFilterBodyProps {
  filterKey: string
  selectedValues: string[]
  loadOptions?: (q?: string) => Promise<FilterOption[]>
  /** Options already available synchronously (rare — usually facets are lazy). */
  staticOptions?: FilterOption[]
  onFilterChange?: (filterKey: string, values: string[]) => void
  onClose: () => void
}

/**
 * Lazy value picker for `facet` filters. Loads the column's distinct values +
 * counts when it mounts (the popover just opened), lets the user multi-select
 * them (emitted as equality/`IN:`), and always keeps a free-text "Contiene…"
 * affordance that emits an `ILIKE:` match. Degrades to a bare text input when
 * `loadOptions` is missing, rejects, or returns nothing — so a facet is never a
 * dead end. Its own hooks live here (not in the parent) so they only run while
 * the popover is open.
 */
function FacetFilterBody({
  filterKey,
  selectedValues,
  loadOptions,
  staticOptions,
  onFilterChange,
  onClose,
}: FacetFilterBodyProps) {
  // A single `ILIKE:` value means the field is in free-text mode; anything else
  // is a set of picked facet values.
  const seededFree =
    selectedValues.length === 1 && selectedValues[0].startsWith(ILIKE_PREFIX)
      ? selectedValues[0].slice(ILIKE_PREFIX.length)
      : ''

  const [query, setQuery] = React.useState('')
  const [options, setOptions] = React.useState<FilterOption[]>(
    staticOptions ?? []
  )
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(
    () => new Set(seededFree ? [] : selectedValues)
  )
  const [freeText, setFreeText] = React.useState(seededFree)

  // Load (and reload on debounced typing). No loader → straight to degraded
  // text mode.
  React.useEffect(() => {
    if (!loadOptions) {
      setLoaded(true)
      return
    }
    let cancelled = false
    const handle = setTimeout(() => {
      setLoading(true)
      loadOptions(query.trim() || undefined)
        .then((opts) => {
          if (cancelled) return
          setOptions(Array.isArray(opts) ? opts : [])
        })
        .catch(() => {
          if (!cancelled) setOptions([])
        })
        .finally(() => {
          if (cancelled) return
          setLoading(false)
          setLoaded(true)
        })
    }, query ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const hasOptions = options.length > 0
  // Degraded: the loader settled with nothing (or there is no loader) → the
  // field behaves like the classic "Contiene..." text filter.
  const degraded = loaded && !loading && !hasOptions && query.trim() === ''

  const toggle = (value: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    // Picking a value and typing free text are mutually exclusive on the wire
    // (a single `f_<key>` can't be both `IN:` and `ILIKE:`), so a pick clears
    // any pending free text.
    setFreeText('')
  }

  const apply = () => {
    const trimmed = freeText.trim()
    if (trimmed) {
      onFilterChange?.(filterKey, [`${ILIKE_PREFIX}${trimmed}`])
    } else {
      onFilterChange?.(filterKey, Array.from(localSelected))
    }
    onClose()
  }

  const clear = () => {
    onFilterChange?.(filterKey, [])
    setLocalSelected(new Set())
    setFreeText('')
    onClose()
  }

  const canApply = localSelected.size > 0 || freeText.trim() !== ''

  // Degraded → just the text box (the original "Contiene..." experience).
  if (degraded) {
    return (
      <div className='p-2.5 space-y-2'>
        <Input
          placeholder='Contiene...'
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
          className='h-8 text-sm'
          autoFocus
        />
        <div className='flex gap-1.5'>
          <Button
            size='sm'
            variant='outline'
            className='h-7 flex-1 text-xs'
            onClick={clear}
            disabled={selectedValues.length === 0 && freeText === ''}
          >
            Limpiar
          </Button>
          <Button
            size='sm'
            className='h-7 flex-1 text-xs'
            onClick={apply}
          >
            Aplicar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder='Buscar valores...'
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? 'Cargando…' : 'Sin resultados.'}
        </CommandEmpty>
        {hasOptions && (
          <CommandGroup>
            {options.map((option) => {
              const isSelected = localSelected.has(option.value)
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => toggle(option.value)}
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
        )}
      </CommandList>
      {/* Free-text affordance: even with facet options present, a user can fall
          back to a raw "contains" match. */}
      <div className='border-t p-2 space-y-2'>
        <Input
          placeholder='Contiene texto…'
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
          className='h-7 text-xs'
        />
        <div className='flex gap-1.5'>
          <Button
            size='sm'
            variant='outline'
            className='h-7 flex-1 text-xs'
            onClick={clear}
            disabled={selectedValues.length === 0 && !canApply}
          >
            Limpiar
          </Button>
          <Button
            size='sm'
            className='h-7 flex-1 text-xs'
            onClick={apply}
            disabled={!canApply}
          >
            Aplicar
            {localSelected.size > 0 ? ` (${localSelected.size})` : ''}
          </Button>
        </div>
      </div>
    </Command>
  )
}
