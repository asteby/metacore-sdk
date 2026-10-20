/**
 * Una sola derivación del estado de licencia a "qué muestra la UI". Gate, banner
 * y pantallas del host la comparten, así que todos cuentan lo mismo.
 *
 * Estados (solo con enforcement; sin él no hay vista):
 *   valid            vigente
 *   expiring         vigente, por vencer (≤ umbral de días)
 *   grace            vencida, dentro de la gracia (se puede operar)
 *   expired          vencida: solo lectura con exportación (`on_expiry: read_only`)
 *                    o bloqueo con modal (política clásica)
 *   revoked          desactivada por el emisor: solo lectura un tiempo corto y luego modal
 *   hub_unreachable  sin contacto con el hub pero con lease vigente: opera; avisa solo al dueño
 *   missing/invalid  sin licencia o no válida: modal de activación
 * Además, `cloned` (licencia vista en otro servidor) es un aviso al dueño que se
 * suma a cualquiera de los anteriores.
 */
import { isLicenseBlocking, isLicenseReadOnly, isTrialExpired, type LicenseState } from './types'

export type LicenseCondition =
    | 'valid'
    | 'expiring'
    | 'grace'
    | 'expired'
    | 'revoked'
    | 'hub_unreachable'
    | 'missing'
    | 'invalid'

export type LicenseSeverity = 'ok' | 'notice' | 'warning' | 'critical'

export interface LicenseView {
    condition: LicenseCondition
    severity: LicenseSeverity
    /** Modal bloqueante de pantalla completa. */
    blocking: boolean
    /** La app sigue abierta pero el backend rechaza escrituras (consultar y exportar). */
    readOnly: boolean
    /** El aviso es solo para el dueño/superadmin; el resto de usuarios no lo ve. */
    ownerOnly: boolean
    /** Licencia vista activa en otro servidor (aviso al dueño, no bloquea). */
    cloned: boolean
    trialExpired: boolean
}

export const CLONE_NOTICE = 'clone_suspected'

export function isLicenseCloned(state: LicenseState | undefined): boolean {
    return !!state?.enforced && !!state.notices?.includes(CLONE_NOTICE)
}

export function deriveLicenseView(
    state: LicenseState | undefined,
    opts: { upcomingThresholdDays?: number } = {},
): LicenseView | undefined {
    if (!state || !state.enforced) return undefined
    const threshold = opts.upcomingThresholdDays ?? 15
    const blocking = isLicenseBlocking(state)
    const readOnly = isLicenseReadOnly(state)
    const base = {
        blocking,
        readOnly,
        ownerOnly: false,
        cloned: isLicenseCloned(state),
        trialExpired: isTrialExpired(state),
    }
    switch (state.status) {
        case 'missing':
            return { ...base, condition: 'missing', severity: 'critical' }
        case 'invalid':
            return { ...base, condition: 'invalid', severity: 'critical' }
        case 'revoked':
            return { ...base, condition: 'revoked', severity: 'critical' }
        case 'expired':
            return { ...base, condition: 'expired', severity: 'critical' }
        case 'grace':
            return { ...base, condition: 'grace', severity: 'warning' }
        case 'stale':
            return { ...base, condition: 'hub_unreachable', severity: 'notice', ownerOnly: true }
        default:
            if (state.days_remaining <= threshold) {
                return { ...base, condition: 'expiring', severity: 'warning' }
            }
            return { ...base, condition: 'valid', severity: 'ok' }
    }
}

/** Texto de contacto de una línea ("Ana · ana@x.mx · +52…") o undefined. */
export function sellerContactLine(state: LicenseState | undefined): string | undefined {
    const s = state?.seller
    if (!s) return undefined
    const parts = [s.email, s.phone, s.url].map((p) => p?.trim()).filter(Boolean) as string[]
    return parts.length ? parts.join(' · ') : undefined
}
