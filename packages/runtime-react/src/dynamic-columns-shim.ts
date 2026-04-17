// Type-only definitions for dynamic column builders. The actual
// `getDynamicColumns` implementation is host-owned (it renders design-system
// specific primitives like Badge/Avatar/MediaGallery tied to the host's
// shadcn theme). Hosts pass their implementation into <DynamicTable> via the
// `getDynamicColumns` prop.
import type { ColumnDef } from '@tanstack/react-table'
import type { TableMetadata } from './types'

export interface FilterOption {
    label: string
    value: string
    icon?: string
    color?: string
}

export interface ColumnFilterConfig {
    filterType: 'select' | 'boolean' | 'date_range' | 'number_range' | 'text' | string
    filterKey: string
    options: FilterOption[]
    selectedValues: string[]
    onFilterChange: (filterKey: string, values: string[]) => void
    loading?: boolean
    searchEndpoint?: string
}

/** Signature for the host-provided `getDynamicColumns` factory. */
export type GetDynamicColumns = (
    metadata: TableMetadata,
    handleAction: (action: string, row: any) => void,
    t: (key: string, options?: any) => string,
    language: string,
    columnFilterConfigs: Map<string, ColumnFilterConfig>,
) => ColumnDef<any>[]

/** Signature for the host-provided `DynamicIcon` renderer. */
export type DynamicIconComponent = React.ComponentType<{ name: string; className?: string }>
