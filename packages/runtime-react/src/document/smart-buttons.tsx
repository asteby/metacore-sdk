// SmartButtons — accesos con contador al estilo Odoo (Pagos (2) · REP (1) ·
// Notas de crédito (0)…). Un botón sin registros se ve atenuado, no oculto,
// salvo que la definición pida `hideWhenEmpty`.
import { useTranslation } from 'react-i18next'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from '../dynamic-icon'

export interface SmartButtonItem {
    key: string
    label: string
    icon?: string
    /** undefined = botón sin contador (p. ej. «Pedido origen»). */
    count?: number
    /** Deshabilitado (sin destino / vacío). */
    disabled?: boolean
    onClick?: () => void
}

export interface SmartButtonsProps {
    items: SmartButtonItem[]
    className?: string
}

export function SmartButtons({ items, className }: SmartButtonsProps) {
    const { t } = useTranslation()
    if (items.length === 0) return null
    return (
        <nav aria-label={t('document.related', { defaultValue: 'Relacionados' })} className={cn('flex flex-wrap gap-2', className)} data-smart-buttons=''>
            {items.map((it) => {
                const empty = it.count === 0
                return (
                    <button
                        key={it.key}
                        type='button'
                        disabled={it.disabled}
                        onClick={it.onClick}
                        data-smart-button={it.key}
                        className={cn(
                            'inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm transition-colors',
                            'hover:bg-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-card',
                            empty && 'text-muted-foreground',
                        )}
                    >
                        {it.icon ? <DynamicIcon name={it.icon} className='h-4 w-4' /> : null}
                        <span>{t(it.label, { defaultValue: it.label })}</span>
                        {it.count !== undefined ? (
                            <span className='rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums'>{it.count}</span>
                        ) : null}
                    </button>
                )
            })}
        </nav>
    )
}
