/**
 * Insignia de estado de licencia — un chip que traduce el `LicenseStatus` a
 * color + etiqueta legible. Reutilizable suelto (p. ej. en Ajustes de licencia)
 * o embebido en el encabezado del <LicenseGate>.
 */
import {
    ShieldCheck,
    ShieldAlert,
    ShieldQuestion,
    Clock,
    CloudOff,
} from 'lucide-react'
import { Badge } from '@asteby/metacore-ui'
import type { LicenseStatus } from './types'
import { useLicenseT } from './use-license-t'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

interface StatusMeta {
    variant: BadgeVariant
    Icon: typeof ShieldCheck
    key: string
    /** Tinte amarillo para posturas degradadas (grace/stale) que `variant` no
     * cubre — el sistema de badges no tiene "warning". */
    warn?: boolean
}

const STATUS_META: Record<LicenseStatus, StatusMeta> = {
    valid: {
        variant: 'default',
        Icon: ShieldCheck,
        key: 'license.status.valid',
    },
    stale: {
        variant: 'outline',
        Icon: CloudOff,
        key: 'license.status.stale',
        warn: true,
    },
    grace: {
        variant: 'outline',
        Icon: Clock,
        key: 'license.status.grace',
        warn: true,
    },
    expired: {
        variant: 'destructive',
        Icon: ShieldAlert,
        key: 'license.status.expired',
    },
    missing: {
        variant: 'secondary',
        Icon: ShieldQuestion,
        key: 'license.status.missing',
    },
    invalid: {
        variant: 'destructive',
        Icon: ShieldAlert,
        key: 'license.status.invalid',
    },
    revoked: {
        variant: 'destructive',
        Icon: ShieldAlert,
        key: 'license.status.revoked',
    },
}

export interface LicenseStatusBadgeProps {
    status: LicenseStatus
    className?: string
}

export function LicenseStatusBadge({ status, className }: LicenseStatusBadgeProps) {
    const { t } = useLicenseT()
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
            {t(meta.key)}
        </Badge>
    )
}
