import * as React from 'react'
import { api } from '@/lib/api'
import { CheckIcon } from '@radix-ui/react-icons'
import { type Column } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { resolveColorCss } from '@/lib/option-colors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ListFilter, ArrowUpDown, ArrowUp, ArrowDown, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'

export interface FilterOption {
  label: string
  value: string
  icon?: string
  color?: string
}

export interface ColumnFilterMeta {
  filterable?: boolean
  filterType?: 'select' | 'boolean' | 'text' | 'number_range' | 'date_range'
  filterKey?: string
  filterOptions?: FilterOption[]
  filterLoading?: boolean
  filterSearchEndpoint?: string  // enables server-side search for large option sets
  selectedValues?: string[]
  onFilterChange?: (filterKey: string, values: string[]) => void
}

type FilterableColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: string
  }

export function FilterableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: FilterableColumnHeaderProps<TData, TValue>) {
  const meta = (column.columnDef.meta || {}) as ColumnFilterMeta & Record<string, unknown>
  const canSort = column.getCanSort()
  const filterType = meta.filterType || 'select'
  const hasOptions = meta.filterOptions && meta.filterOptions.length > 0
  const canFilter = meta.filterable && (
    hasOptions ||
    filterType === 'text' ||
    filterType === 'number_range' ||
    filterType === 'date_range'
  )
  const filterKey = meta.filterKey || column.id
  const selectedValues = new Set(meta.selectedValues || [])
  const activeCount = selectedValues.size

  // For text filters, strip operator prefix for display
  const rawTextValue = (meta.selectedValues && meta.selectedValues.length > 0) ? meta.selectedValues[0] : ''
  const displayTextValue = rawTextValue.replace(/^(ILIKE|LIKE|GT|LT|GTE|LTE):/, '')

  // For number range: parse min/max from selectedValues ["GTE:100", "LTE:500"]
  const parseRangeValues = () => {
    let min = '', max = ''
    for (const v of (meta.selectedValues || [])) {
      if (v.startsWith('GTE:')) min = v.replace('GTE:', '')
      if (v.startsWith('LTE:')) max = v.replace('LTE:', '')
    }
    return { min, max }
  }
  const rangeValues = parseRangeValues()

  // For date range: parse from selectedValues (stored as "YYYY-MM-DD_YYYY-MM-DD")
  const parseDateRange = (): DateRange | undefined => {
    const val = (meta.selectedValues && meta.selectedValues.length > 0) ? meta.selectedValues[0] : ''
    if (!val || !val.includes('_')) return undefined
    const [from, to] = val.split('_')
    const fromDate = new Date(from + 'T00:00:00')
    const toDate = new Date(to + 'T00:00:00')
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return undefined
    return { from: fromDate, to: toDate }
  }

  const isActive = (() => {
    if (filterType === 'text') return rawTextValue !== ''
    if (filterType === 'number_range') return rangeValues.min !== '' || rangeValues.max !== ''
    if (filterType === 'date_range') return (meta.selectedValues || []).length > 0 && meta.selectedValues![0] !== ''
    return activeCount > 0
  })()

  // Local state for inputs
  const [localTextValue, setLocalTextValue] = React.useState(displayTextValue)
  const [localMin, setLocalMin] = React.useState(rangeValues.min)
  const [localMax, setLocalMax] = React.useState(rangeValues.max)
  const [localDateRange, setLocalDateRange] = React.useState<DateRange | undefined>(parseDateRange())
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(new Set(selectedValues))
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [remoteOptions, setRemoteOptions] = React.useState<FilterOption[]>([])
  const [remoteLoading, setRemoteLoading] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(false)
  const pageRef = React.useRef(0)
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const searchEndpoint = meta.filterSearchEndpoint
  const PAGE_SIZE = 50

  const fetchOptions = React.useCallback(async (q: string, page: number, replace: boolean) => {
    if (!searchEndpoint) return
    try {
      setRemoteLoading(true)
      const offset = page * PAGE_SIZE
      const sep = searchEndpoint.includes('?') ? '&' : '?'
      let url = `${searchEndpoint}${sep}limit=${PAGE_SIZE}&offset=${offset}`
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`
      const res = await api.get(url)
      const json = res.data
      if (json.success && Array.isArray(json.data)) {
        const mapped: FilterOption[] = json.data.map((item: any) => ({
          label: item.label || item.name || '',
          value: String(item.value ?? item.id ?? ''),
          icon: item.icon,
          color: item.color || item.class,
        }))
        setRemoteOptions(prev => replace ? mapped : [...prev, ...mapped])
        setHasMore(json.data.length === PAGE_SIZE)
      }
    } catch {
      // silently fall back
    } finally {
      setRemoteLoading(false)
    }
  }, [searchEndpoint])

  // Initial load when popover opens
  React.useEffect(() => {
    if (!filterOpen || !searchEndpoint) return
    pageRef.current = 0
    fetchOptions('', 0, true)
  }, [filterOpen, searchEndpoint])

  // Debounced search
  React.useEffect(() => {
    if (!searchEndpoint || !filterOpen) return
    const timer = setTimeout(() => {
      pageRef.current = 0
      fetchOptions(searchQuery, 0, true)
    }, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [searchQuery, searchEndpoint, filterOpen])

  // Infinite scroll sentinel
  React.useEffect(() => {
    if (!sentinelRef.current || !hasMore || !searchEndpoint) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !remoteLoading) {
        pageRef.current += 1
        fetchOptions(searchQuery, pageRef.current, false)
      }
    }, { threshold: 0.1 })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, remoteLoading, searchQuery, searchEndpoint, fetchOptions])

  // Reset when popover closes
  React.useEffect(() => {
    if (!filterOpen) { setSearchQuery(''); setRemoteOptions([]); setHasMore(false) }
  }, [filterOpen])

  const displayOptions = searchEndpoint ? remoteOptions : (meta.filterOptions || [])

  React.useEffect(() => { setLocalTextValue(displayTextValue) }, [displayTextValue])
  React.useEffect(() => { setLocalMin(rangeValues.min); setLocalMax(rangeValues.max) }, [rangeValues.min, rangeValues.max])
  React.useEffect(() => { setLocalDateRange(parseDateRange()) }, [meta.selectedValues?.join(',')])
  // Sync local selection when popover opens or external values change
  React.useEffect(() => {
    if (filterOpen) {
      setLocalSelected(new Set(meta.selectedValues || []))
    }
  }, [filterOpen, meta.selectedValues?.join(',')])

  // Handlers
  const handleLocalToggle = (value: string) => {
    setLocalSelected(prev => {
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
    setLocalDateRange(undefined)
    setLocalSelected(new Set())
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

  const handleDateRangeApply = () => {
    if (localDateRange?.from) {
      const from = format(localDateRange.from, 'yyyy-MM-dd')
      const to = localDateRange.to ? format(localDateRange.to, 'yyyy-MM-dd') : from
      // Single day: same from and to
      meta.onFilterChange?.(filterKey, [`${from}_${to}`])
    }
    setFilterOpen(false)
  }

  const localHasChanges = (() => {
    if (filterType === 'select' || filterType === 'boolean') {
      const current = new Set(meta.selectedValues || [])
      if (localSelected.size !== current.size) return true
      for (const v of localSelected) { if (!current.has(v)) return true }
      return false
    }
    return false
  })()

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {/* Title label */}
      <span className="text-sm font-medium">{title}</span>

      {/* Sort control */}
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
                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                  <EyeOff className='text-muted-foreground/70 size-3.5' />
                  Ocultar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Filter control */}
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
              <div className="relative">
                <ListFilter className='h-3.5 w-3.5' />
                {isActive && (filterType === 'select' || filterType === 'boolean') && activeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground px-0.5">
                    {activeCount}
                  </span>
                )}
                {isActive && filterType !== 'select' && filterType !== 'boolean' && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-primary" />
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
            {/* ── Select / Boolean: checkbox list with Apply button ── */}
            {(filterType === 'select' || filterType === 'boolean') && (hasOptions || searchEndpoint) && (
              <Command shouldFilter={!searchEndpoint}>
                <CommandInput
                  placeholder='Buscar...'
                  value={searchQuery}
                  onValueChange={searchEndpoint ? setSearchQuery : undefined}
                />
                <CommandList>
                  <CommandEmpty>{remoteLoading ? 'Buscando...' : 'Sin resultados.'}</CommandEmpty>
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
                              'border-primary mr-2 flex size-4 shrink-0 items-center justify-center rounded-sm border',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <CheckIcon className='h-3.5 w-3.5' />
                          </div>
                          {option.color && (
                            <span
                              className="mr-1 size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: resolveColorCss(option.color) }}
                            />
                          )}
                          <span className="truncate">{option.label}</span>
                        </CommandItem>
                      )
                    })}
                    {searchEndpoint && (
                      <div ref={sentinelRef} className="py-1 text-center">
                        {remoteLoading && <span className="text-xs text-muted-foreground">Cargando...</span>}
                      </div>
                    )}
                  </CommandGroup>
                </CommandList>
                <div className="border-t p-2 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    onClick={() => { handleClearFilter(); setFilterOpen(false) }}
                    disabled={!isActive && localSelected.size === 0}
                  >
                    Limpiar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={handleApplySelect}
                    disabled={!localHasChanges && localSelected.size === 0}
                  >
                    Aplicar{localSelected.size > 0 ? ` (${localSelected.size})` : ''}
                  </Button>
                </div>
              </Command>
            )}


            {/* ── Text filter ── */}
            {filterType === 'text' && (
              <div className="p-2.5 space-y-2">
                <Input
                  placeholder={`Contiene...`}
                  value={localTextValue}
                  onChange={(e) => setLocalTextValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit() }}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={handleClearFilter} disabled={!isActive}>
                    Limpiar
                  </Button>
                  <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleTextSubmit}>
                    Aplicar
                  </Button>
                </div>
              </div>
            )}

            {/* ── Number range filter: Min / Max ── */}
            {filterType === 'number_range' && (
              <div className="p-2.5 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Min</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={localMin}
                      onChange={(e) => setLocalMin(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleNumberRangeSubmit() }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Max</Label>
                    <Input
                      type="number"
                      placeholder="999999"
                      value={localMax}
                      onChange={(e) => setLocalMax(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleNumberRangeSubmit() }}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={handleClearFilter} disabled={!isActive}>
                    Limpiar
                  </Button>
                  <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleNumberRangeSubmit}>
                    Aplicar
                  </Button>
                </div>
              </div>
            )}

            {/* ── Date range filter: compact calendar ── */}
            {filterType === 'date_range' && (
              <div>
                <Calendar
                  mode="range"
                  selected={localDateRange}
                  onSelect={setLocalDateRange}
                  locale={es}
                  numberOfMonths={1}
                  className="p-2"
                  classNames={{
                    months: 'flex flex-col',
                    month: 'space-y-2',
                    caption: 'flex justify-center pt-0.5 relative items-center text-sm',
                    caption_label: 'text-sm font-medium',
                    nav_button: 'h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100',
                    table: 'w-full border-collapse',
                    head_row: 'flex',
                    head_cell: 'text-muted-foreground rounded-md w-8 font-normal text-[0.7rem]',
                    row: 'flex w-full mt-1',
                    cell: 'h-7 w-8 text-center text-xs p-0 relative',
                    day: 'h-7 w-8 p-0 font-normal text-xs aria-selected:opacity-100',
                    day_range_start: 'day-range-start',
                    day_range_end: 'day-range-end',
                    day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    day_range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
                    day_today: 'bg-accent text-accent-foreground',
                  }}
                />
                {localDateRange?.from && (
                  <div className="px-2 pb-1 text-center text-[11px] text-muted-foreground">
                    {format(localDateRange.from, 'dd MMM yyyy', { locale: es })}
                    {localDateRange.to && localDateRange.to.getTime() !== localDateRange.from.getTime()
                      ? ` — ${format(localDateRange.to, 'dd MMM yyyy', { locale: es })}`
                      : ' (un día)'}
                  </div>
                )}
                <div className="border-t p-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 text-[11px]"
                    onClick={() => { handleClearFilter(); setFilterOpen(false) }}
                    disabled={!isActive && !localDateRange}
                  >
                    Limpiar
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 flex-1 text-[11px]"
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
