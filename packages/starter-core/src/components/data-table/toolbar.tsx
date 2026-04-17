import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableViewOptions } from './view-options'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  searchKey?: string
  filters?: {
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
  activeFilters?: Record<string, string[]>
  onDynamicFilterChange?: (filterKey: string, values: string[]) => void
  onRefresh?: () => void
  isLoading?: boolean
  children?: React.ReactNode
  dateFilter?: any
  perPageOptions?: number[]
  selectedCount?: number
  onBulkDelete?: () => void
  extraActions?: React.ReactNode
}

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = 'Filter...',
  searchKey,
  filters = [],
  activeFilters = {},
  onDynamicFilterChange,
  onRefresh,
  isLoading,
  children,
  extraActions,
}: DataTableToolbarProps<TData>) {
  const hasActiveColumnFilters = Object.values(activeFilters).some(v => v.length > 0)
  const activeFilterCount = Object.values(activeFilters).filter(v => v.length > 0).length + table.getState().columnFilters.length
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter || hasActiveColumnFilters

  return (
    <div className='flex items-center justify-between'>
      <div className='flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2'>
        {children}
        {searchKey ? (
          <Input
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ''
            }
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className='h-8 w-[150px] lg:w-[250px]'
          />
        ) : (
          <Input
            placeholder={searchPlaceholder}
            value={table.getState().globalFilter ?? ''}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className='h-8 w-[150px] lg:w-[250px]'
          />
        )}
        {/* Bulk delete moved to floating bar (DataTableBulkActions) */}
        <div className='flex gap-x-2 flex-wrap'>
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId)
            if (!column) return null
            return (
              <DataTableFacetedFilter
                key={filter.columnId}
                column={column}
                title={filter.title}
                options={filter.options}
              />
            )
          })}
        </div>
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={() => {
              table.resetColumnFilters()
              table.setGlobalFilter('')
              if (onDynamicFilterChange) {
                Object.keys(activeFilters).forEach(key => onDynamicFilterChange(key, []))
              }
            }}
            className='h-8 px-2 lg:px-3 text-muted-foreground hover:text-foreground'
          >
            Limpiar filtros
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold px-1">
                {activeFilterCount}
              </span>
            )}
            <Cross2Icon className='ms-1 h-3.5 w-3.5' />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onRefresh && (
          <Button
            variant='outline'
            size='sm'
            onClick={onRefresh}
            className='h-8 px-2 lg:px-3'
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            <span className="sr-only">Recargar</span>
          </Button>
        )}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
