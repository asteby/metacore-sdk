/**
 * `useCatalog` — paginated, filterable Hub catalog query.
 */
import { useQuery } from '@tanstack/react-query'
import type { CatalogPage, CatalogQuery } from '../client/types'
import { useMarketplace } from '../providers/MarketplaceProvider'
import { marketplaceKeys } from './keys'

export interface UseCatalogOptions {
  query?: CatalogQuery
  /** Override stale time. Defaults to 60s — the catalog moves slowly. */
  staleTime?: number
  /** Disable the query, useful when the caller wants to defer fetching. */
  enabled?: boolean
}

export function useCatalog(options: UseCatalogOptions = {}) {
  const { hub } = useMarketplace()
  const query = options.query ?? {}
  return useQuery<CatalogPage>({
    queryKey: marketplaceKeys.catalog(query),
    queryFn: () => hub.listCatalog(query),
    staleTime: options.staleTime ?? 60_000,
    enabled: options.enabled ?? true,
  })
}
