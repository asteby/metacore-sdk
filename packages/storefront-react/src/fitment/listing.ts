// "Only what fits my vehicle" listings with an honest empty state. Pure orchestration over the client: no UI, no copy.

import type { Product, ProductConnection, ProductListParams } from '@asteby/storefront'
import { DEFAULT_FITMENT_CONFIG, fitFilterTags, type FitmentConfig } from './fitment.js'

type ListClient = { products: { list(params?: ProductListParams): Promise<ProductConnection> } }

export type CompatibleListing = ProductConnection & {
  /**
   * Only when NOTHING fits on the first page: how many products the same search and filters find without the vehicle
   * (to offer "see the N in the catalog"). `null` otherwise, or when that count could not be read.
   */
  catalogTotal: number | null
  /**
   * True when the client had to drop products the backend returned without the fit tags: the backend ignored
   * `tags_any` (older than Storefront API 1.9), so `total_count`, facets and `page_info` are those of the unfiltered
   * query (`total_count` is then cleared). Upgrade the backend; never rely on this mode.
   */
  filteredOnClient: boolean
}

/**
 * Lists only what fits the vehicle: `tags_any` (Storefront API 1.9) with its fit tags, a hard filter on the backend,
 * so the search, filters, facet counts, total and paging all come with the vehicle applied. Never list a page
 * unfiltered and drop the misfits on the client: the facets and the "next page" would be those of the whole catalog
 * (a search showed "0 results" next to "Brand X (725)" and "See more").
 *
 * Every returned product is still checked against the tags (the client never decides fit on its own, it only drops
 * what the backend did not mark). When nothing fits on the first page, one extra 1-product query (same params without
 * the vehicle) reads `catalogTotal`; if it fails the listing is still returned.
 *
 * `params.tags_any` is replaced by the vehicle's tags (the API ORs them, so merging would widen the result); the
 * catalog count keeps the caller's own `tags_any`.
 */
export async function loadCompatibleListing(client: ListClient, params: ProductListParams, vehicle: { key: string }, config: FitmentConfig = DEFAULT_FITMENT_CONFIG): Promise<CompatibleListing> {
  const tags = fitFilterTags(vehicle, config)
  const wanted = new Set(tags.map((t) => t.toLowerCase()))
  const res = await client.products.list({ ...params, tags_any: tags })
  const nodes = res.nodes.filter((p: Product) => p.tags.some((t) => wanted.has(t.toLowerCase())))
  const filteredOnClient = nodes.length < res.nodes.length
  const empty = !params.after && nodes.length === 0 && !res.page_info.has_next_page
  let catalogTotal: number | null = null
  if (empty) {
    catalogTotal = await client.products.list({ ...params, first: 1, after: undefined }).then(
      (all) => all.total_count ?? (all.nodes.length > 0 ? null : 0),
      () => null,
    )
  }
  if (filteredOnClient) {
    const { total_count: _unfiltered, ...rest } = res
    return { ...rest, nodes, catalogTotal, filteredOnClient }
  }
  return { ...res, nodes, catalogTotal, filteredOnClient }
}
