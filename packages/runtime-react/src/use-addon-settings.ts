// useAddonSettings — THE standard primitive for reading an addon's
// per-organization configuration from a federated addon (or any host
// surface) without every addon re-implementing its own fetch.
//
// The host (ops) persists settings per org on `AddonInstallation.settings`
// (jsonb) and exposes:
//   GET  /addons/:key/settings  → { success, data: { <key>: <value> }, definitions?, overrides? }
//   PUT  /addons/:key/settings  → body = object of values
// (paths are relative to the host api client's baseURL, like every other call.)
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
import { useCallback, useMemo } from 'react'
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { useApi } from './api-context'
import type { SettingDefLike } from './genui/settings-block'

/** What `GET /addons/:key/settings` answers, normalised. */
export interface AddonSettingsPayload<T = Record<string, unknown>> {
    /** Stored values (org, or the branch's resolution when `branchId` is given). */
    values: Partial<T>
    /** The manifest's setting definitions the host serves alongside the values. */
    definitions: SettingDefLike[]
    /** Branch overrides (only meaningful with `branchId`). */
    overrides: Record<string, unknown>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Normalises the settings response. Envelope `{ success?, data, definitions?,
 * overrides? }` (definitions/overrides are siblings of `data`); a bare
 * `{ key: value }` map is accepted too. Pure + exported for tests.
 */
export function parseAddonSettingsBody<T = Record<string, unknown>>(body: unknown): AddonSettingsPayload<T> {
    if (isRecord(body) && ('data' in body || 'success' in body)) {
        return {
            values: (isRecord(body.data) ? body.data : {}) as Partial<T>,
            definitions: Array.isArray(body.definitions) ? (body.definitions as SettingDefLike[]) : [],
            overrides: isRecord(body.overrides) ? body.overrides : {},
        }
    }
    return { values: (isRecord(body) ? body : {}) as Partial<T>, definitions: [], overrides: {} }
}

/** Stable react-query key for an addon's per-org settings (per branch when given). */
export function addonSettingsKey(addonKey: string, branchId?: string | null) {
    return branchId ? (['addon-settings', addonKey, branchId] as const) : (['addon-settings', addonKey] as const)
}

/**
 * Settings URL. With a branch, the host answers the settings the addon runs
 * with there: org values with each `scope: branch` key replaced by the branch's
 * override (POS-1). Without one, the org values (legacy behaviour).
 */
export function addonSettingsUrl(addonKey: string, branchId?: string | null): string {
    // Relative to the host api client's baseURL (ops: `/api`); a literal `/api`
    // here would double-prefix to `/api/api/addons/...`.
    const base = `/addons/${addonKey}/settings`
    return branchId ? `${base}?branch_id=${encodeURIComponent(branchId)}` : base
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
    /**
     * Read the settings as one branch sees them (manifest `scope: branch` keys
     * resolve to the branch override, else the org value). Omit for org values.
     * A terminal passes its active branch here.
     */
    branchId?: string | null
}

export interface UseAddonSettingsResult<T> {
    /** Saved org values merged over `defaults`. Never null. */
    settings: T
    /** Stored values only (no defaults merged); `{}` until loaded. */
    stored: Partial<T>
    /** Setting definitions served with the values (`[]` when the host sends none). */
    definitions: SettingDefLike[]
    /** Branch overrides served with the values. */
    overrides: Record<string, unknown>
    isLoading: boolean
    error: unknown
    refetch: () => void
    /** Forces a fresh GET (bypassing staleTime), updates the cache and resolves with the payload. Rejects on error. */
    reload: () => Promise<AddonSettingsPayload<T>>
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
    const { defaults, staleTime, enabled, branchId } = opts

    const qc = useQueryClient()
    const queryKey = addonSettingsKey(addonKey, branchId)
    const fetchPayload = useCallback(
        async (): Promise<AddonSettingsPayload<T>> => {
            const res = await api.get(addonSettingsUrl(addonKey, branchId))
            return parseAddonSettingsBody<T>((res as { data: unknown }).data)
        },
        [api, addonKey, branchId],
    )

    const query = useQuery<AddonSettingsPayload<T>>({
        queryKey,
        queryFn: fetchPayload,
        staleTime: staleTime ?? 30_000,
        enabled: (enabled ?? true) && !!addonKey,
    })

    const settings = useMemo(
        () => mergeAddonSettings<T>(defaults, query.data?.values),
        [defaults, query.data],
    )

    const reload = useCallback(
        () => qc.fetchQuery({ queryKey, queryFn: fetchPayload, staleTime: 0 }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [qc, fetchPayload, addonKey, branchId],
    )

    return {
        settings,
        stored: query.data?.values ?? {},
        definitions: query.data?.definitions ?? [],
        overrides: query.data?.overrides ?? {},
        reload,
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
    /** Write branch overrides (only `scope: branch` keys; `null` clears one) instead of org values. */
    branchId?: string | null,
) {
    const api = useApi()
    const qc = useQueryClient()

    return useMutation<Partial<T>, Error, Partial<T>>({
        mutationFn: async (values) => {
            const res = await api.put(addonSettingsUrl(addonKey, branchId), values)
            const body = (res as { data: any }).data
            const saved = body?.success ? body.data : body
            return (saved ?? values) as Partial<T>
        },
        onSuccess: () => {
            // Prefix match: refreshes the org read and every branch read.
            void qc.invalidateQueries({ queryKey: addonSettingsKey(addonKey) })
        },
    })
}
