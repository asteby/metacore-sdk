// useAddonSettings — THE standard primitive for reading an addon's
// per-organization configuration from a federated addon (or any host
// surface) without every addon re-implementing its own fetch.
//
// The host (ops) persists settings per org on `AddonInstallation.settings`
// (jsonb) and exposes:
//   GET  /api/addons/:key/settings  → { success, data: { <key>: <value> } }
//   PUT  /api/addons/:key/settings  → body = object of values
// A setting the org has never saved simply isn't present in `data`; the
// caller supplies the fallback via `opts.defaults` (which mirror the
// manifest's `settings[].default`). runtime-react has no access to the
// addon manifest at runtime, so defaults are a parameter, not automatic.
//
// react-query is a PEER dependency of runtime-react: `useQuery`/`useMutation`
// resolve to the HOST's singleton QueryClient (the MF shared singleton), so
// this hook never constructs its own client and stays cache-coherent with
// the rest of the app. Do not add a QueryClientProvider here.
//
// Server-side gating (wasm/Go backends) is out of scope here: a backend that
// must gate behaviour on org config reads the same `AddonInstallation.settings`
// jsonb directly — this hook is the client-read half of that contract.
import { useMemo } from 'react'
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { useApi } from './api-context'

/** Stable react-query key for an addon's per-org settings. */
export function addonSettingsKey(addonKey: string) {
    return ['addon-settings', addonKey] as const
}

/**
 * Merge saved org values over the caller's defaults so a never-saved setting
 * falls back to its default. Pure + exported for unit testing. Only keys that
 * are actually present in `stored` win — an explicit `undefined` in the stored
 * payload is treated as "not saved" and yields the default (the host omits
 * unsaved keys, but this keeps a sparse payload well-behaved).
 */
export function mergeAddonSettings<T extends Record<string, unknown>>(
    defaults: Partial<T> | undefined,
    stored: Partial<T> | null | undefined,
): T {
    const out: Record<string, unknown> = { ...(defaults ?? {}) }
    if (stored) {
        for (const [k, v] of Object.entries(stored)) {
            if (v !== undefined) out[k] = v
        }
    }
    return out as T
}

export interface UseAddonSettingsOptions<T> {
    /**
     * Fallback values (typically the addon manifest's `settings[].default`)
     * merged UNDER the saved org values. A setting the org hasn't saved
     * resolves to its default here.
     */
    defaults?: Partial<T>
    /** Override staleTime (default 30s — org config changes rarely). */
    staleTime?: number
    /** Defer fetching (e.g. until the addon key is known). */
    enabled?: boolean
}

export interface UseAddonSettingsResult<T> {
    /** Saved org values merged over `defaults`. Never null. */
    settings: T
    isLoading: boolean
    error: unknown
    refetch: () => void
}

/**
 * Read an addon's per-organization settings.
 *
 * This is the ecosystem-standard way for a federated addon to read its own
 * config; prefer it over a hand-rolled fetch so every addon caches, merges
 * defaults, and invalidates identically.
 *
 * @example
 * type PosSettings = { allowNegativeStock: boolean; roundingMode: string }
 * const { settings, isLoading } = useAddonSettings<PosSettings>('pos', {
 *   defaults: { allowNegativeStock: false, roundingMode: 'nearest' },
 * })
 * if (!isLoading && settings.allowNegativeStock) { ... }
 */
export function useAddonSettings<T extends Record<string, unknown> = Record<string, unknown>>(
    addonKey: string,
    opts: UseAddonSettingsOptions<T> = {},
): UseAddonSettingsResult<T> {
    const api = useApi()
    const { defaults, staleTime, enabled } = opts

    const query = useQuery<Partial<T>>({
        queryKey: addonSettingsKey(addonKey),
        queryFn: async () => {
            const res = await api.get(`/api/addons/${addonKey}/settings`)
            const body = (res as { data: any }).data
            // Host envelope: { success, data: { <key>: <value> } }.
            const values = body?.success ? body.data : body
            return (values ?? {}) as Partial<T>
        },
        staleTime: staleTime ?? 30_000,
        enabled: (enabled ?? true) && !!addonKey,
    })

    const settings = useMemo(
        () => mergeAddonSettings<T>(defaults, query.data),
        [defaults, query.data],
    )

    return {
        settings,
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => {
            void query.refetch()
        },
    }
}

/**
 * Optional write companion — PUTs a (partial) settings object and invalidates
 * the read query so `useAddonSettings` re-resolves. The host's generic config
 * modal does its own PUT; this exists for addons that ship a custom config
 * surface. Backward-compatible: purely additive.
 *
 * @example
 * const update = useUpdateAddonSettings('pos')
 * update.mutate({ allowNegativeStock: true })
 */
export function useUpdateAddonSettings<T extends Record<string, unknown> = Record<string, unknown>>(
    addonKey: string,
) {
    const api = useApi()
    const qc = useQueryClient()

    return useMutation<Partial<T>, Error, Partial<T>>({
        mutationFn: async (values) => {
            const res = await api.put(`/api/addons/${addonKey}/settings`, values)
            const body = (res as { data: any }).data
            const saved = body?.success ? body.data : body
            return (saved ?? values) as Partial<T>
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: addonSettingsKey(addonKey) })
        },
    })
}
