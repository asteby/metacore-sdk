// LoomProvider — lo que el anfitrión sabe para resolver seams: los injertos que
// el SERVIDOR autorizó (respuesta de GET /api/ui/grafts, ver RFC 0005 §5), flags,
// ajustes de la organización y el canal de telemetría. Sin provider, <Seam> sólo
// monta injertos registrados en proceso (código local de confianza).
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { GraftDef, LoomEvent } from './types'

export interface LoomConfig {
    /** Injertos servidos por el servidor (ya filtrados por RBAC/ajustes/preset). */
    grafts: readonly GraftDef[]
    /**
     * Si es true, sólo se montan injertos cuyo id está en `grafts` (los registrados en proceso
     * sin autorización del servidor se explican como `not_granted`).
     */
    serverAuthoritative: boolean
    flags?: ReadonlySet<string>
    settings?: Readonly<Record<string, unknown>>
    onEvent?: (e: LoomEvent) => void
    /** Pinta el inspector de seams (desarrollo). */
    inspect?: boolean
}

const Ctx = createContext<LoomConfig | null>(null)

export interface LoomProviderProps {
    grafts?: readonly GraftDef[]
    serverAuthoritative?: boolean
    flags?: Iterable<string>
    settings?: Readonly<Record<string, unknown>>
    onEvent?: (e: LoomEvent) => void
    inspect?: boolean
    children?: ReactNode
}

export function LoomProvider({
    grafts = [],
    serverAuthoritative = false,
    flags,
    settings,
    onEvent,
    inspect = false,
    children,
}: LoomProviderProps) {
    const onEventRef = useRef(onEvent)
    onEventRef.current = onEvent
    const flagKey = flags ? [...flags].sort().join(',') : ''
    const value = useMemo<LoomConfig>(
        () => ({
            grafts,
            serverAuthoritative,
            flags: new Set(flagKey ? flagKey.split(',') : []),
            settings,
            inspect,
            onEvent: (e) => {
                try {
                    onEventRef.current?.(e)
                } catch {
                    /* un reporter roto no tumba al anfitrión */
                }
            },
        }),
        [grafts, serverAuthoritative, flagKey, settings, inspect],
    )
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLoomConfig(): LoomConfig | null {
    return useContext(Ctx)
}
