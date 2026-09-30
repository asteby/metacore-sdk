// StatusBadge — badge semántico con texto explícito e ícono por tono: el color
// nunca es la única señal (benchmark §6.3). El catálogo de estados de cada
// documento vive en su `StatusMachine`; aquí solo se pinta.
import { useTranslation } from 'react-i18next'
import { AlertOctagon, AlertTriangle, CheckCircle2, Circle, Clock, Info, type LucideIcon } from 'lucide-react'
import { Badge } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import type { StatusDef, StatusTone } from './types'

type BadgeVariant = 'muted' | 'info' | 'success' | 'warning' | 'danger'

export const STATUS_TONE_STYLE: Record<StatusTone, { variant: BadgeVariant; icon: LucideIcon }> = {
    neutral: { variant: 'muted', icon: Circle },
    info: { variant: 'info', icon: Info },
    success: { variant: 'success', icon: CheckCircle2 },
    caution: { variant: 'warning', icon: Clock },
    warning: { variant: 'warning', icon: AlertTriangle },
    critical: { variant: 'danger', icon: AlertOctagon },
}

export interface StatusBadgeProps {
    status: Pick<StatusDef, 'label' | 'tone' | 'strike'>
    /** Descripción para lectores de pantalla («Estado fiscal»). */
    srLabel?: string
    className?: string
}

export function StatusBadge({ status, srLabel, className }: StatusBadgeProps) {
    const { t } = useTranslation()
    const style = STATUS_TONE_STYLE[status.tone] ?? STATUS_TONE_STYLE.neutral
    const Icon = style.icon
    const text = t(status.label, { defaultValue: status.label })
    return (
        <Badge
            variant={style.variant}
            data-tone={status.tone}
            className={cn(status.strike && 'line-through', className)}
        >
            <Icon aria-hidden />
            {srLabel ? <span className='sr-only'>{srLabel}: </span> : null}
            {text}
        </Badge>
    )
}
