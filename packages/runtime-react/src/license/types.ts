/**
 * Licencia de instancia — el contrato de estado que el backend del host (ops
 * vía kernel `LicenseService`) expone y que este módulo pinta. El SDK NO habla
 * con el kernel ni impone su versión: el host resuelve el `LicenseState` con su
 * propio transporte y se lo pasa a <LicenseGate>. Así el gate es un primitivo
 * reutilizable e INDEPENDIENTE del release del kernel.
 *
 * División de responsabilidades del blindaje:
 *   - kernel  → enforcement (qué está permitido; firma/verifica el estado).
 *   - SDK     → UX (este módulo: gate, banner, badge).
 *   - hub     → emisión (mintea el token Ed25519).
 *   - hosts   → wiring (resuelven el estado y montan <LicenseGate> en 1 línea).
 */

/** El estado operativo de la licencia, tal como lo deriva el backend. */
export type LicenseStatus =
    | 'valid'
    | 'stale'
    | 'grace'
    | 'expired'
    | 'missing'
    | 'invalid'

export interface LicenseState {
    /** Licensing activo en esta instancia (LICENSING_ENFORCE). Si es false el
     * gate es transparente: nunca bloquea ni degrada. */
    enforced: boolean
    configured: boolean
    valid: boolean
    status: LicenseStatus
    reason?: string
    org_id?: string
    plan?: string
    preset?: string
    entitlements: string[]
    wildcard: boolean
    /** Lease: la instancia falló su check-in obligatorio con el hub. */
    stale: boolean
    max_offline_hours?: number
    issued_at?: string
    expires_at?: string
    in_grace: boolean
    grace_until?: string
    days_remaining: number
    last_checked_at?: string
}

/** La licencia es OPERABLE cuando permite operar (aunque sea degradada):
 * valid, la postura `stale` del lease, o dentro de la ventana de gracia.
 * missing/invalid/expired no son operables. Sin enforcement → siempre operable.
 * Espeja `State.Operable()` del backend. */
export function isLicenseOperable(state: LicenseState | undefined): boolean {
    if (!state || !state.enforced) return true
    return state.valid || state.in_grace
}

/** La instancia debe BLOQUEARSE tras el modal de activación cuando hay
 * enforcement y la licencia es missing/invalid/expired (pasada la gracia).
 * grace/stale degradan con banner en vez de bloquear. Espeja `State.Blocking()`.
 * Mientras el estado aún carga (undefined) NO bloquea: fail-open en la UI para
 * que un check lento/fallido nunca destelle un candado sobre la app. */
export function isLicenseBlocking(state: LicenseState | undefined): boolean {
    if (!state || !state.enforced) return false
    return !isLicenseOperable(state)
}

/** Un preset/vertical está habilitado si la licencia otorga wildcard o lo lista
 * explícitamente. Sin enforcement → todo habilitado. */
export function isPresetEntitled(
    state: LicenseState | undefined,
    presetKey: string,
): boolean {
    if (!state || !state.enforced) return true
    if (state.wildcard) return true
    return state.entitlements?.includes(presetKey) ?? false
}

/** Marca trial vencido: el copy del gate cambia a "tu prueba terminó". */
export function isTrialExpired(state: LicenseState | undefined): boolean {
    return !!state && state.plan === 'trial' && state.status === 'expired'
}

/** Branding opcional para teñir el gate/banner. El host lo pasa desde su
 * PlatformConfig del SDK (o cualquier fuente); sin él, fallback neutro. */
export interface LicenseBranding {
    /** Nombre de la plataforma/tenant, para el encabezado del gate. */
    name?: string
    /** URL del logo (se embebe como <img>). */
    logo?: string
}
