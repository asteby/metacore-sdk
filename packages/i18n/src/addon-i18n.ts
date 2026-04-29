import { useEffect, useRef, useState } from 'react'
import { useLocale } from './hooks'

const DEFAULT_HUB_URL = 'https://hub.asteby.com'

/**
 * Resolve the Hub base URL the SDK should hit for addon i18n bundles.
 *
 * Resolution order:
 *   1. explicit `hubURL` argument
 *   2. `globalThis.__METACORE_HUB_URL__` (apps can set this once on boot)
 *   3. `import.meta.env.VITE_HUB_URL` (Vite apps)
 *   4. `https://hub.asteby.com`
 */
function resolveHubURL(override?: string): string {
  if (override) return override.replace(/\/$/, '')
  const g = globalThis as { __METACORE_HUB_URL__?: string }
  if (g.__METACORE_HUB_URL__) return g.__METACORE_HUB_URL__.replace(/\/$/, '')
  try {
    const envURL = (import.meta as any)?.env?.VITE_HUB_URL as string | undefined
    if (envURL) return envURL.replace(/\/$/, '')
  } catch {
    /* SSR / non-Vite */
  }
  return DEFAULT_HUB_URL
}

const STORAGE_PREFIX = 'metacore.addon-i18n'
const TTL_MS = 1000 * 60 * 60 * 6 // 6h — addon i18n is near-immutable per version

type CacheEntry = {
  labels: Record<string, string>
  storedAt: number
}

const memoryCache = new Map<string, Promise<Record<string, string>>>()

function readLocalStorage(cacheKey: string): Record<string, string> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${cacheKey}`)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry || typeof entry.storedAt !== 'number') return null
    if (Date.now() - entry.storedAt > TTL_MS) {
      localStorage.removeItem(`${STORAGE_PREFIX}:${cacheKey}`)
      return null
    }
    return entry.labels ?? null
  } catch {
    return null
  }
}

function writeLocalStorage(cacheKey: string, labels: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: CacheEntry = { labels, storedAt: Date.now() }
    localStorage.setItem(`${STORAGE_PREFIX}:${cacheKey}`, JSON.stringify(payload))
  } catch {
    /* storage full / disabled */
  }
}

async function fetchAddonI18n(
  hubURL: string,
  addonKey: string,
  lang: string,
): Promise<Record<string, string>> {
  const url = `${hubURL}/v1/addons/${encodeURIComponent(addonKey)}/i18n/${encodeURIComponent(lang)}.json`
  const res = await fetch(url, { credentials: 'omit' })
  if (!res.ok) {
    if (res.status === 404) return {}
    throw new Error(`addon i18n fetch failed: ${res.status}`)
  }
  const data = (await res.json()) as Record<string, string> | null
  return data && typeof data === 'object' ? data : {}
}

export type UseAddonI18nOptions = {
  /** Override the Hub base URL. Defaults to globalThis or VITE_HUB_URL or hub.asteby.com. */
  hubURL?: string
  /** Disable the localStorage layer (memory + network only). */
  disablePersistence?: boolean
}

export type UseAddonI18nResult = {
  /** Translation map for the current language. Empty when not yet fetched or not provided by the addon. */
  labels: Record<string, string>
  /** Convenience: labels.name (or empty string) — the addon's display name. */
  name: string
  /** True after the first network/cached resolution for the current (key, lang) pair. */
  ready: boolean
}

/**
 * Resolve the i18n bundle published by an addon's manifest from the Hub.
 *
 * Reactive to `useLocale()` — switching language refetches without a page
 * reload. Memory + localStorage cached. Returns `{}` for addons that don't
 * ship a bundle for the active language so callers fall back gracefully.
 *
 *     const { name, labels } = useAddonI18n('assets')
 *     // sidebar.tsx
 *     <SidebarItem title={name || addon.name || addon.key} />
 */
export function useAddonI18n(
  addonKey: string | undefined | null,
  options: UseAddonI18nOptions = {},
): UseAddonI18nResult {
  const { locale } = useLocale()
  const lang = locale.split('-')[0] || locale || 'en'
  const hubURL = resolveHubURL(options.hubURL)
  const cacheKey = `${hubURL}|${addonKey ?? ''}|${lang}`

  // Synchronous initial state from localStorage so the first render already
  // has the right label and the sidebar doesn't flash with the raw key.
  const initial = !addonKey || options.disablePersistence ? null : readLocalStorage(cacheKey)
  const [labels, setLabels] = useState<Record<string, string>>(initial ?? {})
  const [ready, setReady] = useState<boolean>(initial !== null)
  const lastKeyRef = useRef<string>('')

  useEffect(() => {
    if (!addonKey) {
      setLabels({})
      setReady(true)
      return
    }
    if (lastKeyRef.current === cacheKey) return
    lastKeyRef.current = cacheKey

    const cached = options.disablePersistence ? null : readLocalStorage(cacheKey)
    if (cached) {
      setLabels(cached)
      setReady(true)
      // Re-validate in the background — addon publishers may push a new
      // version with updated copy. We don't await so the UI stays snappy.
    }

    let cancelled = false
    let inflight = memoryCache.get(cacheKey)
    if (!inflight) {
      inflight = fetchAddonI18n(hubURL, addonKey, lang)
      memoryCache.set(cacheKey, inflight)
    }
    inflight
      .then((data) => {
        if (cancelled) return
        setLabels(data)
        setReady(true)
        if (!options.disablePersistence) writeLocalStorage(cacheKey, data)
      })
      .catch(() => {
        if (cancelled) return
        // Network failure — keep whatever we had, mark ready so the caller
        // stops showing a loading state.
        setReady(true)
      })
      .finally(() => {
        // Drop the inflight promise so a future remount can refetch on
        // demand. The data lives in localStorage for the next call anyway.
        if (memoryCache.get(cacheKey) === inflight) {
          memoryCache.delete(cacheKey)
        }
      })

    return () => {
      cancelled = true
    }
  }, [addonKey, lang, hubURL, cacheKey, options.disablePersistence])

  return {
    labels,
    name: labels.name ?? '',
    ready,
  }
}

/**
 * Resolve display names for many addons at once. Built for the sidebar /
 * dashboard which iterate over an installed-addons list and need the
 * localised name without spawning one component per row.
 *
 *     const names = useAddonNames(installs.map(i => i.addon_key))
 *     // names['assets'] -> 'Activos Fijos' (es) or 'Fixed Assets' (en)
 *
 * Empty string for entries without a Hub-published bundle so callers can
 * fall back to the install-time row.name or the raw key.
 */
export function useAddonNames(
  keys: ReadonlyArray<string>,
  options: UseAddonI18nOptions = {},
): Record<string, string> {
  const { locale } = useLocale()
  const lang = locale.split('-')[0] || locale || 'en'
  const hubURL = resolveHubURL(options.hubURL)

  // Stable cache key so a re-render with the same key list doesn't refetch.
  const keysSig = keys.join(',')

  const [names, setNames] = useState<Record<string, string>>(() => {
    if (options.disablePersistence) return {}
    const seed: Record<string, string> = {}
    for (const k of keys) {
      const cached = readLocalStorage(`${hubURL}|${k}|${lang}`)
      if (cached?.name) seed[k] = cached.name
    }
    return seed
  })

  useEffect(() => {
    if (keys.length === 0) {
      setNames({})
      return
    }

    let cancelled = false
    const out: Record<string, string> = {}
    // Hydrate synchronously from localStorage first so the UI never flashes
    // with raw keys, then revalidate over the network.
    if (!options.disablePersistence) {
      for (const k of keys) {
        const cached = readLocalStorage(`${hubURL}|${k}|${lang}`)
        if (cached?.name) out[k] = cached.name
      }
      if (Object.keys(out).length > 0) setNames({ ...out })
    }

    Promise.all(
      keys.map(async (k) => {
        const cacheKey = `${hubURL}|${k}|${lang}`
        let inflight = memoryCache.get(cacheKey)
        if (!inflight) {
          inflight = fetchAddonI18n(hubURL, k, lang)
          memoryCache.set(cacheKey, inflight)
        }
        try {
          const data = await inflight
          if (!options.disablePersistence) writeLocalStorage(cacheKey, data)
          return [k, data.name ?? ''] as const
        } catch {
          return [k, ''] as const
        } finally {
          if (memoryCache.get(cacheKey) === inflight) {
            memoryCache.delete(cacheKey)
          }
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [k, n] of entries) {
        if (n) next[k] = n
      }
      setNames(next)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig, lang, hubURL, options.disablePersistence])

  return names
}
