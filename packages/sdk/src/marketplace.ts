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
 * Publisher / maintainer of an addon, surfaced on catalog cards and the
 * detail page so the UI can render "by Asteby" without resolving the
 * full {@link Manifest}.
 *
 * Complements (and is preferred over) the manifest's `author` /
 * `website` fields for catalog-level UX: the hub may know more than the
 * manifest itself (e.g. the publisher account that uploaded the
 * artifact, or whether that account has been verified by the hub).
 *
 * - `name`     — display name of the publisher / org / individual.
 * - `url`      — public profile or homepage (publisher page, GitHub
 *                org, company site). Optional.
 * - `email`    — contact e-mail. Optional; the hub MAY omit this for
 *                anonymous catalog queries to avoid scraping.
 * - `verified` — `true` when the hub has verified the publisher's
 *                identity (matches the developer-account flag on the
 *                hub). Drives the verified-checkmark badge in the UI.
 */
export interface MaintainerInfo {
  name: string;
  url?: string;
  email?: string;
  verified?: boolean;
}

/**
 * Pricing model for a catalog addon. Each value maps to a distinct
 * rendering / billing flow in the install dialog:
 *
 * - `free`         — no purchase needed; install button is enabled
 *                    once entitlement / installability checks pass.
 * - `one_time`     — single up-front charge; renders a price tag and
 *                    routes through the one-shot billing flow.
 * - `subscription` — recurring charge; renders "$X / month" (or the
 *                    billing-package equivalent) and routes through
 *                    the subscription flow.
 *
 * New values may be added in a future minor; consumers should treat
 * unknown values as "unknown" and fall back to opening the billing
 * package for the canonical price.
 */
export type PricingModel = "free" | "one_time" | "subscription";

/**
 * Marketing-level price summary, sufficient to render a price tag on a
 * catalog card without making a second round-trip to the billing
 * service. The canonical, tenant-scoped price (with taxes, discounts,
 * coupons, etc.) still lives in the `billing` package and is resolved
 * at checkout time.
 *
 * - `model`       — see {@link PricingModel}.
 * - `price_cents` — base price in the smallest currency unit. Required
 *                   for `one_time` and `subscription`; omitted for
 *                   `free`. Always non-negative.
 * - `currency`    — ISO-4217 currency code (e.g. `"USD"`, `"EUR"`).
 *                   Required whenever `price_cents` is set.
 * - `trial_days`  — number of free-trial days the publisher advertises
 *                   for `subscription` plans. `0` / omitted means no
 *                   trial.
 */
export interface PricingInfo {
  model: PricingModel;
  price_cents?: number;
  currency?: string;
  trial_days?: number;
}

/**
 * Cryptographic signing identity for an addon version artifact. Lets
 * the UI surface "Signed by …" provenance and (in future) gate installs
 * on a trusted-publisher allow-list configured at the tenant or kernel
 * level.
 *
 * - `fingerprint` — full signing-key fingerprint (hex, lowercase, no
 *                   separators), matched against the kernel's trust
 *                   store. This is the canonical identifier and is
 *                   always present.
 * - `key_id`      — short / human-friendly key identifier (e.g. an
 *                   OpenPGP long key id or a Sigstore certificate id).
 *                   Optional; useful for tooltips and audit logs.
 *
 * NOTE: this type only describes *who* signed the artifact, not
 * whether the signature itself verifies — verification is performed by
 * the kernel at install time and surfaced through {@link
 * AddonVersionReviewStatus} (`scan_failed`) and the hub's install
 * gate.
 */
export interface SigningInfo {
  fingerprint: string;
  key_id?: string;
}

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

  /**
   * Minimum kernel version this artifact is known to be compatible
   * with, as a semver range lower bound (e.g. `"1.4.0"`). The catalog
   * UI uses this to pre-filter selectable versions on the client side
   * without waiting for the server-side {@link CatalogAddon.installable}
   * gate to round-trip — useful when the user is scrolling through a
   * version list.
   *
   * Inclusive. When omitted, the version is assumed to work with any
   * kernel ≤ {@link AddonVersion.max_kernel_version}.
   *
   * Populated by the hub from the publisher's manifest at publish
   * time (or from build metadata). Exposed on
   * `GET /v1/catalog/addons/{key}` and
   * `GET /v1/catalog/addons/{key}/versions`.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  min_kernel_version?: string;

  /**
   * Maximum kernel version this artifact is known to be compatible
   * with, as a semver range upper bound (e.g. `"1.99.0"`). Symmetric
   * with {@link AddonVersion.min_kernel_version}; same client-side
   * pre-filtering use case.
   *
   * Inclusive. When omitted, the version is assumed to work with any
   * kernel ≥ {@link AddonVersion.min_kernel_version}.
   *
   * Populated by the hub from the publisher's manifest at publish
   * time. Exposed on `GET /v1/catalog/addons/{key}` and
   * `GET /v1/catalog/addons/{key}/versions`.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  max_kernel_version?: string;

  /**
   * Size of the addon artifact in bytes, as it will be downloaded by
   * the kernel. Drives the "Downloads 2.3 MB" line in the install
   * confirmation dialog and helps users on metered connections decide
   * whether to proceed.
   *
   * This is the raw artifact size (typically a `.wasm` bundle); it
   * does not include downstream assets fetched at runtime.
   *
   * Populated by the hub at publish time. Exposed on
   * `GET /v1/catalog/addons/{key}` and
   * `GET /v1/catalog/addons/{key}/versions`.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  size_bytes?: number;

  /**
   * Signing identity that produced the artifact's signature, used to
   * surface "Signed by …" provenance in the install dialog and (in
   * future) to gate installs on a trusted-publisher allow-list. See
   * {@link SigningInfo}.
   *
   * Whether the signature itself *verifies* is decided by the kernel
   * at install time, not by this field — `signed_by` describes who
   * claims to have signed it, not whether we trust them.
   *
   * Populated by the hub at publish time from the upload's detached
   * signature / Sigstore certificate. Exposed on
   * `GET /v1/catalog/addons/{key}` and
   * `GET /v1/catalog/addons/{key}/versions`.
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}/versions
  signed_by?: SigningInfo;
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

  /**
   * Free-form tags for filtering and search, complementing the single
   * {@link CatalogAddon.category}. Used by the catalog UI to render
   * facet chips and by the search box to match keyword queries
   * (e.g. `"crm"`, `"whatsapp"`, `"reporting"`).
   *
   * Order is publisher-defined and may be surfaced verbatim in the
   * UI. Tags are case-sensitive on the wire; the UI is free to
   * normalise for display.
   *
   * Populated by the hub from the publisher's manifest (or hub-side
   * curation). Exposed on `GET /v1/catalog/addons` and
   * `GET /v1/catalog/addons/{key}`.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  tags?: string[];

  /**
   * Screenshot gallery for the addon detail page. Each entry is an
   * object (not a bare URL) so that we can attach accessibility and
   * loading metadata without a breaking change later.
   *
   * - `url` — absolute URL of the image. The hub should serve these
   *           from a CDN; the UI is expected to lazy-load them.
   * - `alt` — accessible alt-text for screen readers. Optional today,
   *           but publishers are strongly encouraged to provide it.
   *
   * Order is meaningful: the first entry is treated as the hero image
   * for share previews and card hovers.
   *
   * Populated by the hub from publisher uploads. Exposed on
   * `GET /v1/catalog/addons/{key}` (and optionally on
   * `GET /v1/catalog/addons` for card thumbnails).
   */
  // TODO(hub): populate from /v1/catalog/addons/{key}
  screenshots?: Array<{ url: string; alt?: string }>;

  /**
   * Publisher / maintainer of the addon. See {@link MaintainerInfo}.
   *
   * Preferred over the manifest's `author` / `website` for catalog UX
   * because (a) the hub can surface it without resolving the full
   * manifest and (b) the hub knows additional context such as whether
   * the publisher has been verified.
   *
   * Populated by the hub from the publisher's account profile.
   * Exposed on `GET /v1/catalog/addons` and
   * `GET /v1/catalog/addons/{key}`.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  maintainer?: MaintainerInfo;

  /**
   * Marketing-level price summary for this addon. See
   * {@link PricingInfo}.
   *
   * Lets the catalog UI render a price tag on the card without a
   * second round-trip to the billing service. The canonical
   * tenant-scoped price (with taxes, discounts, coupons) still comes
   * from the `billing` package at checkout time.
   *
   * Populated by the hub by joining the catalog row with the billing
   * catalog. Exposed on `GET /v1/catalog/addons` and
   * `GET /v1/catalog/addons/{key}`.
   */
  // TODO(hub): populate from /v1/catalog/addons and /v1/catalog/addons/{key}
  pricing?: PricingInfo;
}

export interface AddonDetail extends CatalogAddon {
  manifest?: Manifest;
  versions: AddonVersion[];
  download_url?: string;
}