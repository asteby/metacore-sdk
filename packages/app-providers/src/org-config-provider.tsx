// OrgConfigProvider — sibling to PlatformConfigProvider that exposes the
// per-org configuration the SDK needs for locale-aware behaviour:
//   • currency / locale defaults
//   • tax-id validator identifier (the kernel's $org.tax_id_validator
//     reference resolves to whatever this provider returns for the key)
//   • address format slug
//   • any other org-scoped configuration the app wants to surface
//
// The principle (from project-wide doctrine): NOTHING fiscal/regional
// hardcoded in the SDK. The SDK only knows how to apply a validator the
// org config picks. This provider is the resolver surface — apps wire a
// fetcher pointing at their own /api/org/config endpoint and the SDK
// reads `validators[<key>]` / `currency` / etc. through `useOrgConfig`.
//
// Decoupled from the app: the fetcher is injected, no axios import here.
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'

export interface OrgConfig {
  /** ISO 4217 currency code, e.g. "MXN", "COP", "USD". */
  currency: string
  /** BCP-47 locale tag, e.g. "es-MX", "es-CO", "en-US". */
  locale: string
  /**
   * Validator identifiers keyed by the `$org.<key>` reference shape used
   * by the kernel. e.g.
   *   { tax_id_validator: 'rfc.tax_id', postal_code: 'mx.cp' }
   * The SDK resolves each $org.<key> token through this map at form time.
   */
  validators: Record<string, string>
  /**
   * Address layout slug. The SDK has no built-in formats — apps register
   * their own renderers and this string picks one. Empty defaults to a
   * neutral 4-line layout.
   */
  addressFormat: string
  /**
   * Free-form bag for app-specific config the SDK does not type. Use
   * sparingly: anything the SDK consumes should land in a typed field
   * above first.
   */
  extra: Record<string, unknown>
}

export const FALLBACK_ORG_CONFIG: OrgConfig = {
  currency: 'USD',
  locale: 'en-US',
  validators: {},
  addressFormat: '',
  extra: {},
}

interface OrgConfigContextValue {
  config: OrgConfig
  loading: boolean
  /**
   * Resolves a `$org.<key>` reference (or a plain key) to the configured
   * validator identifier. Returns null when the org has not configured
   * that validator — callers decide between a built-in fallback and
   * surfacing the missing config to the operator.
   */
  resolveValidator: (refOrKey: string) => string | null
  refetch: () => void
}

const OrgConfigContext = createContext<OrgConfigContextValue>({
  config: FALLBACK_ORG_CONFIG,
  loading: false,
  resolveValidator: () => null,
  refetch: () => {},
})

export type OrgConfigFetcher = () => Promise<Partial<OrgConfig>>

export interface OrgConfigProviderProps {
  children: ReactNode
  /**
   * Async function returning the current org's config. Apps wire whatever
   * transport they already use (axios, fetch, ofetch).
   */
  fetcher: OrgConfigFetcher
  /**
   * Defaults applied while the fetcher hasn't resolved yet OR when the
   * server omits a field. Apps pass their static brand defaults
   * (currency, locale) so the SDK never paints with FALLBACK_ORG_CONFIG.
   */
  defaults?: OrgConfig
  /** TanStack Query staleTime, defaults to 5 minutes. */
  staleTime?: number
}

export function OrgConfigProvider({
  children,
  fetcher,
  defaults = FALLBACK_ORG_CONFIG,
  staleTime = 5 * 60 * 1000,
}: OrgConfigProviderProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['metacore-org-config'],
    queryFn: async () => {
      const res = await fetcher()
      return mergeOrgConfig(defaults, res)
    },
    staleTime,
    retry: 1,
  })

  const value = useMemo<OrgConfigContextValue>(() => {
    const config = data ?? defaults
    return {
      config,
      loading: isLoading,
      resolveValidator: (refOrKey: string) => {
        if (!refOrKey) return null
        const key = refOrKey.startsWith('$org.')
          ? refOrKey.slice('$org.'.length)
          : refOrKey
        const resolved = config.validators?.[key]
        return resolved && resolved.length > 0 ? resolved : null
      },
      refetch: () => {
        refetch()
      },
    }
  }, [data, defaults, isLoading, refetch])

  return (
    <OrgConfigContext value={value}>
      {children}
    </OrgConfigContext>
  )
}

/**
 * Returns the current org config plus a `resolveValidator` helper for
 * `$org.<key>` references. Throws if used outside an `<OrgConfigProvider>`
 * is NOT the contract — the hook returns the FALLBACK so legacy app
 * shells without the provider keep rendering, just without locale-aware
 * behaviour. Apps that depend on org config should mount the provider.
 */
export function useOrgConfig(): OrgConfigContextValue {
  return useContext(OrgConfigContext)
}

function mergeOrgConfig(defaults: OrgConfig, partial: Partial<OrgConfig>): OrgConfig {
  return {
    currency: partial.currency || defaults.currency,
    locale: partial.locale || defaults.locale,
    validators: {
      ...defaults.validators,
      ...(partial.validators || {}),
    },
    addressFormat: partial.addressFormat || defaults.addressFormat,
    extra: {
      ...defaults.extra,
      ...(partial.extra || {}),
    },
  }
}
