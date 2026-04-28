// Default `getDynamicColumns` factory used by hosts that don't need a custom
// renderer. Supports every cell type produced by kernel/dynamic metadata:
// badge (static + endpoint-loaded options), avatar, phone, date, boolean,
// relation-badge-list, media-gallery, image, plus a generic text fallback.
//
// The implementation was previously duplicated across multiple host apps
// (~550 LOC each, drifting). It now lives here so a single fix propagates
// to every host. Hosts inject app-specific URL helpers via the `helpers`
// argument so the SDK stays free of environment-bound code.

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import * as icons from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    Button,
    Checkbox,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@asteby/metacore-ui'
import {
    DataTableColumnHeader,
    FilterableColumnHeader,
    type ColumnFilterMeta,
} from '@asteby/metacore-ui/data-table'
import { generateBadgeStyles, getInitials } from '@asteby/metacore-ui/lib'
import { OptionsContext } from './options-context'
import { DynamicIcon } from './dynamic-icon'
import type { TableMetadata, ColumnDefinition } from './types'
import type {
    ColumnFilterConfig,
    GetDynamicColumns,
} from './dynamic-columns-shim'

/** Host-supplied helpers consumed by avatar/image cell renderers. */
export interface DynamicColumnsHelpers {
    /**
     * Resolves a relative or absolute media path into a renderable URL. Hosts
     * typically prepend their CDN/storage base. If omitted, paths are passed
     * through verbatim.
     */
    getImageUrl?: (path: string) => string
    /**
     * API origin used to build avatar URLs when the row carries a bare filename
     * instead of an absolute URL or sibling `.avatar` field. Usually
     * `import.meta.env.VITE_API_URL.replace('/api', '')`.
     */
    apiBaseUrl?: string
}

const defaultGetImageUrl = (path: string) => path

const getNestedValue = (obj: any, path: string) =>
    path.split('.').reduce((acc, part) => acc && acc[part], obj)

const lowerFirst = (value?: string) => {
    if (!value) return value
    return value.charAt(0).toLowerCase() + value.slice(1)
}

const getPathVariants = (path?: string) => {
    if (!path) return []
    const normalized = path
        .split('.')
        .map((segment) => lowerFirst(segment) || segment)
        .join('.')
    return Array.from(new Set([path, normalized])).filter(Boolean)
}

const getValueFromPathVariants = (obj: any, path?: string) => {
    if (!path) return undefined
    for (const candidate of getPathVariants(path)) {
        const value = getNestedValue(obj, candidate as string)
        if (value !== undefined && value !== null) return value
    }
    return undefined
}

const useIsDarkTheme = () => {
    const [isDark, setIsDark] = React.useState(() =>
        typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
    )
    React.useEffect(() => {
        if (typeof document === 'undefined') return
        const sync = () =>
            setIsDark(document.documentElement.classList.contains('dark'))
        sync()
        const observer = new MutationObserver(sync)
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })
        return () => observer.disconnect()
    }, [])
    return isDark
}

const renderRelationBadges = (items: any, col: ColumnDefinition) => {
    if (!Array.isArray(items) || items.length === 0) {
        return <span className="text-muted-foreground">-</span>
    }
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((item: any, idx: number) => {
                const relationTarget = col.relationPath
                    ? getValueFromPathVariants(item, col.relationPath) ?? item
                    : item
                const displaySource = relationTarget ?? item
                let displayValue =
                    col.displayField !== undefined && col.displayField !== null
                        ? getValueFromPathVariants(displaySource, col.displayField)
                        : displaySource
                if (displayValue === undefined || displayValue === null) {
                    displayValue = displaySource
                }
                const label =
                    displayValue !== undefined && displayValue !== null
                        ? String(displayValue)
                        : '-'
                let iconValue: string | undefined
                if (col.iconField) {
                    const rawIcon = getValueFromPathVariants(displaySource, col.iconField)
                    if (rawIcon !== undefined && rawIcon !== null) {
                        iconValue = String(rawIcon)
                    }
                }
                return (
                    <Badge
                        key={`${col.key}-${idx}`}
                        variant="outline"
                        className="flex items-center gap-1"
                    >
                        {iconValue && (
                            <DynamicIcon name={iconValue} className="h-3 w-3" />
                        )}
                        <span>{label}</span>
                    </Badge>
                )
            })}
        </div>
    )
}

interface OptionBadgeProps {
    option: { value: string; label: string; icon?: string; color?: string }
    fallback: string
}

const OptionBadge: React.FC<OptionBadgeProps> = ({ option }) => {
    const isDark = useIsDarkTheme()
    const colorStyles = option.color ? generateBadgeStyles(option.color, { isDark }) : {}
    return (
        <Badge variant="outline" className="flex items-center gap-1 border-0" style={colorStyles}>
            {option.icon && <DynamicIcon name={option.icon} className="h-3.5 w-3.5" />}
            <span>{option.label}</span>
        </Badge>
    )
}

const BadgeWithEndpointOptions: React.FC<{ endpoint: string; value: any }> = ({ endpoint, value }) => {
    const { optionsMap } = React.useContext(OptionsContext)
    const options = optionsMap.get(endpoint) || []
    const option = options.find((opt: any) => opt.value === value)
    if (option) return <OptionBadge option={option} fallback={String(value)} />
    return <Badge variant="outline">{String(value)}</Badge>
}

/**
 * Builds the canonical column factory used by `<DynamicTable>` when the host
 * does not supply its own. Pass `{ getImageUrl, apiBaseUrl }` to wire avatar
 * URL resolution.
 */
export function makeDefaultGetDynamicColumns(
    helpers: DynamicColumnsHelpers = {},
): GetDynamicColumns {
    const getImageUrl = helpers.getImageUrl ?? defaultGetImageUrl
    const apiBaseUrl = helpers.apiBaseUrl ?? ''

    return function defaultGetDynamicColumns(
        metadata: TableMetadata,
        onAction?: (action: string, row: any) => void,
        t?: (key: string, options?: any) => string,
        currentLanguage?: string,
        filterConfigs?: Map<string, ColumnFilterConfig>,
    ): ColumnDef<any>[] {
        const dateLocale = currentLanguage === 'en' ? enUS : es
        const columns: ColumnDef<any>[] = [
            {
                id: 'select',
                header: ({ table }) => (
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && 'indeterminate')
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-[2px]"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-[2px]"
                    />
                ),
                enableSorting: false,
                enableHiding: false,
            },
        ]

        metadata.columns.forEach((col) => {
            if (col.hidden) return

            const translatedLabel = col.label
            const filterConfig = filterConfigs?.get(col.key)

            const columnMeta: Record<string, unknown> = {
                label: translatedLabel,
            }
            if (filterConfig) {
                const fm: ColumnFilterMeta = {
                    filterable: true,
                    filterType: filterConfig.filterType as ColumnFilterMeta['filterType'],
                    filterKey: filterConfig.filterKey,
                    filterOptions: filterConfig.options,
                    filterLoading: filterConfig.loading,
                    filterSearchEndpoint: filterConfig.searchEndpoint,
                    selectedValues: filterConfig.selectedValues,
                    onFilterChange: filterConfig.onFilterChange,
                }
                Object.assign(columnMeta, fm)
            }

            columns.push({
                accessorKey: col.key,
                id: col.key,
                meta: columnMeta,
                header: ({ column }) =>
                    filterConfig ? (
                        <FilterableColumnHeader column={column} title={translatedLabel} />
                    ) : (
                        <DataTableColumnHeader column={column} title={translatedLabel} />
                    ),
                cell: ({ row }) => {
                    const value = getNestedValue(row.original, col.key)
                    // Kernel emits the renderer flag as `type`; older hosts used
                    // `cellStyle`. Accept both so a single backend works across
                    // SDK versions.
                    const renderAs = col.cellStyle ?? col.type

                    // Endpoint-loaded badge options (preloaded into OptionsContext)
                    if (renderAs === 'badge' && col.useOptions && col.searchEndpoint) {
                        if (!value) return <span className="text-muted-foreground">-</span>
                        return <BadgeWithEndpointOptions endpoint={col.searchEndpoint} value={value} />
                    }

                    // Static badge options — map value → label/icon/color
                    if (renderAs === 'badge' && col.options && col.options.length > 0) {
                        if (!value && value !== 0) return <span className="text-muted-foreground">-</span>
                        const option = col.options.find((o) => o.value === String(value))
                        if (option) return <OptionBadge option={option} fallback={String(value)} />
                        return <Badge variant="outline">{String(value)}</Badge>
                    }

                    if (renderAs === 'relation-badge-list') {
                        return renderRelationBadges(value, col)
                    }

                    switch (col.type) {
                        case 'date': {
                            if (!value) return <span className="text-muted-foreground">-</span>
                            try {
                                const date = new Date(value)
                                if (isNaN(date.getTime()) || date.getFullYear() <= 1) {
                                    return <span className="text-muted-foreground">-</span>
                                }
                                return (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <icons.Calendar className="h-3.5 w-3.5 opacity-70" />
                                        <span className="text-sm font-medium">
                                            {format(date, 'PPP', { locale: dateLocale })}
                                        </span>
                                    </div>
                                )
                            } catch {
                                return <span>{String(value)}</span>
                            }
                        }

                        case 'search':
                        case 'avatar': {
                            const namePath = col.tooltip || col.key
                            const name = getNestedValue(row.original, namePath) || 'N/A'
                            const desc = getNestedValue(row.original, col.description || '')

                            let avatarSrc: string | undefined
                            if (col.key.includes('.')) {
                                const parentPath = col.key.split('.').slice(0, -1).join('.')
                                const avatarPath = `${parentPath}.avatar`
                                const possibleAvatar = getNestedValue(row.original, avatarPath)
                                if (possibleAvatar) avatarSrc = String(possibleAvatar)
                            } else if (
                                value &&
                                (String(value).startsWith('http') || String(value).startsWith('https'))
                            ) {
                                avatarSrc = String(value)
                            } else if (value) {
                                avatarSrc = `${apiBaseUrl}${col.basePath || ''}${value}`
                            }

                            return (
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar className="h-8 w-8 rounded-lg ring-1 ring-border/50">
                                        <AvatarImage
                                            src={getImageUrl(avatarSrc || '')}
                                            alt={String(name)}
                                            className="object-cover"
                                        />
                                        <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary rounded-lg">
                                            {getInitials(String(name))}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col min-w-0 overflow-hidden">
                                        <span className="font-medium text-sm truncate leading-none mb-0.5 text-foreground/90">
                                            {String(name)}
                                        </span>
                                        {desc && (
                                            <span className="text-[11px] text-muted-foreground truncate leading-none">
                                                {String(desc)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        }

                        case 'relation-badge-list':
                            return renderRelationBadges(value, col)

                        case 'phone': {
                            if (!value) return <span className="text-muted-foreground">-</span>
                            return <span className="font-medium text-sm">{String(value)}</span>
                        }

                        case 'boolean':
                            return value ? <Badge>Sí</Badge> : <Badge variant="secondary">No</Badge>

                        case 'media-gallery': {
                            if (!value || (Array.isArray(value) && value.length === 0)) {
                                return <span className="text-muted-foreground">-</span>
                            }
                            const mediaItems = Array.isArray(value) ? value : []
                            const visibleItems = mediaItems.slice(0, 3)
                            const remaining = mediaItems.length - 3
                            return (
                                <div className="flex -space-x-2 overflow-hidden">
                                    {visibleItems.map((item: any, i: number) => {
                                        const src = item.url
                                        if (item.type === 'image') {
                                            return (
                                                <Avatar
                                                    key={i}
                                                    className="inline-block h-8 w-8 rounded-full ring-2 ring-background"
                                                >
                                                    <AvatarImage src={src} className="object-cover" />
                                                    <AvatarFallback>{item.type?.[0]}</AvatarFallback>
                                                </Avatar>
                                            )
                                        }
                                        return (
                                            <div
                                                key={i}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted ring-2 ring-background"
                                            >
                                                <DynamicIcon
                                                    name={
                                                        item.type === 'video'
                                                            ? 'Video'
                                                            : item.type === 'audio'
                                                              ? 'AudioLines'
                                                              : 'FileText'
                                                    }
                                                    className="h-4 w-4"
                                                />
                                            </div>
                                        )
                                    })}
                                    {remaining > 0 && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
                                            +{remaining}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        case 'image': {
                            const imageValue =
                                value ||
                                (Array.isArray(row.original.media)
                                    ? row.original.media.find((m: any) => m.type === 'image')?.url
                                    : null)
                            if (!imageValue) return <span className="text-muted-foreground">-</span>
                            return (
                                <div className="h-10 w-10 relative rounded overflow-hidden bg-muted flex items-center justify-center">
                                    <img
                                        src={getImageUrl(String(imageValue))}
                                        alt="Thumbnail"
                                        className="h-full w-full object-contain"
                                        onError={(e) => {
                                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                </div>
                            )
                        }

                        default: {
                            if (typeof value === 'object' && value !== null) {
                                return (
                                    <span className="text-muted-foreground text-xs">
                                        {JSON.stringify(value)}
                                    </span>
                                )
                            }
                            if (
                                col.key === 'description' ||
                                col.key === 'features' ||
                                col.key.includes('description')
                            ) {
                                return (
                                    <div className="max-w-[350px]" title={String(value)}>
                                        <span className="truncate font-medium block">
                                            {value !== null && value !== undefined ? String(value) : '-'}
                                        </span>
                                    </div>
                                )
                            }
                            return (
                                <span className="truncate font-medium">
                                    {value !== null && value !== undefined ? String(value) : '-'}
                                </span>
                            )
                        }
                    }
                },
                enableSorting: col.sortable,
                enableHiding: true,
            })
        })

        // Resolve which actions to surface in the row dropdown:
        //   1. If the host metadata declares its own actions, use them as-is.
        //   2. Otherwise, when enableCRUDActions is true, fall back to the
        //      canonical View / Edit / Delete trio so any model with CRUD on
        //      gets the same dropdown without the host having to declare it.
        // The DynamicTable wires `view`/`edit`/`delete` to its own dialogs
        // through onAction, so labels/icons are the only thing this needs to
        // ship.
        const explicitActions = metadata.actions ?? []
        const hasExplicitActions = (metadata.hasActions ?? explicitActions.length > 0) && explicitActions.length > 0
        const defaultCRUDActions: typeof explicitActions =
            metadata.enableCRUDActions
                ? [
                      {
                          key: 'view',
                          name: 'view',
                          label: t ? t('datatable.view_record') : 'Ver',
                          icon: 'Eye',
                      } as any,
                      {
                          key: 'edit',
                          name: 'edit',
                          label: t ? t('datatable.edit') : 'Editar',
                          icon: 'Pencil',
                      } as any,
                      {
                          key: 'delete',
                          name: 'delete',
                          label: t ? t('datatable.delete') : 'Eliminar',
                          icon: 'Trash2',
                      } as any,
                  ]
                : []
        const resolvedActions = hasExplicitActions ? explicitActions : defaultCRUDActions

        if (resolvedActions.length > 0) {
            columns.push({
                id: 'actions',
                header: () => <div className="text-right">{t ? t('common.actions') : 'Acciones'}</div>,
                size: 80,
                maxSize: 80,
                meta: {},
                cell: ({ row }) => (
                    <div className="flex items-center justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Abrir menú</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {resolvedActions
                                    .filter((action) => {
                                        if (!action.condition) return true
                                        const { field, operator, value } = action.condition
                                        const rowValue = String((row.original as any)[field] ?? '')
                                        const values = Array.isArray(value) ? value : [value]
                                        switch (operator) {
                                            case 'eq':
                                                return rowValue === values[0]
                                            case 'neq':
                                                return rowValue !== values[0]
                                            case 'in':
                                                return values.includes(rowValue)
                                            case 'not_in':
                                                return !values.includes(rowValue)
                                            default:
                                                return true
                                        }
                                    })
                                    .map((action) => (
                                        <DropdownMenuItem
                                            key={action.key}
                                            onClick={() => onAction && onAction(action.key, row.original)}
                                        >
                                            <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />
                                            {action.label}
                                        </DropdownMenuItem>
                                    ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            })
        }

        return columns
    }
}

/**
 * Eager-built variant — equivalent to `makeDefaultGetDynamicColumns()`. Use
 * this when the host has no helpers to inject and a stable function reference
 * suffices.
 */
export const defaultGetDynamicColumns: GetDynamicColumns =
    makeDefaultGetDynamicColumns()
