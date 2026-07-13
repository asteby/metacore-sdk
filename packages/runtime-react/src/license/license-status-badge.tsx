/**
 * Insignia de estado de licencia — un chip que traduce el `LicenseStatus` a
 * color + etiqueta legible. Reutilizable suelto (p. ej. en Ajustes de licencia)
 * o embebido en el encabezado del <LicenseGate>.
 */
import { useTranslation } from 'react-i18next'
import {
    ShieldCheck,
    ShieldAlert,
    ShieldQuestion,
    Clock,
    CloudOff,
} from 'lucide-react'
import { Badge } from '@asteby/metacore-ui'
import type { LicenseStatus } from './types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

interface StatusMeta {
    variant: BadgeVariant
    Icon: typeof ShieldCheck
    key: string
    defaultValue: string
    /** Tinte amarillo para posturas degradadas (grace/stale) que `variant` no
     * cubre — el sistema de badges no tiene "warning". */
    warn?: boolean
}

const STATUS_META: Record<LicenseStatus, StatusMeta> = {
    valid: {
        variant: 'default',
        Icon: ShieldCheck,
        key: 'license.status.valid',
        defaultValue: 'Activa',
    },
    stale: {
        variant: 'outline',
        Icon: CloudOff,
        key: 'license.status.stale',
        defaultValue: 'Sin verificar',
        warn: true,
    },
    grace: {
        variant: 'outline',
        Icon: Clock,
        key: 'license.status.grace',
        defaultValue: 'En gracia',
        warn: true,
    },
    expired: {
        variant: 'destructive',
        Icon: ShieldAlert,
        key: 'license.status.expired',
        defaultValue: 'Vencida',
    },
    missing: {
        variant: 'secondary',
        Icon: ShieldQuestion,
        key: 'license.status.missing',
        defaultValue: 'Sin licencia',
    },
    invalid: {
        variant: 'destructive',
        Icon: ShieldAlert,
        key: 'license.status.invalid',
        defaultValue: 'Inválida',
    },
}

export interface LicenseStatusBadgeProps {
    status: LicenseStatus
    className?: string
}

export function LicenseStatusBadge({ status, className }: LicenseStatusBadgeProps) {
    const { t } = useTranslation()
    const meta = STATUS_META[status] ?? STATUS_META.missing
    const { Icon } = meta

    return (
        <Badge
            variant={meta.variant}
            className={
                (meta.warn
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 '
                    : '') + (className ?? '')
            }
        >
            <Icon aria-hidden />
            {t(meta.key, { defaultValue: meta.defaultValue })}
        </Badge>
    )
}
