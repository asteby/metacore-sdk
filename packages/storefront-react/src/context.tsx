import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createStorefrontClient, type Shop, type StorefrontClient, type StorefrontClientOptions } from '@asteby/storefront'

export type StorefrontContextValue = {
  /** Client for browser-side calls (use a public `pk_` token). */
  client: StorefrontClient | null
  shop: Shop | null
  /** BCP 47 locale used for formatting (defaults to `shop.locale`, then `es-MX`). */
  locale: string
  /** ISO 4217 currency (defaults to `shop.currency_code`, then `MXN`). */
  currency: string
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null)

export type StorefrontProviderProps = {
  /** A ready client. Takes precedence over `config`. */
  client?: StorefrontClient
  /** Options to create the browser client (use a `pk_` token). */
  config?: StorefrontClientOptions
  /** Shop info loaded on the server (root loader). */
  shop?: Shop | null
  locale?: string
  currency?: string
  children?: ReactNode
}

/**
 * Makes the storefront client, shop, locale and currency available to the
 * tree. SSR-safe: creating the client does not touch `window`.
 */
export function StorefrontProvider({ client, config, shop = null, locale, currency, children }: StorefrontProviderProps) {
  const configKey = config ? `${config.baseUrl}|${config.token}|${config.locale ?? ''}|${config.customerToken ?? ''}` : ''
  const resolvedClient = useMemo(
    () => client ?? (config ? createStorefrontClient(config) : null),
    [client, configKey],
  )
  const value = useMemo<StorefrontContextValue>(
    () => ({
      client: resolvedClient,
      shop,
      locale: locale ?? config?.locale ?? shop?.locale ?? 'es-MX',
      currency: currency ?? shop?.currency_code ?? 'MXN',
    }),
    [resolvedClient, shop, locale, currency, config?.locale],
  )
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

/** Storefront context. Throws outside `<StorefrontProvider>`. */
export function useStorefront(): StorefrontContextValue {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefront must be used inside <StorefrontProvider>')
  return ctx
}

/** Storefront context or `null` outside a provider (for components that work standalone). */
export function useOptionalStorefront(): StorefrontContextValue | null {
  return useContext(StorefrontContext)
}

/** The client from context; throws when the provider has none. */
export function useStorefrontClient(): StorefrontClient {
  const { client } = useStorefront()
  if (!client) throw new Error('<StorefrontProvider> needs a `client` or `config` for browser-side calls')
  return client
}
