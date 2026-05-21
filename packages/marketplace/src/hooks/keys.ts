/**
 * Cache keys for the marketplace TanStack Query namespace. Centralised so
 * mutations can invalidate exactly the right slice without hardcoding
 * stringy keys at every call site.
 */
import type { CatalogQuery } from '../client/types'

export const marketplaceKeys = {
  all: () => ['marketplace'] as const,
  catalog: (query: CatalogQuery = {}) =>
    ['marketplace', 'catalog', query] as const,
  addon: (key: string) => ['marketplace', 'addon', key] as const,
  installed: () => ['marketplace', 'installed'] as const,
  installation: (key: string) =>
    ['marketplace', 'installed', key] as const,
}
