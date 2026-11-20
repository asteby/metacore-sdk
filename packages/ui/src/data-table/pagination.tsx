import * as React from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { cn, getPageNumbers } from '@/lib/utils'
import { Button } from '@/primitives/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/primitives/select'

export type PaginationProps = {
  /** Current page, 1-based. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** Rows per page. Omit (with onPageSizeChange) to hide the size selector. */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
  leftActions?: React.ReactNode
}

/**
 * Paginator that depends on no table library: any list (cards, a POS grid, a
 * server-paginated feed) can use it. {@link DataTablePagination} is the
 * TanStack adapter over this same component.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 30, 40, 50],
  className,
  leftActions,
}: PaginationProps) {
  const { t } = useTranslation()
  const currentPage = page
  const totalPages = pageCount
  const pageNumbers = getPageNumbers(currentPage, totalPages)
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages
  const showSize = pageSize != null && !!onPageSizeChange

  return (
    <div
      className={cn(
        'flex items-center justify-between overflow-clip px-2',
        '@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4',
        className
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div className='flex w-full items-center justify-between'>
        <div className='flex w-[100px] items-center justify-center text-sm font-medium @2xl/content:hidden'>
          {t('datatable.page_x_of_y', { current: currentPage, total: totalPages })}
        </div>
        <div className='flex items-center gap-2 @max-2xl/content:flex-row-reverse'>
          {showSize ? (
            <>
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => onPageSizeChange?.(Number(value))}
              >
                <SelectTrigger className='h-9 w-[70px]'>
                  <SelectValue placeholder={String(pageSize)} />
                </SelectTrigger>
                <SelectContent side='top'>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='hidden text-sm font-medium sm:block'>
                {t('datatable.rows_per_page')}
              </p>
            </>
          ) : null}
          {leftActions}
        </div>
      </div>

      <div className='flex items-center sm:space-x-6 lg:space-x-8'>
        <div className='flex w-[100px] items-center justify-center text-sm font-medium @max-3xl/content:hidden'>
          {t('datatable.page_x_of_y', { current: currentPage, total: totalPages })}
        </div>
        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            className='size-9 p-0 @max-md/content:hidden'
            onClick={() => onPageChange(1)}
            disabled={!canPrev}
          >
            <span className='sr-only'>{t('datatable.go_first_page')}</span>
            <DoubleArrowLeftIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='size-9 p-0'
            onClick={() => onPageChange(currentPage - 1)}
            disabled={!canPrev}
          >
            <span className='sr-only'>{t('datatable.go_previous_page')}</span>
            <ChevronLeftIcon className='h-4 w-4' />
          </Button>

          {pageNumbers.map((pageNumber, index) => (
            <div key={`${pageNumber}-${index}`} className='flex items-center'>
              {pageNumber === '...' ? (
                <span className='text-muted-foreground px-1 text-sm'>...</span>
              ) : (
                <Button
                  variant={currentPage === pageNumber ? 'default' : 'outline'}
                  className='h-9 min-w-9 px-3'
                  onClick={() => onPageChange(pageNumber as number)}
                >
                  <span className='sr-only'>
                    {t('datatable.go_page', { page: pageNumber })}
                  </span>
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            variant='outline'
            className='size-9 p-0'
            onClick={() => onPageChange(currentPage + 1)}
            disabled={!canNext}
          >
            <span className='sr-only'>{t('datatable.go_next_page')}</span>
            <ChevronRightIcon className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='size-9 p-0 @max-md/content:hidden'
            onClick={() => onPageChange(totalPages)}
            disabled={!canNext}
          >
            <span className='sr-only'>{t('datatable.go_last_page')}</span>
            <DoubleArrowRightIcon className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  )
}

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  className?: string
  pageSizeOptions?: number[]
  leftActions?: React.ReactNode
}

/** TanStack adapter over {@link Pagination} (same UI and behavior as before). */
export function DataTablePagination<TData>({
  table,
  className,
  pageSizeOptions,
  leftActions,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination
  return (
    <Pagination
      page={pageIndex + 1}
      pageCount={table.getPageCount()}
      onPageChange={(p) => table.setPageIndex(p - 1)}
      pageSize={pageSize}
      onPageSizeChange={(s) => table.setPageSize(s)}
      pageSizeOptions={pageSizeOptions}
      className={className}
      leftActions={leftActions}
    />
  )
}
