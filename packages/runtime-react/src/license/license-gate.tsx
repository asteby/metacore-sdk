/**
 * <LicenseGate> — el primitivo del blindaje. Un host lo monta en UNA línea
 * envolviendo su app autenticada:
 *
 *   <LicenseGate state={state} onActivate={activate}>
 *     <AppShell />
 *   </LicenseGate>
 *
 * Comportamiento según el estado (resuelto por el backend del host):
 *   - Sin enforcement, o estado operable (valid/stale/grace) → renderiza children.
 *     stale/grace además montan el <LicenseExpiryBanner> degradado por encima.
 *   - enforcement && missing/invalid/expired → modal BLOQUEANTE full-screen,
 *     no descartable, con el formulario de activación. Al activar con éxito el
 *     host refresca el estado y el gate se abre sin recargar.
 *
 * Es branding-aware si el host pasa `branding` (logo/nombre desde el
 * PlatformConfig del SDK); si no, cae a un encabezado neutro.
 *
 * INDEPENDIENTE del kernel: no importa su cliente ni fija su versión. Solo
 * consume `LicenseState` y una promesa `onActivate`.
 */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, Clock, Loader2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import {
    isLicenseBlocking,
    isTrialExpired,
    type LicenseState,
    type LicenseBranding,
} from './types'
import { LicenseStatusBadge } from './license-status-badge'
import { LicenseExpiryBanner } from './license-expiry-banner'

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ')
}

export interface LicenseGateProps {
    /** Estado actual, resuelto por el backend del host. `undefined` mientras
     * carga → fail-open (renderiza children, nunca destella el candado). */
    state: LicenseState | undefined
    /** Activa una licencia con el código/token pegado. Resuelve → el host
     * refresca `state` y el gate se abre. Rechaza con un Error cuyo `message`
     * se muestra al usuario. */
    onActivate: (code: string) => Promise<void>
    children: ReactNode
    /** Branding opcional (logo/nombre) para el encabezado del modal. */
    branding?: LicenseBranding
    /** Acción "Gestionar licencia" del banner degradado (opcional). */
    onManage?: () => void
    /** Si el usuario actual puede activar la licencia (p. ej. Platform Root /
     * superadmin). Default true — backward-compatible. Cuando es false, el modal
     * bloqueante se muestra SIN el formulario de activación y en su lugar
     * aparece `readOnlyMessage`. */
    canActivate?: boolean
    /** Mensaje mostrado en el modal bloqueante cuando `canActivate` es false. */
    readOnlyMessage?: string
    className?: string
}

export function LicenseGate({
    state,
    onActivate,
    children,
    branding,
    onManage,
    canActivate = true,
    readOnlyMessage,
    className,
}: LicenseGateProps) {
    const blocking = isLicenseBlocking(state)

    return (
        <>
            {/* stale/grace/upcoming degradan con banner; el propio banner
                decide si mostrarse. Bloqueado → no hace falta, el modal manda. */}
            {!blocking && (
                <LicenseExpiryBanner state={state} onManage={onManage} />
            )}
            {children}
            {blocking && state && (
                <LicenseGateModal
                    state={state}
                    onActivate={onActivate}
                    branding={branding}
                    canActivate={canActivate}
                    readOnlyMessage={readOnlyMessage}
                    className={className}
                />
            )}
        </>
    )
}

interface LicenseGateModalProps {
    state: LicenseState
    onActivate: (code: string) => Promise<void>
    branding?: LicenseBranding
    canActivate: boolean
    readOnlyMessage?: string
    className?: string
}

function LicenseGateModal({
    state,
    onActivate,
    branding,
    canActivate,
    readOnlyMessage,
    className,
}: LicenseGateModalProps) {
    const { t } = useTranslation()
    const [code, setCode] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const trialExpired = isTrialExpired(state)

    const title = trialExpired
        ? t('license.gate.trial_title', {
              defaultValue: 'Tu prueba gratuita terminó',
          })
        : t('license.gate.title', { defaultValue: 'Activa tu licencia' })

    const description = trialExpired
        ? t('license.gate.trial_description', {
              defaultValue:
                  'Tu prueba gratuita terminó. Activa una licencia para continuar. Pega tu clave (lic_…) o el token firmado que te entregaron.',
          })
        : state.status === 'expired'
          ? t('license.gate.expired_description', {
                defaultValue:
                    'Tu licencia venció y el periodo de gracia terminó. Activa una licencia vigente para seguir operando. Pega tu clave (lic_…) o el token firmado.',
            })
          : state.status === 'invalid'
            ? t('license.gate.invalid_description', {
                  defaultValue:
                      'La licencia de esta instancia no es válida. Pega una clave (lic_…) o el token firmado que te entregó tu proveedor para reactivarla.',
              })
            : t('license.gate.missing_description', {
                  defaultValue:
                      'Esta instancia necesita una licencia activa para operar. Pega tu clave (lic_…) o el token firmado para activarla.',
              })

    const canSubmit = code.trim().length > 0 && !submitting

    const submit = async () => {
        if (!canSubmit) return
        setSubmitting(true)
        setError(null)
        try {
            await onActivate(code.trim())
            // Éxito → el host refresca `state`; el gate se re-renderiza y este
            // modal se desmonta solo. No recargamos.
        } catch (e) {
            const message =
                e instanceof Error && e.message
                    ? e.message
                    : t('license.gate.activate_error', {
                          defaultValue: 'No se pudo activar la licencia.',
                      })
            setError(message)
            setSubmitting(false)
        }
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-gate-title"
            data-license-status={state.status}
            className={cx(
                'fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm',
                className,
            )}
        >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl">
                <div className="flex flex-col gap-4 p-6">
                    <div className="flex items-start gap-3">
                        {branding?.logo ? (
                            <img
                                src={branding.logo}
                                alt={branding.name ?? ''}
                                className="h-10 w-10 shrink-0 rounded-xl object-contain"
                            />
                        ) : (
                            <div
                                className={cx(
                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                    trialExpired
                                        ? 'bg-primary/10 text-primary'
                                        : 'bg-destructive/10 text-destructive',
                                )}
                            >
                                {trialExpired ? (
                                    <Clock className="h-5 w-5" aria-hidden />
                                ) : (
                                    <ShieldAlert className="h-5 w-5" aria-hidden />
                                )}
                            </div>
                        )}
                        <div className="flex min-w-0 flex-col gap-1">
                            <h2
                                id="license-gate-title"
                                className="text-lg leading-tight font-semibold"
                            >
                                {title}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <LicenseStatusBadge status={state.status} />
                                <span className="text-muted-foreground text-xs">
                                    {branding?.name
                                        ? branding.name
                                        : t('license.gate.instance', {
                                              defaultValue: 'Esta instancia',
                                          })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <p className="text-muted-foreground text-sm">{description}</p>

                    {state.reason && (
                        <p className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
                            {state.reason}
                        </p>
                    )}

                    {!canActivate ? (
                        <p
                            role="note"
                            className="border-border bg-muted/40 text-muted-foreground rounded-md border px-3 py-3 text-sm"
                        >
                            {readOnlyMessage ??
                                t('license.gate.read_only', {
                                    defaultValue:
                                        'Contacta al administrador de la plataforma para activar la licencia.',
                                })}
                        </p>
                    ) : (
                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                            e.preventDefault()
                            void submit()
                        }}
                    >
                        <label
                            htmlFor="license-gate-code"
                            className="text-sm font-medium"
                        >
                            {t('license.gate.code_label', {
                                defaultValue: 'Clave o token de licencia',
                            })}
                        </label>
                        <Input
                            id="license-gate-code"
                            autoFocus
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={t('license.gate.code_placeholder', {
                                defaultValue: 'lic_… o pega el token firmado',
                            })}
                            value={code}
                            disabled={submitting}
                            aria-invalid={error ? true : undefined}
                            onChange={(e) => {
                                setCode(e.target.value)
                                if (error) setError(null)
                            }}
                        />
                        {error && (
                            <p role="alert" className="text-destructive text-sm">
                                {error}
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="mt-1 w-full"
                            disabled={!canSubmit}
                        >
                            {submitting && (
                                <Loader2
                                    className="h-4 w-4 animate-spin"
                                    aria-hidden
                                />
                            )}
                            {submitting
                                ? t('license.gate.activating', {
                                      defaultValue: 'Activando…',
                                  })
                                : t('license.gate.activate', {
                                      defaultValue: 'Activar licencia',
                                  })}
                        </Button>
                    </form>
                    )}
                </div>
            </div>
        </div>
    )
}
