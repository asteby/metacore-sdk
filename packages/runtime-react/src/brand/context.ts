/**
 * Marca del cliente como contexto puro: sin fetch, sin transporte. Quien sabe
 * de dónde sale la marca (p. ej. `PlatformConfigProvider` de
 * `@asteby/metacore-app-providers`, que la lee del backend del host) la pasa
 * a `<BrandProvider value>`; cualquier componente la lee con `useBrand()`.
 *
 * Sin provider, `useBrand()` devuelve `EMPTY_BRAND`: nombre vacío y sin logo.
 * No hay un nombre de producto fijo de respaldo: cada consumidor decide qué
 * pintar cuando el nombre está vacío (un texto neutro o nada).
 */
import { createContext, useContext, type Context } from 'react'

/** Capa de la que salió la marca, tal como la informa el backend. */
export type BrandSource = 'hub' | 'manual' | (string & {})

export interface Brand {
    /** Nombre comercial a mostrar. Vacío si no hay marca. */
    name: string
    /** URL servible del logo. Vacía si no hay. */
    logo: string
    /** URL servible del favicon. Vacía: se usa el logo. */
    favicon: string
    /** Color primario `#rrggbb`. Vacío: no se pinta. */
    primaryColor: string
    /** Color de acento `#rrggbb`. Vacío: no se pinta. */
    accentColor: string
    /** Nombre de la mascota del copiloto. Vacío si no hay. */
    mascotName: string
    /** La marca la fija la plataforma y el cliente no puede editarla. */
    locked: boolean
    /** Capa que la emitió (`hub`, `manual`…). Vacía si se desconoce. */
    source: BrandSource
}

export const EMPTY_BRAND: Readonly<Brand> = Object.freeze({
    name: '',
    logo: '',
    favicon: '',
    primaryColor: '',
    accentColor: '',
    mascotName: '',
    locked: false,
    source: '',
})

const STRING_KEYS = ['name', 'logo', 'favicon', 'primaryColor', 'accentColor', 'mascotName', 'source'] as const

/** Completa una marca parcial con los vacíos de `EMPTY_BRAND` (y recorta espacios). */
export function normalizeBrand(value: Partial<Brand> | null | undefined): Brand {
    const out: Brand = { ...EMPTY_BRAND }
    if (!value) return out
    for (const key of STRING_KEYS) {
        const v = value[key]
        if (typeof v === 'string') out[key] = v.trim()
    }
    out.locked = value.locked === true
    return out
}

// El contexto vive en globalThis: si el subpath `/brand` acaba en un chunk
// distinto del índice (pre-bundling de Vite, federación), proveedor y
// consumidores siguen compartiendo la misma instancia.
const CONTEXT_KEY = Symbol.for('@asteby/metacore-runtime-react/brand-context')
type BrandGlobal = typeof globalThis & { [CONTEXT_KEY]?: Context<Readonly<Brand>> }
const g = globalThis as BrandGlobal

export const BrandContext: Context<Readonly<Brand>> = (g[CONTEXT_KEY] ??=
    createContext<Readonly<Brand>>(EMPTY_BRAND))

/** Marca actual. Sin provider: `EMPTY_BRAND` (nombre vacío). */
export function useBrand(): Readonly<Brand> {
    return useContext(BrandContext)
}
