import * as React from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import { Input } from '@/primitives/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableViewOptions } from './view-options'

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
  dateFilter?: unknown
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
  // Dynamic (server-side) filters render their own chip row with a
  // "Limpiar todo" below the toolbar, so this button only covers the
  // table's own client-side state (column filters + global search) —
  // otherwise both clear affordances show for the same filter.
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    table.getState().globalFilter

  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex w-full flex-1 flex-col-reverse items-stretch gap-y-2 sm:w-auto sm:flex-row sm:items-center sm:space-x-2'>
        {children}
        {searchKey ? (
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className='h-8 w-full sm:w-[150px] lg:w-[250px]'
          />
        ) : (
          <Input
            placeholder={searchPlaceholder}
            value={(table.getState().globalFilter as string) ?? ''}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className='h-8 w-full sm:w-[150px] lg:w-[250px]'
          />
        )}
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
                Object.keys(activeFilters).forEach((key) =>
                  onDynamicFilterChange(key, [])
                )
              }
            }}
            className='h-8 px-2 lg:px-3 text-muted-foreground hover:text-foreground'
          >
            Limpiar filtros
            <Cross2Icon className='ms-1 h-3.5 w-3.5' />
          </Button>
        )}
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        {extraActions}
        {onRefresh && (
          <Button
            variant='outline'
            size='sm'
            onClick={onRefresh}
            className='h-8 px-2 lg:px-3'
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span className='sr-only'>Recargar</span>
          </Button>
        )}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
