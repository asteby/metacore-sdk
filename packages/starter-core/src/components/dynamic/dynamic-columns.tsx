import React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { FilterableColumnHeader, type ColumnFilterMeta, type FilterOption } from '@/components/data-table/filterable-column-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ColumnDefinition, TableMetadata } from './types'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import * as icons from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import { parsePhoneNumber } from 'react-phone-number-input'
// Country type removed - using string type for country codes
import flags from 'react-phone-number-input/flags'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OptionsContext } from './options-context'
import { getImageUrl } from '@/lib/utils'
import { generateBadgeStyles } from '@/lib/option-colors'

// Helper to render Lucide icons dynamically
export const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
    // @ts-ignore
    const Icon = icons[name]
    if (!Icon) return null
    return <Icon className={className} />
}

// Component to render badge with dynamically loaded options
const BadgeWithOptions = ({ endpoint, value }: { endpoint: string; value: any }) => {
    const [isDark, setIsDark] = React.useState(false)
    const { optionsMap } = React.useContext(OptionsContext)

    // Get options from context (already preloaded)
    const options = optionsMap.get(endpoint) || []

    // Detect theme changes
    React.useEffect(() => {
        const checkTheme = () => {
            setIsDark(document.documentElement.classList.contains('dark'))
        }

        checkTheme()

        // Watch for theme changes
        const observer = new MutationObserver(checkTheme)
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        })

        return () => observer.disconnect()
    }, [])

    const option = options.find(opt => opt.value === value)

    if (option) {
        // Generate color variants from base color with theme awareness
        const generateColorStyles = (baseColor: string) => {
            // Remove # if present
            const color = baseColor.replace('#', '')

            // Convert hex to RGB
            const r = parseInt(color.substring(0, 2), 16)
            const g = parseInt(color.substring(2, 4), 16)
            const b = parseInt(color.substring(4, 6), 16)

            if (isDark) {
                // Dark mode: lighter/brighter colors for better visibility
                const lightR = Math.min(255, Math.floor(r * 1.2))
                const lightG = Math.min(255, Math.floor(g * 1.2))
                const lightB = Math.min(255, Math.floor(b * 1.2))

                return {
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.2)`,
                    color: `rgb(${lightR}, ${lightG}, ${lightB})`,
                    border: `1px solid rgba(${r}, ${g}, ${b}, 0.5)`,
                    fontWeight: '500',
                }
            } else {
                // Light mode: darker text for contrast
                const darkR = Math.floor(r * 0.5)
                const darkG = Math.floor(g * 0.5)
                const darkB = Math.floor(b * 0.5)

                return {
                    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.12)`,
                    color: `rgb(${darkR}, ${darkG}, ${darkB})`,
                    border: `1px solid rgba(${r}, ${g}, ${b}, 0.25)`,
                    fontWeight: '500',
                }
            }
        }

        const colorStyles = option.color ? generateColorStyles(option.color) : (option.class ? generateColorStyles(option.class) : {})

        return (
            <Badge
                variant="outline"
                className="flex items-center gap-1 border-0"
                style={colorStyles}
            >
                {option.icon && <DynamicIcon name={option.icon} className="h-3.5 w-3.5" />}
                <span>{option.label}</span>
            </Badge>
        )
    }

    // Fallback
    return <Badge variant="outline">{String(value)}</Badge>
}

// ... helper functions ...

// ... getDynamicColumns function ...

// Helper to access nested properties safely
const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj)
}

const lowerFirst = (value?: string) => {
    if (!value) return value
    return value.charAt(0).toLowerCase() + value.slice(1)
}

const getPathVariants = (path?: string) => {
    if (!path) return []
    const normalized = path
        .split('.')
        .map(segment => lowerFirst(segment) || segment)
        .join('.')

    return Array.from(new Set([path, normalized])).filter(Boolean)
}

const getValueFromPathVariants = (obj: any, path?: string) => {
    if (!path) return undefined
    for (const candidate of getPathVariants(path)) {
        const value = getNestedValue(obj, candidate as string)
        if (value !== undefined && value !== null) {
            return value
        }
    }
    return undefined
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

export interface ColumnFilterConfig {
    filterType: 'select' | 'boolean' | 'text' | 'number_range' | 'date_range'
    filterKey: string
    options: FilterOption[]
    selectedValues: string[]
    onFilterChange: (filterKey: string, values: string[]) => void
    loading?: boolean
    searchEndpoint?: string
}

export const getDynamicColumns = (
    metadata: TableMetadata,
    onAction?: (action: string, row: any) => void,
    t?: (key: string) => string,
    currentLanguage?: string,
    filterConfigs?: Map<string, ColumnFilterConfig>
): ColumnDef<any>[] => {
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
                    aria-label='Select all'
                    className='translate-y-[2px]'
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label='Select row'
                    className='translate-y-[2px]'
                />
            ),
            enableSorting: false,
            enableHiding: false,
        },
    ]

    metadata.columns.forEach((col) => {
        if (col.hidden) return

        // Labels come pre-translated from the backend metadata service
        const translatedLabel = col.label
        const filterConfig = filterConfigs?.get(col.key)

        // Build column meta with filter info
        const columnMeta: Record<string, unknown> = {
            label: translatedLabel,
        }

        if (filterConfig) {
            const fm: ColumnFilterMeta = {
                filterable: true,
                filterType: filterConfig.filterType,
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
            header: ({ column }) => (
                filterConfig
                    ? <FilterableColumnHeader column={column} title={translatedLabel} />
                    : <DataTableColumnHeader column={column} title={translatedLabel} />
            ),
            cell: ({ row }) => {
                const value = getNestedValue(row.original, col.key)

                // Handle badge with dynamic options loading
                if (col.cellStyle === 'badge' && col.useOptions && col.searchEndpoint) {
                    if (!value) return <span className='text-muted-foreground'>-</span>
                    return <BadgeWithOptions endpoint={col.searchEndpoint} value={value} />
                }

                // Handle badge/select with static options — map value to label
                if (col.cellStyle === 'badge' && col.options && col.options.length > 0) {
                    if (!value && value !== 0) return <span className='text-muted-foreground'>-</span>
                    const option = col.options.find(o => o.value === String(value))
                    if (option) {
                        const isDark = document.documentElement.classList.contains('dark')
                        const colorStyles = option.color ? generateBadgeStyles(option.color, { isDark }) : {}
                        return (
                            <Badge variant="outline" className="flex items-center gap-1 border-0" style={colorStyles}>
                                {option.icon && <DynamicIcon name={option.icon} className="h-3.5 w-3.5" />}
                                <span>{option.label}</span>
                            </Badge>
                        )
                    }
                    return <Badge variant="outline">{String(value)}</Badge>
                }

                if (col.cellStyle === 'relation-badge-list') {
                    return renderRelationBadges(value, col)
                }

                switch (col.type) {
                    case 'date':
                        if (!value) return <span className='text-muted-foreground'>-</span>
                        try {
                            const date = new Date(value)
                            if (isNaN(date.getTime()) || date.getFullYear() <= 1) {
                                return <span className='text-muted-foreground'>-</span>
                            }
                            return (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <icons.Calendar className="h-3.5 w-3.5 opacity-70" />
                                    <span className="text-sm font-medium">{format(date, 'PPP', { locale: dateLocale })}</span>
                                </div>
                            )
                        } catch (e) {
                            return <span>{String(value)}</span>
                        }

                    case 'search': // Specific handling for avatar+text style like User
                    case 'avatar':
                        // Get name and description from configured fields
                        // Note: 'tooltip' is reused as 'title' field config for avatar type
                        const namePath = col.tooltip || col.key
                        const name = getNestedValue(row.original, namePath) || 'N/A'
                        const desc = getNestedValue(row.original, col.description || '')

                        // Specific avatar handling: if value is name, try to find avatar related to it

                        // Improve avatar loading logic:
                        // 1. If column key is "user.name", try "user.avatar"
                        // Resolve avatar path from sibling ".avatar" field
                        // e.g. col.key="created_by" → row.original.created_by.avatar
                        //      col.key="user.name"  → row.original.user.avatar
                        const avatarParent = col.key.includes('.')
                            ? col.key.split('.').slice(0, -1).join('.')
                            : col.key
                        const avatarRaw = getNestedValue(row.original, avatarParent + '.avatar')
                        let avatarSrc: string | undefined
                        if (avatarRaw) avatarSrc = String(avatarRaw)

                        return (
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar className="h-8 w-8 rounded-lg ring-1 ring-border/50">
                                    <AvatarImage src={getImageUrl(avatarSrc || '')} alt={name} className="object-cover" />
                                    <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary rounded-lg">
                                        {name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col min-w-0 overflow-hidden">
                                    <span className="font-medium text-sm truncate leading-none mb-0.5 text-foreground/90">{name}</span>
                                    {desc && <span className="text-[11px] text-muted-foreground truncate leading-none">{desc}</span>}
                                </div>
                            </div>
                        )


                    case 'relation-badge-list':
                        return renderRelationBadges(value, col)

                    case 'phone':
                        if (!value) return <span className='text-muted-foreground'>-</span>
                        try {
                            // Add + prefix if not present for parsing
                            const phoneStr = String(value).startsWith('+') ? String(value) : `+${value}`
                            const parsed = parsePhoneNumber(phoneStr)
                            if (parsed) {
                                const country = parsed.country
                                const Flag = country ? flags[country as keyof typeof flags] : null
                                const formatted = parsed.formatInternational()
                                return (
                                    <div className="flex items-center gap-2">
                                        {Flag && (
                                            <span className="flex h-4 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground/10 [&_svg]:h-full [&_svg]:w-full">
                                                <Flag title={country || ''} />
                                            </span>
                                        )}
                                        <span className="font-medium text-sm">{formatted}</span>
                                    </div>
                                )
                            }
                            return <span className="font-medium">{value}</span>
                        } catch {
                            return <span className="font-medium">{value}</span>
                        }

                    case 'boolean':
                        return value ? <Badge>Sí</Badge> : <Badge variant="secondary">No</Badge>

                    default:
                        // Safety check for objects to prevent React rendering errors
                        if (typeof value === 'object' && value !== null) {
                            return <span className='text-muted-foreground text-xs'>{JSON.stringify(value)}</span>
                        }

                        // Special handling for long text columns
                        if (col.key === 'description' || col.key === 'features' || col.key.includes('description')) {
                            return (
                                <div className="max-w-[350px]" title={String(value)}>
                                    <span className='truncate font-medium block'>
                                        {value !== null && value !== undefined ? String(value) : '-'}
                                    </span>
                                </div>
                            )
                        }

                        return (
                            <span className='truncate font-medium'>
                                {value !== null && value !== undefined ? String(value) : '-'}
                            </span>
                        )

                    case 'media-gallery':
                        if (!value || (Array.isArray(value) && value.length === 0)) {
                            return <span className='text-muted-foreground'>-</span>
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
                                            <Avatar key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-background">
                                                <AvatarImage src={src} className="object-cover" />
                                                <AvatarFallback>{item.type?.[0]}</AvatarFallback>
                                            </Avatar>
                                        )
                                    }
                                    return (
                                        <div key={i} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted ring-2 ring-background">
                                            <DynamicIcon name={item.type === 'video' ? 'Video' : item.type === 'audio' ? 'AudioLines' : 'FileText'} className="h-4 w-4" />
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

                    case 'image':
                        const imageValue = value || (Array.isArray(row.original.media) ? row.original.media.find((m: any) => m.type === 'image')?.url : null)

                        if (!imageValue) return <span className='text-muted-foreground'>-</span>
                        return (
                            <div className="h-10 w-10 relative rounded overflow-hidden bg-muted flex items-center justify-center">
                                <img
                                    src={getImageUrl(String(imageValue))}
                                    alt="Thumbnail"
                                    className="h-full w-full object-contain"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                    }}
                                />
                            </div>
                        )
                }
            },
            enableSorting: col.sortable,
            enableHiding: true,
        })
    })

    // Actions Column
    if (metadata.hasActions && metadata.actions.length > 0) {
        columns.push({
            id: 'actions',
            header: () => <div className="text-right">{t ? t('common.actions') : 'Acciones'}</div>,
            size: 80,
            maxSize: 80,
            meta: {
                // label: 'Acciones' // Removed as ColumnMeta doesn't support 'label' property
            },
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
                            {metadata.actions.filter(action => {
                                if (!action.condition) return true
                                const { field, operator, value } = action.condition
                                const rowValue = String(row.original[field] ?? '')
                                const values = Array.isArray(value) ? value : [value]
                                switch (operator) {
                                    case 'eq': return rowValue === values[0]
                                    case 'neq': return rowValue !== values[0]
                                    case 'in': return values.includes(rowValue)
                                    case 'not_in': return !values.includes(rowValue)
                                    default: return true
                                }
                            }).map(action => (
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
