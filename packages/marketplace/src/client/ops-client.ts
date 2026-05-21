/**
 * Ops client — talks to the local kernel of the host (Ops or link). Owns
 * the install/uninstall/upgrade lifecycle and the list of installations
 * already present in the org.
 *
 * Routes (all under whatever `basePath` the consumer wires — defaults to
 * `/kernel/addons`):
 *
 *   GET    /kernel/addons                    → Installation[]
 *   GET    /kernel/addons/{key}              → Installation
 *   POST   /kernel/addons/claim              → Installation  (redeem Hub token)
 *   POST   /kernel/addons/{key}/upgrade      → Installation
 *   DELETE /kernel/addons/{key}              → void
 */

import type { MarketplaceFetcher } from './fetcher'
import { unwrapEnvelope } from './fetcher'
import type {
  ClaimInstallInput,
  Installation,
  UpgradeInput,
} from './types'

export interface OpsClientOptions {
  /** Path prefix for the kernel routes. Defaults to `/kernel/addons`. */
  basePath?: string
  fetcher: MarketplaceFetcher
}

/** Concrete Ops/kernel client. */
export class OpsClient {
  private readonly basePath: string
  private readonly http: MarketplaceFetcher

  constructor(opts: OpsClientOptions) {
    this.basePath = (opts.basePath ?? '/kernel/addons').replace(/\/$/, '')
    this.http = opts.fetcher
  }

  /** GET /kernel/addons — installations for the caller's org. */
  async listInstalled(): Promise<Installation[]> {
    const raw = await this.http.get<Installation[]>(this.basePath)
    return unwrapEnvelope(raw)
  }

  /** GET /kernel/addons/{key} — single installation by key. */
  async getInstalled(key: string): Promise<Installation> {
    const raw = await this.http.get<Installation>(
      `${this.basePath}/${encodeURIComponent(key)}`,
    )
    return unwrapEnvelope(raw)
  }

  /**
   * POST /kernel/addons/claim — redeem a Hub-issued install token. The
   * kernel verifies the token, downloads the addon bundle, runs the
   * `lifecycle_hooks.install`, and returns the new Installation row.
   */
  async claimInstall(input: ClaimInstallInput): Promise<Installation> {
    const raw = await this.http.post<Installation>(`${this.basePath}/claim`, input)
    return unwrapEnvelope(raw)
  }

  /**
   * POST /kernel/addons/{key}/upgrade — performs an in-place upgrade to
   * `target_version`. The kernel re-verifies that `accepted_capabilities`
   * still covers the new manifest before applying.
   */
  async upgrade(key: string, input: UpgradeInput): Promise<Installation> {
    const raw = await this.http.post<Installation>(
      `${this.basePath}/${encodeURIComponent(key)}/upgrade`,
      input,
    )
    return unwrapEnvelope(raw)
  }

  /** DELETE /kernel/addons/{key} — uninstall + lifecycle cleanup. */
  async uninstall(key: string): Promise<void> {
    await this.http.del<unknown>(`${this.basePath}/${encodeURIComponent(key)}`)
  }
}

/** Convenience factory. */
export function createOpsClient(opts: OpsClientOptions): OpsClient {
  return new OpsClient(opts)
}
