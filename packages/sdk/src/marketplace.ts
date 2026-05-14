/**
 * Marketplace shapes — used by hub-server / hub catalog frontends.
 */

import type { Manifest } from "./types.js";

export type { Installation } from "./types.js";
export { METACORE_API_VERSION } from "./types.js";

export type {
  Manifest,
  Module,
  NavGroup,
  NavItem,
  FrontendSpec,
  BackendSpec,
  Capability,
  Permission,
  SettingDef,
  Option,
  ToolDef,
  ToolInputParam,
  ActionDef,
  FieldDef,
  HookDef,
  HookTarget,
  ModelExtension,
  ModelDefinition,
  ColumnDef,
  Signature,
} from "./types.js";

export type CapabilityKind =
  | "db:read"
  | "db:write"
  | "http:fetch"
  | "event:emit"
  | "event:subscribe";

/**
 * Lifecycle / review status of a single addon version on the hub.
 *
 * Populated by the hub's review pipeline. The exact transitions are
 * hub-internal, but consumers can rely on the value being one of these
 * literals when present. Used by the version-selector UI to render
 * badges next to each version (e.g. "pending review", "deprecated").
 *
 * - `pending`     — uploaded but not yet reviewed.
 * - `approved`    — passed review; installable by tenants.
 * - `rejected`    — review failed (policy / quality / abuse).
 * - `scan_failed` — automated scan (malware, signature, ABI) rejected
 *                   the artifact.
 * - `deprecated`  — explicitly deprecated by the publisher; should be
 *                   hidden from default selectors but kept available
 *                   for tenants already pinned to it.
 */
export type AddonVersionReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "scan_failed"
  | "deprecated";

export interface AddonVersion {
  version: string;
  published_at: string;
  checksum: string;

  /**
   * Free-form release notes for this version, rendered as-is in the
   * version selector / detail drawer. Markdown is allowed; the UI is
   * expected to render it safely (or treat it as plain text).
   *
   * Populated by the hub from the publisher's `CHANGELOG.md` entry
   * (or the `--notes` flag passed to `metacore publish`). Exposed via
   * `GET /v1/catalog/addons/{key}` and `GET /v1/catalog/addons/{key}/versions`.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  changelog?: string;

  /**
   * Lifecycle / review status of this version. See
   * {@link AddonVersionReviewStatus}.
   *
   * Populated by the hub's review pipeline and exposed alongside the
   * version metadata on `GET /v1/catalog/addons/{key}` and
   * `GET /v1/catalog/addons/{key}/versions`. When omitted the UI
   * should treat the version as `approved` for backwards compatibility
   * with older catalog responses.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  review_status?: AddonVersionReviewStatus;
}

export interface CatalogAddon {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  featured: boolean;
  created_at: string;
  latest_version?: string;
  icon_type?: "brand" | "lucide" | "url" | "";
  icon_slug?: string;
  icon_color?: string;

  /**
   * Server-side gate: whether the addon can be installed at all in the
   * current context (e.g. ABI compatibility, kernel version, region,
   * publisher status). When `false` the install button should be
   * disabled regardless of entitlement; see {@link CatalogAddon.reason}
   * for the human-readable explanation.
   *
   * Independent of {@link CatalogAddon.entitled} — an addon can be
   * `installable: true, entitled: false` (free to install once the
   * tenant buys a license) or `installable: false, entitled: true`
   * (already licensed but currently blocked, e.g. ABI mismatch).
   *
   * Populated by the hub at request time on `GET /v1/catalog/addons`
   * and `GET /v1/catalog/addons/{key}` based on the caller's tenant +
   * kernel version. Omitted when the catalog is queried anonymously.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  installable?: boolean;

  /**
   * Whether the caller's tenant currently holds a valid license /
   * entitlement for this addon. Used by the UI to flip the install
   * button between "Install" and "Buy" (or "Upgrade plan"), and to
   * decorate cards with an "Owned" / "Included in your plan" badge.
   *
   * For free / public addons the hub should set this to `true` by
   * default. Omitted when the catalog is queried anonymously.
   *
   * Populated by the hub by joining the catalog query with the
   * tenant's billing entitlements (see the `billing` package). Exposed
   * on `GET /v1/catalog/addons` and `GET /v1/catalog/addons/{key}`.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  entitled?: boolean;

  /**
   * Human-readable explanation when {@link CatalogAddon.installable}
   * or {@link CatalogAddon.entitled} is `false`. The UI surfaces this
   * verbatim in the disabled-state tooltip and on the addon detail
   * page (e.g. "License required", "Upgrade to Pro plan",
   * "Requires kernel ≥ 1.4", "Not available in your region").
   *
   * Hub authors should keep these short, user-facing, and already
   * localised to the caller's locale (the hub knows the
   * `Accept-Language` header). Machine-readable codes belong in a
   * separate field if/when we add one.
   *
   * Populated by the same endpoints as `installable` / `entitled`.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  reason?: string;
}

export interface AddonDetail extends CatalogAddon {
  manifest?: Manifest;
  versions: AddonVersion[];
  download_url?: string;
}