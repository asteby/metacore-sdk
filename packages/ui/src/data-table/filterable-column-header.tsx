import * as React from 'react'
import { CheckIcon } from '@radix-ui/react-icons'
import { type Column } from '@tanstack/react-table'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { type DateRange } from 'react-day-picker'
import {
  ListFilter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveColorCss } from '@/lib/option-colors'
import { Button } from '@/primitives/button'
import { Label } from '@/primitives/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'
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
}

/**
 * Canonical filter-type union shared by every metacore app that renders a
 * DynamicTable. Kept open for extension — new niches (BI dashboards, CRM,
 * inventory, catalog) can add variants here instead of each forking the type.
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
   * the options into `filterOptions` before they arrive. See DynamicTable.
   */
  | 'dynamic_select'

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
}

type FilterableColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: string
  }

/**
 * Pro column header combining sort + scoped per-column filter UI.
 *
 * Supports `select`, `boolean`, `text`, `number_range`, and `date_range`
 * filter types from `columnDef.meta`. The `date_range` variant renders a
 * compact range calendar (react-day-picker, already a dep of this package) and
 * emits a single `"YYYY-MM-DD_YYYY-MM-DD"` value. The remote
 * `filterSearchEndpoint` lookups are wired by the host (DynamicTable).
 */
export function FilterableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: FilterableColumnHeaderProps<TData, TValue>) {
  const meta = (column.columnDef.meta || {}) as ColumnFilterMeta &
    Record<string, unknown>
  const canSort = column.getCanSort()
  const filterType = meta.filterType || 'select'
  // `select`, `boolean` and `dynamic_select` all render the same multi-value
  // checkbox combobox; only the option source differs (inline vs relation
  // endpoint). Treat them uniformly so a relation filter behaves like a static
  // one once its options have loaded.
  const isMultiSelect =
    filterType === 'select' ||
    filterType === 'boolean' ||
    filterType === 'dynamic_select'
  const hasOptions = meta.filterOptions && meta.filterOptions.length > 0
  const canFilter =
    meta.filterable &&
    (hasOptions ||
      filterType === 'text' ||
      filterType === 'number_range' ||
      filterType === 'date_range' ||
      // A relation filter is still actionable while its options stream in —
      // surface the trigger (the combobox shows a loading/empty state).
      (filterType === 'dynamic_select' && !!meta.filterSearchEndpoint))
  const filterKey = meta.filterKey || column.id
  const selectedValues = new Set(meta.selectedValues || [])
  const activeCount = selectedValues.size

  const rawTextValue =
    meta.selectedValues && meta.selectedValues.length > 0
      ? meta.selectedValues[0]
      : ''
  const displayTextValue = rawTextValue.replace(
    /^(ILIKE|LIKE|GT|LT|GTE|LTE):/,
    ''
  )

  const parseRangeValues = () => {
    let min = ''
    let max = ''
    for (const v of meta.selectedValues || []) {
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
      meta.selectedValues && meta.selectedValues.length > 0
        ? meta.selectedValues[0]
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
      return (meta.selectedValues || []).length > 0 && meta.selectedValues![0] !== ''
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

  const displayOptions = meta.filterOptions || []

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
  }, [meta.selectedValues?.join(',')])
  React.useEffect(() => {
    if (filterOpen) {
      setLocalSelected(new Set(meta.selectedValues || []))
    }
  }, [filterOpen, meta.selectedValues?.join(',')])

  const handleLocalToggle = (value: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleApplySelect = () => {
    meta.onFilterChange?.(filterKey, Array.from(localSelected))
    setFilterOpen(false)
  }

  const handleClearFilter = () => {
    meta.onFilterChange?.(filterKey, [])
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
      meta.onFilterChange?.(filterKey, [`${from}_${to}`])
    }
    setFilterOpen(false)
  }

  const handleTextSubmit = () => {
    const trimmed = localTextValue.trim()
    if (trimmed) {
      meta.onFilterChange?.(filterKey, [`ILIKE:${trimmed}`])
    } else {
      meta.onFilterChange?.(filterKey, [])
    }
  }

  const handleNumberRangeSubmit = () => {
    const values: string[] = []
    if (localMin.trim()) values.push(`GTE:${localMin.trim()}`)
    if (localMax.trim()) values.push(`LTE:${localMax.trim()}`)
    meta.onFilterChange?.(filterKey, values)
  }

  const localHasChanges = (() => {
    if (isMultiSelect) {
      const current = new Set(meta.selectedValues || [])
      if (localSelected.size !== current.size) return true
      for (const v of localSelected) {
        if (!current.has(v)) return true
      }
      return false
    }
    return false
  })()

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <span className='text-sm font-medium'>{title}</span>

      {canSort && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className={cn(
                'h-7 w-7 shrink-0 opacity-70 hover:opacity-100',
                column.getIsSorted() && 'opacity-100'
              )}
            >
              {column.getIsSorted() === 'desc' ? (
                <ArrowDown className='h-3.5 w-3.5' />
              ) : column.getIsSorted() === 'asc' ? (
                <ArrowUp className='h-3.5 w-3.5' />
              ) : (
                <ArrowUpDown className='h-3.5 w-3.5' />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp className='text-muted-foreground/70 size-3.5' />
              Ascendente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown className='text-muted-foreground/70 size-3.5' />
              Descendente
            </DropdownMenuItem>
            {column.getCanHide() && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => column.toggleVisibility(false)}
                >
                  <EyeOff className='text-muted-foreground/70 size-3.5' />
                  Ocultar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canFilter && (
        <Popover modal={false} open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className={cn(
                'h-7 w-7 shrink-0',
                isActive
                  ? 'text-primary hover:text-primary'
                  : 'opacity-70 hover:opacity-100'
              )}
            >
              <div className='relative'>
                <ListFilter className='h-3.5 w-3.5' />
                {isActive && isMultiSelect && activeCount > 0 && (
                  <span className='absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-0.5'>
                    {activeCount}
                  </span>
                )}
                {isActive && !isMultiSelect && (
                  <span className='absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-primary' />
                )}
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className={cn(
              'p-0',
              filterType === 'date_range' ? 'w-auto' : 'w-[220px]'
            )}
            align='start'
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {isMultiSelect && (hasOptions || filterType === 'dynamic_select') && (
                <Command>
                  <CommandInput placeholder='Buscar...' />
                  <CommandList>
                    <CommandEmpty>
                      {meta.filterLoading ? 'Cargando…' : 'Sin resultados.'}
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
                                  ? // Foreground/background is contrast-guaranteed
                                    // in both themes, so the checkmark stays legible
                                    // even when a brand's primary/primary-foreground
                                    // pair collapses to dark-on-dark in dark mode.
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
                                  backgroundColor: resolveColorCss(
                                    option.color
                                  ),
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
      )}
    </div>
  )
}
