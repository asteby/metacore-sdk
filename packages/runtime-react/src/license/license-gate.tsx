/**
 * <LicenseGate> — el primitivo del blindaje. Un host lo monta en UNA línea
 * envolviendo su app autenticada:
 *
 *   <LicenseGate state={state} onActivate={activate}>
 *     <AppShell />
 *   </LicenseGate>
 *
 * Comportamiento según el estado (resuelto por el backend del host; la lógica de
 * qué significa cada estado vive en `deriveLicenseView`):
 *   - Sin enforcement, o estado operable (valid/stale/grace) → renderiza children.
 *     Los estados que piden atención montan el <LicenseExpiryBanner> por encima:
 *     por vencer, gracia, hub caído (solo dueño), clonada (solo dueño) y las
 *     licencias en solo lectura (vencida o desactivada con plazo), que además
 *     ofrecen exportar los datos si el host pasa `onExport`.
 *   - Sin licencia, no válida, desactivada o vencida sin solo lectura → modal
 *     BLOQUEANTE full-screen, no descartable, con el formulario de activación
 *     (enlace, código o clave) y el contacto del vendedor si la licencia lo trae.
 *     Al activar con éxito el host refresca el estado y el gate se abre sin recargar.
 *
 * El modal es un diálogo con encabezado y pie fijos: solo el cuerpo se desplaza,
 * así el botón de activar nunca queda fuera de pantalla en un teléfono.
 *
 * Es branding-aware si el host pasa `branding` (logo/nombre desde el
 * PlatformConfig del SDK); si no, cae a un encabezado neutro.
 *
 * INDEPENDIENTE del kernel: no importa su cliente ni fija su versión. Solo
 * consume `LicenseState` y una promesa `onActivate`.
 */
import { createPortal } from 'react-dom'
import { useState, type ReactNode } from 'react'
import { ShieldAlert, Clock, Loader2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { type LicenseState, type LicenseBranding } from './types'
import { deriveLicenseView, sellerContactLine } from './view'
import { formatLicenseDate } from './messages'
import { useLicenseT } from './use-license-t'
import { LicenseStatusBadge } from './license-status-badge'
import { LicenseExpiryBanner } from './license-expiry-banner'

function cx(...parts: Array<string | false | undefined>): string {
    return parts.filter(Boolean).join(' ')
}

export interface LicenseGateProps {
    /** Estado actual, resuelto por el backend del host. `undefined` mientras
     * carga → fail-open (renderiza children, nunca destella el candado). */
    state: LicenseState | undefined
    /** Activa una licencia con el enlace, código o clave pegados. Resuelve → el
     * host refresca `state` y el gate se abre. Rechaza con un Error cuyo
     * `message` se muestra al usuario; si el Error trae `code` (el código estable
     * del hub, p. ej. `activation_used`) se muestra el texto localizado de ese caso. */
    onActivate: (code: string) => Promise<void>
    children: ReactNode
    /** Branding opcional (logo/nombre) para el encabezado del modal. */
    branding?: LicenseBranding
    /** Acción "Gestionar licencia" del banner degradado (opcional). */
    onManage?: () => void
    /** Exportar los datos: se ofrece en el banner de solo lectura y en el pie del
     * modal de una licencia vencida. Sin él no se muestra el botón. */
    onExport?: () => void
    /** El usuario actual es el dueño/superadmin. Los avisos de hub caído y de
     * clonado son solo para él. Default true. */
    isOwner?: boolean
    /** El host acepta enlaces de activación (acs_…) además de lic_…: cambia la
     * etiqueta y el ejemplo del campo. Default false (texto clásico). */
    acceptsActivationLink?: boolean
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
    onExport,
    isOwner = true,
    acceptsActivationLink = false,
    canActivate = true,
    readOnlyMessage,
    className,
}: LicenseGateProps) {
    const view = deriveLicenseView(state)
    const blocking = !!view?.blocking

    return (
        <>
            {/* Los estados que no bloquean degradan con banner; el propio banner
                decide si mostrarse. Bloqueado → no hace falta, el modal manda. */}
            {!blocking && (
                <LicenseExpiryBanner
                    state={state}
                    onManage={onManage}
                    onExport={onExport}
                    isOwner={isOwner}
                />
            )}
            {children}
            {blocking && state && (
                <LicenseGateModal
                    state={state}
                    onActivate={onActivate}
                    branding={branding}
                    canActivate={canActivate}
                    readOnlyMessage={readOnlyMessage}
                    acceptsActivationLink={acceptsActivationLink}
                    onExport={onExport}
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
    acceptsActivationLink: boolean
    onExport?: () => void
    className?: string
}

const FORM_ID = 'license-gate-form'

function LicenseGateModal({
    state,
    onActivate,
    branding,
    canActivate,
    readOnlyMessage,
    acceptsActivationLink,
    onExport,
    className,
}: LicenseGateModalProps) {
    const { t, lang } = useLicenseT()
    const [code, setCode] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const view = deriveLicenseView(state)
    const trialExpired = !!view?.trialExpired
    const revoked = state.status === 'revoked'
    const expired = state.status === 'expired'
    const provider = t('license.gate.provider')
    const who = state.seller?.name?.trim() || provider
    const expiredOn = formatLicenseDate(state.expires_at, lang)
    const contact = sellerContactLine(state)

    const title = trialExpired
        ? t('license.gate.trial_title')
        : revoked
          ? t('license.gate.revoked_title')
          : expired
            ? t('license.gate.expired_title')
            : t('license.gate.title')

    const description = trialExpired
        ? t('license.gate.trial_description')
        : revoked
          ? t('license.gate.revoked_description', { who })
          : expired
            ? expiredOn
                ? t('license.gate.expired_description', { date: expiredOn })
                : t('license.gate.expired_description_nodate')
            : state.status === 'invalid'
              ? t('license.gate.invalid_description')
              : t('license.gate.missing_description')

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
            const hubCode = (e as { code?: string } | null)?.code
            const known = hubCode && LICENSE_LINK_CODES.has(hubCode) ? t(`license.link.${hubCode}`) : null
            const message =
                known ??
                (e instanceof Error && e.message ? e.message : t('license.gate.activate_error'))
            setError(message)
            setSubmitting(false)
        }
    }

    // In <body>: mounted inside a glass panel (backdrop-filter), a fixed veil
    // would cover only that panel.
    return createPortal(
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
            {/* Encabezado y pie fijos; solo el cuerpo se desplaza. */}
            <div className="bg-card text-card-foreground flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl">
                <header
                    data-license-part="header"
                    className="flex shrink-0 items-start gap-3 border-b p-6 pb-4"
                >
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
                        <h2 id="license-gate-title" className="text-lg leading-tight font-semibold">
                            {title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <LicenseStatusBadge status={state.status} />
                            <span className="text-muted-foreground text-xs">
                                {branding?.name ? branding.name : t('license.gate.instance')}
                            </span>
                        </div>
                    </div>
                </header>

                <div
                    data-license-part="body"
                    className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
                >
                    <p className="text-muted-foreground text-sm">{description}</p>

                    {state.reason && (
                        <p className="bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-xs">
                            {state.reason}
                        </p>
                    )}

                    {contact && (
                        <p
                            data-license-part="seller"
                            className="border-border bg-muted/40 rounded-md border px-3 py-2 text-sm"
                        >
                            <span className="text-muted-foreground">
                                {t('license.gate.contact_label')}:{' '}
                            </span>
                            {state.seller?.name ? <strong>{state.seller.name}</strong> : null}
                            {state.seller?.name ? ' · ' : null}
                            {contact}
                        </p>
                    )}

                    {!canActivate ? (
                        <p
                            role="note"
                            className="border-border bg-muted/40 text-muted-foreground rounded-md border px-3 py-3 text-sm"
                        >
                            {readOnlyMessage ?? t('license.gate.read_only')}
                        </p>
                    ) : (
                        <form
                            id={FORM_ID}
                            className="flex flex-col gap-2"
                            onSubmit={(e) => {
                                e.preventDefault()
                                void submit()
                            }}
                        >
                            <label htmlFor="license-gate-code" className="text-sm font-medium">
                                {acceptsActivationLink
                                    ? t('license.gate.code_label_link')
                                    : t('license.gate.code_label')}
                            </label>
                            <Input
                                id="license-gate-code"
                                autoFocus
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={
                                    acceptsActivationLink
                                        ? t('license.gate.code_placeholder_link')
                                        : t('license.gate.code_placeholder')
                                }
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
                        </form>
                    )}
                </div>

                {(canActivate || (expired && onExport)) && (
                    <footer
                        data-license-part="footer"
                        className="flex shrink-0 flex-col gap-2 border-t p-6 pt-4 sm:flex-row-reverse"
                    >
                        {canActivate && (
                            <Button
                                type="submit"
                                form={FORM_ID}
                                className="w-full sm:w-auto"
                                disabled={!canSubmit}
                            >
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                {submitting ? t('license.gate.activating') : t('license.gate.activate')}
                            </Button>
                        )}
                        {expired && onExport && (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={onExport}
                            >
                                {t('license.gate.export')}
                            </Button>
                        )}
                    </footer>
                )}
            </div>
        </div>,
        document.body,
    )
}

const LICENSE_LINK_CODES = new Set([
    'activation_not_found',
    'activation_used',
    'activation_conflict',
    'activation_expired',
    'activation_revoked',
    'license_revoked',
    'license_expired',
    'rate_limited',
])
