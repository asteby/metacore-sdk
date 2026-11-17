import { LayoutGrid, Map as MapIcon, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@asteby/metacore-ui/lib'
import type { ViewModeDef, ViewModeKey } from './types'

const ICON = { cards: LayoutGrid, table: Table2, map: MapIcon } as const
const DEFAULT_LABEL: Record<string, [string, string]> = {
    cards: ['views.cards', 'Tarjetas'],
    table: ['views.data', 'Datos'],
    map: ['views.map', 'Mapa'],
}

export interface ViewSwitcherProps {
    modes: ViewModeDef[]
    active: ViewModeKey
    onChange: (key: ViewModeKey) => void
    className?: string
}

/**
 * Generic "Tarjetas | Datos (| Mapa)" toggle over the SAME data. Labels default
 * to i18n; a module overrides the cards label via `modes[].label` (manifest).
 * Hidden with a single mode. role=group + aria-pressed.
 */
export function ViewSwitcher({ modes, active, onChange, className }: ViewSwitcherProps) {
    const { t } = useTranslation()
    if (modes.length < 2) return null
    return (
        <div role='group' aria-label={t('views.switch', { defaultValue: 'Vista' })} className={cn('inline-flex rounded-lg border bg-muted/40 p-0.5', className)}>
            {modes.map((m) => {
                const Icon = ICON[m.key as keyof typeof ICON] ?? LayoutGrid
                const [k, d] = DEFAULT_LABEL[m.key] ?? [`views.${m.key}`, m.key]
                const on = m.key === active
                return (
                    <button
                        key={m.key}
                        type='button'
                        aria-pressed={on}
                        data-mode={m.key}
                        onClick={() => onChange(m.key)}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            on ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className='size-4' aria-hidden='true' />
                        <span>{m.label ?? t(k, { defaultValue: d })}</span>
                    </button>
                )
            })}
        </div>
    )
}
