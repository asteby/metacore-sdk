// InstalledAddonsProvider / useAddonInstalled / useCapabilityProvided —
// primitivo ÚNICO de "¿qué hay instalado?" para hosts y addons.
//
// Hoy cada addon lo resuelve a su manera: POS lee `installedAddons` del host
// (lib/host.ts addonKnownMissing), sondea `/options/<Model>` (use-model-available:
// 403/404 = ausente) o hardcodea claves (caja-policy useAnyFiscalAddonInstalled);
// `useInstalledAddons` vive sólo en @asteby/metacore-marketplace. Esto lo sube a
// runtime-react con dos niveles:
//   - addon key  (useAddonInstalled('fiscal_mexico'))
//   - capability (useCapabilityProvided('fiscal.invoice_issuer')) — contrato
//     independiente del país/vertical: fiscal_mexico, fiscal_colombia… lo proveen
//     vía manifest `provides_capabilities`; caja pregunta por la capacidad,
//     no por la clave del addon.
// Fuente: el host monta el provider con lo que ya trae su bootstrap
// (installed addons + provides_capabilities del manifest). Sin provider:
// `undefined` = desconocido (el consumidor decide; NUNCA asume ausente).
import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface InstalledAddonsValue {
    addons: ReadonlySet<string>
    capabilities: ReadonlySet<string>
}

const Ctx = createContext<InstalledAddonsValue | null>(null)

export function InstalledAddonsProvider({
    addons,
    capabilities = [],
    children,
}: {
    addons: readonly string[]
    capabilities?: readonly string[]
    children: ReactNode
}) {
    const aKey = [...addons].sort().join(',')
    const cKey = [...capabilities].sort().join(',')
    const value = useMemo<InstalledAddonsValue>(
        () => ({ addons: new Set(addons), capabilities: new Set(capabilities) }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [aKey, cKey],
    )
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** true/false si el host lo sabe; undefined si no hay provider. */
export function useAddonInstalled(key: string): boolean | undefined {
    const v = useContext(Ctx)
    return v ? v.addons.has(key) : undefined
}

export function useCapabilityProvided(capability: string): boolean | undefined {
    const v = useContext(Ctx)
    return v ? v.capabilities.has(capability) : undefined
}

export function useInstalledAddons(): InstalledAddonsValue | null {
    return useContext(Ctx)
}
