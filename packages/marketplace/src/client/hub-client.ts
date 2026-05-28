/**
 * Hub client — talks to the public marketplace Hub. Read-only catalog +
 * the install initiation endpoint that mints a short-lived token the
 * consumer redeems against their local kernel via `OpsClient`.
 *
 * Routes are split across two prefixes:
 *
 *   - Catalog (read) lives under `basePath` (defaults to `/marketplace`):
 *       GET  {basePath}/addons          → CatalogPage
 *       GET  {basePath}/addons/{key}    → AddonDetail
 *
 *   - The install handshake lives at the hub-root `/install/initiate`
 *     route (sibling to the catalog, not nested under it). The hub's
 *     fixed contract is:
 *       POST /install/initiate          → InstallToken
 *     with `addonKey` carried IN THE BODY (not the URL).
 *
 * The install route is configurable via `installPath` for non-default
 * deployments, but most callers should leave it alone — that path is
 * pinned by the hub backend (`/v1/install/initiate` once the `/v1`
 * baseUrl is wired by the fetcher).
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
  /** Path prefix for the catalog endpoints. Defaults to `/marketplace`. */
  basePath?: string
  /**
   * Path for `initiateInstall`. Defaults to `/install/initiate` — the
   * fixed hub contract. Override if the host wires the hub behind a
   * proxy that rewrites the path.
   */
  installPath?: string
  fetcher: MarketplaceFetcher
}

/** Concrete Hub client built around a host-supplied fetcher. */
export class HubClient {
  private readonly basePath: string
  private readonly installPath: string
  private readonly http: MarketplaceFetcher

  constructor(opts: HubClientOptions) {
    this.basePath = (opts.basePath ?? '/marketplace').replace(/\/$/, '')
    this.installPath = opts.installPath ?? '/install/initiate'
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
   * POST /install/initiate — mints a short-lived install token. The hub
   * takes the addon key in the body (NOT the URL) plus an optional
   * version + instance_id. Response is normalised to the legacy
   * `InstallToken` shape so consumers don't need to know about the
   * underlying `install_token`/`expires_in`/`verification_url` triple.
   *
   * The token is redeemed against the local kernel via
   * `OpsClient.claimInstall(token)`. This call does NOT install anything
   * on the Hub side; it just authorizes the kernel to download + claim
   * the version.
   */
  async initiateInstall(
    key: string,
    input: InitiateInstallInput = {},
  ): Promise<InstallToken> {
    const body: Record<string, string> = { addonKey: key }
    if (input.version) body.version = input.version
    if (input.instance_id) body.instance_id = input.instance_id
    const raw = await this.http.post<HubInitiateInstallResponse>(
      this.installPath,
      body,
    )
    const resp = unwrapEnvelope(raw)
    // Hub responds with {install_token, expires_in, verification_url,
    // addon_key, version}. Normalise to the InstallToken contract every
    // consumer in the SDK already speaks: token + expires_at (absolute).
    const expiresAt = new Date(
      Date.now() + (resp.expires_in ?? 0) * 1000,
    ).toISOString()
    return {
      token: resp.install_token,
      expires_at: expiresAt,
      addon_key: resp.addon_key,
      version: resp.version ?? input.version ?? '',
      verification_url: resp.verification_url,
    }
  }
}

/** Raw wire shape returned by `POST /install/initiate` on the hub. */
interface HubInitiateInstallResponse {
  install_token: string
  expires_in: number
  verification_url: string
  addon_key: string
  version?: string
}

/** Convenience factory mirroring the billing-client API. */
export function createHubClient(opts: HubClientOptions): HubClient {
  return new HubClient(opts)
}
