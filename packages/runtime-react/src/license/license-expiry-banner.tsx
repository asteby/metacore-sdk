/**
 * Banner de vencimiento de licencia — la señal degradada que acompaña a las
 * posturas que NO bloquean la app pero exigen atención:
 *   - valid && days_remaining <= threshold  → aviso de renovación próxima
 *   - stale                                  → check-in con el hub pendiente
 *   - grace                                  → vencida, dentro de la gracia
 *   - expired                                → vencida en duro (persistente)
 *
 * Silencioso sin enforcement o si el estado aún no cargó — nunca rompe el shell.
 *
 * Descartabilidad: todas las posturas son descartables con TTL en localStorage
 * (re-aparecen pasado el TTL) MENOS `expired`, que se queda fijo como recordatorio
 * porque el backend ya bloquea escrituras nuevas.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Clock, CloudOff, X } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'
import type { LicenseState } from './types'

const DISMISS_KEY = 'license_banner_dismissed_at'
const DISMISS_TTL_MS = 12 * 60 * 60 * 1000 // re-mostrar cada 12h aunque se descarte
const UPCOMING_THRESHOLD_DAYS = 15

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ')
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
    className?: string
}

export function LicenseExpiryBanner({
    state,
    upcomingThresholdDays = UPCOMING_THRESHOLD_DAYS,
    dismissStorageKey = DISMISS_KEY,
    onManage,
    manageLabel,
    className,
}: LicenseExpiryBannerProps) {
    const { t } = useTranslation()
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === 'undefined') return false
        const raw = window.localStorage.getItem(dismissStorageKey)
        if (!raw) return false
        return Date.now() - Number(raw) < DISMISS_TTL_MS
    })

    if (!state || !state.enforced) return null

    const isUpcoming =
        state.status === 'valid' && state.days_remaining <= upcomingThresholdDays
    const isStale = state.status === 'stale'
    const isGrace = state.status === 'grace'
    const isExpired = state.status === 'expired'
    if (!isUpcoming && !isStale && !isGrace && !isExpired) return null

    // Expired no es descartable — se queda como recordatorio constante.
    if (dismissed && !isExpired) return null

    const dismiss = () => {
        setDismissed(true)
        try {
            window.localStorage.setItem(dismissStorageKey, String(Date.now()))
        } catch {
            // cuota/entorno sin storage — el descarte solo dura la sesión.
        }
    }

    const message = isExpired
        ? t('license.banner.expired', {
              defaultValue:
                  'Tu licencia venció. Algunas acciones pueden estar bloqueadas.',
          })
        : isStale
          ? t('license.banner.stale', {
                defaultValue:
                    'Esta instancia no ha podido verificar su licencia con el hub. Reconéctala para completar el check-in.',
            })
          : isGrace
            ? t('license.banner.grace', {
                  defaultValue:
                      'Tu licencia venció y está en periodo de gracia hasta {{date}} ({{days}} días restantes).',
                  date: state.grace_until
                      ? new Date(state.grace_until).toLocaleDateString()
                      : '—',
                  days: state.days_remaining,
              })
            : t('license.banner.upcoming', {
                  defaultValue: 'Tu licencia vence en {{days}} días.',
                  days: state.days_remaining,
              })

    const Icon = isExpired ? AlertTriangle : isStale ? CloudOff : Clock

    return (
        <div
            role="alert"
            data-license-status={state.status}
            className={cx(
                'flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm',
                isExpired
                    ? 'border-destructive/30 bg-destructive text-white'
                    : 'border-amber-500/30 bg-amber-500/10 text-foreground',
                className,
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{message}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {onManage && (
                    <Button
                        size="sm"
                        variant={isExpired ? 'secondary' : 'outline'}
                        onClick={onManage}
                    >
                        {manageLabel ??
                            t('license.banner.manage', {
                                defaultValue: 'Gestionar licencia',
                            })}
                    </Button>
                )}
                {!isExpired && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={dismiss}
                        title={t('license.banner.dismiss', {
                            defaultValue: 'Descartar',
                        })}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}
