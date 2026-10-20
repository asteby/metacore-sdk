/**
 * Banner de licencia — la señal que acompaña a los estados que NO bloquean la
 * app pero piden atención (ver `deriveLicenseView`):
 *   - por vencer           aviso de renovación próxima
 *   - en gracia            vencida, todavía se puede operar
 *   - vencida (solo lectura) / desactivada con plazo: se consulta y se exporta
 *   - hub caído            sin contacto con el hub pero opera con su lease (solo dueño)
 *   - clonada              licencia vista en otro servidor (solo dueño)
 *
 * Silencioso sin enforcement o si el estado aún no cargó — nunca rompe el shell.
 * Descartable con TTL en localStorage, MENOS los estados de solo lectura, que se
 * quedan fijos porque el backend ya rechaza escrituras nuevas.
 *
 * Cuando la licencia trae el contacto del vendedor, se muestra en el propio aviso.
 */
import { useState } from 'react'
import { AlertTriangle, Clock, CloudOff, Copy, X } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'
import { formatLicenseDate } from './messages'
import { deriveLicenseView, sellerContactLine } from './view'
import { useLicenseT } from './use-license-t'
import type { LicenseState } from './types'

const DISMISS_KEY = 'license_banner_dismissed_at'
const DISMISS_TTL_MS = 12 * 60 * 60 * 1000 // re-mostrar cada 12h aunque se descarte
const UPCOMING_THRESHOLD_DAYS = 15

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ')
}

function readDismissed(key: string): boolean {
    try {
        if (typeof window === 'undefined') return false
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        return Date.now() - Number(raw) < DISMISS_TTL_MS
    } catch {
        return false // sin storage (modo privado, SSR): el aviso se muestra
    }
}

export interface LicenseExpiryBannerProps {
    state: LicenseState | undefined
    /** Días de anticipación para el aviso de renovación. Default 15. */
    upcomingThresholdDays?: number
    /** Clave localStorage para recordar el descarte. */
    dismissStorageKey?: string
    /** Acción "Gestionar licencia" — el host enruta a sus Ajustes. Si se omite,
     * no se muestra el botón (el gate no asume rutas del host). */
    onManage?: () => void
    /** Etiqueta del botón de gestión (default localizado). */
    manageLabel?: string
    /** Exportar los datos (solo lectura): el host abre su flujo de exportación.
     * Sin él, no se muestra el botón. */
    onExport?: () => void
    /** El usuario actual es el dueño/superadmin de la instancia. Los avisos de
     * hub caído y de clonado son solo para él. Default false: un host que no
     * informa el rol nunca los muestra a usuarios que no son dueños. */
    isOwner?: boolean
    className?: string
}

export function LicenseExpiryBanner({
    state,
    upcomingThresholdDays = UPCOMING_THRESHOLD_DAYS,
    dismissStorageKey = DISMISS_KEY,
    onManage,
    manageLabel,
    onExport,
    isOwner = false,
    className,
}: LicenseExpiryBannerProps) {
    const { t, lang } = useLicenseT()
    const [dismissed, setDismissed] = useState(() => readDismissed(dismissStorageKey))

    const view = deriveLicenseView(state, { upcomingThresholdDays })
    if (!state || !view) return null

    const showMain =
        view.condition === 'expiring' ||
        view.condition === 'grace' ||
        view.condition === 'hub_unreachable' ||
        (view.condition === 'expired' && view.readOnly) ||
        (view.condition === 'revoked' && view.readOnly) ||
        // expired en modo bloqueo se pinta aquí solo si el host no monta el gate.
        (view.condition === 'expired' && !view.readOnly)
    const showClone = view.cloned && isOwner
    const sticky = view.readOnly || view.condition === 'expired'
    // El descarte solo oculta la fila principal no fija; la fila de clonado
    // nunca se descarta con ella (un aviso menor no puede apagar el de clonado).
    const mainVisible = showMain && !(view.ownerOnly && !isOwner) && !(dismissed && !sticky)
    if (!mainVisible && !showClone) return null

    const dismiss = () => {
        setDismissed(true)
        try {
            window.localStorage.setItem(dismissStorageKey, String(Date.now()))
        } catch {
            // cuota/entorno sin storage — el descarte solo dura la sesión.
        }
    }

    const provider = t('license.banner.provider')
    const who = state.seller?.name?.trim() || provider
    const whoCap = state.seller?.name?.trim() || t('license.gate.provider')
    const contact = sellerContactLine(state)
    const expiredOn = formatLicenseDate(state.expires_at, lang)
    const graceUntil = formatLicenseDate(state.grace_until, lang)
    const lastSeen = formatLicenseDate(state.last_checked_at, lang)

    const mainMessage = ((): string => {
        switch (view.condition) {
            case 'expiring':
                return state.days_remaining <= 0
                    ? t('license.banner.upcoming_today')
                    : state.days_remaining === 1
                      ? t('license.banner.upcoming_one')
                      : t('license.banner.upcoming', { days: state.days_remaining })
            case 'grace':
                return expiredOn
                    ? t('license.banner.grace', { date: expiredOn, days: state.days_remaining })
                    : t('license.banner.grace_nodate', { days: state.days_remaining })
            case 'expired':
                if (!view.readOnly) return t('license.banner.expired')
                return expiredOn
                    ? t('license.banner.expired_read_only', { date: expiredOn })
                    : t('license.banner.expired_read_only_nodate')
            case 'revoked':
                return graceUntil
                    ? t('license.banner.revoked', { who: whoCap, date: graceUntil })
                    : t('license.banner.revoked_nodate', { who: whoCap })
            default: // hub_unreachable
                return lastSeen
                    ? t('license.banner.stale', { date: lastSeen })
                    : t('license.banner.stale_nodate')
        }
    })()

    const critical = view.severity === 'critical'
    const rows: Array<{ id: string; message: string; Icon: typeof Clock; critical: boolean }> = []
    if (mainVisible) {
        rows.push({
            id: 'main',
            message: mainMessage,
            Icon: critical ? AlertTriangle : view.condition === 'hub_unreachable' ? CloudOff : Clock,
            critical,
        })
    }
    if (showClone) {
        rows.push({
            id: 'clone',
            message: t('license.banner.cloned', { who }),
            Icon: Copy,
            critical: false,
        })
    }

    return (
        <div data-license-status={state.status} data-license-condition={view.condition} className={className}>
            {rows.map((row, i) => (
                <div
                    key={row.id}
                    role="alert"
                    data-license-row={row.id}
                    className={cx(
                        'flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm',
                        row.critical
                            ? 'border-destructive/30 bg-destructive text-white'
                            : 'border-amber-500/30 bg-amber-500/10 text-foreground',
                    )}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <row.Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0">
                            {row.message}
                            {row.id === 'main' && contact && (view.condition === 'expired' || view.condition === 'revoked' || view.condition === 'grace') && (
                                <span className="ml-1 opacity-90">
                                    {t('license.banner.contact', { contact: `${state.seller?.name ? `${state.seller.name} · ` : ''}${contact}` })}
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {i === 0 && onExport && view.readOnly && (
                            <Button size="sm" variant="secondary" onClick={onExport}>
                                {t('license.banner.export')}
                            </Button>
                        )}
                        {i === 0 && onManage && (
                            <Button size="sm" variant={row.critical ? 'secondary' : 'outline'} onClick={onManage}>
                                {manageLabel ?? t('license.banner.manage')}
                            </Button>
                        )}
                        {row.id === 'main' && !sticky && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={dismiss}
                                title={t('license.banner.dismiss')}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

