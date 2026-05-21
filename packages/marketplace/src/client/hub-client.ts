/**
 * Hub client — talks to the public marketplace Hub. Read-only catalog +
 * the install initiation endpoint that mints a short-lived token the
 * consumer redeems against their local kernel via `OpsClient`.
 *
 * Routes (all under whatever `basePath` the consumer wires — defaults to
 * `/marketplace`):
 *
 *   GET  /addons                        → CatalogPage
 *   GET  /addons/{key}                  → AddonDetail
 *   POST /addons/{key}/install          → InstallToken
 */

import type { MarketplaceFetcher } from './fetcher'
import { unwrapEnvelope } from './fetcher'
import type {
  AddonDetail,
  CatalogPage,
  CatalogQuery,
  InitiateInstallInput,
  InstallToken,
} from './types'

export interface HubClientOptions {
  /** Path prefix for the Hub. Defaults to `/marketplace`. */
  basePath?: string
  fetcher: MarketplaceFetcher
}

/** Concrete Hub client built around a host-supplied fetcher. */
export class HubClient {
  private readonly basePath: string
  private readonly http: MarketplaceFetcher

  constructor(opts: HubClientOptions) {
    this.basePath = (opts.basePath ?? '/marketplace').replace(/\/$/, '')
    this.http = opts.fetcher
  }

  /** GET /marketplace/addons — paginated, filterable catalog. */
  async listCatalog(query: CatalogQuery = {}): Promise<CatalogPage> {
    const raw = await this.http.get<CatalogPage>(`${this.basePath}/addons`, {
      search: query.search,
      category: query.category,
      tags: query.tags,
      page: query.page,
      page_size: query.page_size,
      sort: query.sort,
    })
    return unwrapEnvelope(raw)
  }

  /** GET /marketplace/addons/{key} — full addon detail incl. versions. */
  async getAddon(key: string): Promise<AddonDetail> {
    const raw = await this.http.get<AddonDetail>(
      `${this.basePath}/addons/${encodeURIComponent(key)}`,
    )
    return unwrapEnvelope(raw)
  }

  /**
   * POST /marketplace/addons/{key}/install — mints a short-lived install
   * token. The token is redeemed against the local kernel via
   * `OpsClient.claimInstall(token)`. This call does NOT install anything
   * on the Hub side; it just authorizes the kernel to download + claim
   * the version.
   */
  async initiateInstall(
    key: string,
    input: InitiateInstallInput,
  ): Promise<InstallToken> {
    const raw = await this.http.post<InstallToken>(
      `${this.basePath}/addons/${encodeURIComponent(key)}/install`,
      input,
    )
    return unwrapEnvelope(raw)
  }
}

/** Convenience factory mirroring the billing-client API. */
export function createHubClient(opts: HubClientOptions): HubClient {
  return new HubClient(opts)
}
