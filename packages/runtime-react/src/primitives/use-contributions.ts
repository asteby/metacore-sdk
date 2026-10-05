// Hooks de React sobre el registro de contribuciones (contributions.ts).
// La lógica vive en las funciones puras; aquí solo se conecta con
// useInstalledAddons y con la suscripción para re-pintar cuando un remote
// registra o se desmonta.
import { useMemo, useSyncExternalStore } from 'react'
import { useInstalledAddons, type InstalledAddonsValue } from '../installed-addons-context'
import {
    contributionsVersion,
    resolveContributions,
    subscribeContributions,
    type DocumentEditorContext,
    type DocumentRegion,
    type IsAddonInstalled,
    type ResolvedDocumentContribution,
} from './contributions'

/**
 * Predicado de instalación a partir del InstalledAddonsProvider. Sin provider
 * devuelve siempre true: el host solo carga remotes de addons instalados, así
 * que si la contribución existe, su addon está (el servidor revalida igual).
 */
export function installedPredicate(value: InstalledAddonsValue | null): IsAddonInstalled {
    return value ? (key: string) => value.addons.has(key) : () => true
}

/** `installedPredicate(useInstalledAddons())`, estable entre renders. */
export function useIsAddonInstalled(): IsAddonInstalled {
    const value = useInstalledAddons()
    return useMemo(() => installedPredicate(value), [value])
}

/** Re-pinta en cada register/dispose de contribuciones o modales federados. */
export function useContributionsVersion(): number {
    return useSyncExternalStore(subscribeContributions, contributionsVersion, contributionsVersion)
}

/** Contribuciones aplicables a `region` del documento `ctx` (ya filtradas y ordenadas). */
export function useDocumentContributions(ctx: DocumentEditorContext, region: DocumentRegion): ResolvedDocumentContribution<any>[] {
    useContributionsVersion()
    const isInstalled = useIsAddonInstalled()
    return resolveContributions(ctx, region, isInstalled)
}
