import * as React from 'react'
import { type Column } from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'
import {
  ColumnFilterControl,
  type FilterOption,
  type ColumnFilterType,
  type ColumnFilterMeta,
} from './column-filter-control'

// Re-exported so `@asteby/metacore-ui/data-table` consumers keep importing these
// from here (the filter popover now lives in its own TanStack-agnostic module,
// ColumnFilterControl, so the DynamicKanban filter bar can reuse it).
export type { FilterOption, ColumnFilterType, ColumnFilterMeta }

type FilterableColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: string
  }

/**
 * Pro column header combining sort + scoped per-column filter UI.
 *
 * The sort dropdown is owned here (it's TanStack-column specific); the filter
 * popover is delegated to <ColumnFilterControl>, driven by `columnDef.meta`.
 * Supports `select`, `boolean`, `text`, `number_range`, and `date_range` filter
 * types. The remote `filterSearchEndpoint` lookups are wired by the host
 * (DynamicTable).
 */
export function FilterableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: FilterableColumnHeaderProps<TData, TValue>) {
  const meta = (column.columnDef.meta || {}) as ColumnFilterMeta &
    Record<string, unknown>
  const canSort = column.getCanSort()

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
            {column.getIsSorted() && (
              <DropdownMenuItem onClick={() => column.clearSorting()}>
                <ArrowUpDown className='text-muted-foreground/70 size-3.5' />
                Quitar orden
              </DropdownMenuItem>
            )}
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

      {meta.filterable && (
        <ColumnFilterControl
          filterKey={meta.filterKey || column.id}
          filterType={meta.filterType}
          filterOptions={meta.filterOptions}
          filterLoading={meta.filterLoading}
          filterSearchEndpoint={meta.filterSearchEndpoint}
          selectedValues={meta.selectedValues}
          onFilterChange={meta.onFilterChange}
          loadOptions={meta.loadOptions}
        />
      )}
    </div>
  )
}
