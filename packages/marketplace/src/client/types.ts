/**
 * Public wire types for `@asteby/metacore-marketplace`.
 *
 * Two manifest shapes coexist in production today:
 *
 *   - v2 (legacy): `APIVersion: "2.0.0"`, capabilities live in a top-level
 *     `capabilities[]` array.
 *   - v3 (current): `APIVersion: "3.x.x"`, capabilities still ride in
 *     `capabilities[]` but `permissions[]` and `consents[]` may also appear,
 *     and `frontend{}` carries the federation `remoteEntry` URL.
 *
 * We surface both raw shapes for advanced callers (so consumers can render
 * the diff exactly as published), but the marketplace UI mostly works off
 * the **normalized** `Manifest` type — a single union with discriminator
 * `apiVersion` flattened into one shape via `normalizeManifest()`.
 *
 * Mirrors `kernel/manifest` Go structs but does NOT re-import them via
 * tygo — the marketplace package speaks only what the Hub returns, not the
 * full kernel struct surface (e.g. we omit signature internals here).
 */

// ---------------------------------------------------------------------------
// Capabilities & permissions
// ---------------------------------------------------------------------------

/**
 * Capability kinds the kernel recognises. The list mirrors
 * `kernel/security/context.go` but is intentionally **open** — string
 * literals union'd with `string` so future kernel releases that introduce
 * a new kind don't break this package at type-check time. Renderers
 * should fall back to a generic icon for unknown kinds.
 */
export type CapabilityKind =
  | 'db:read'
  | 'db:write'
  | 'http:fetch'
  | 'event:emit'
  | 'event:subscribe'
  | 'storage:read'
  | 'storage:write'
  | 'tool:invoke'
  | 'secret:read'
  | (string & {})

/** A single capability declaration from a manifest. */
export interface Capability {
  kind: CapabilityKind
  target: string
  reason?: string
}

/**
 * Permission is an alias used by v3 manifests to mean "user-visible
 * pre-install consent items". Functionally identical to Capability at the
 * wire level; the distinction is purely how the install UI surfaces them.
 */
export interface Permission extends Capability {}

// ---------------------------------------------------------------------------
// Manifest (v2 + v3)
// ---------------------------------------------------------------------------

/** Discriminator for the manifest union. */
export type ManifestApiVersion = '2' | '3'

/** Common identity fields shared by both manifest versions. */
export interface ManifestIdentity {
  key: string
  name: string
  version: string
  /** Semver range satisfied by the kernel. Empty in very old v2 manifests. */
  kernel?: string
  description?: string
  category?: string
  author?: string
  website?: string
  license?: string
  /** `lucide`, `brand`, or `url`. */
  icon_type?: string
  icon_slug?: string
  icon_color?: string
}

/** Raw v2 manifest shape — capabilities only. */
export interface ManifestV2 extends ManifestIdentity {
  apiVersion: '2'
  capabilities?: Capability[]
  /** Surface for advanced renderers — full structure stays opaque. */
  raw?: Record<string, unknown>
}

/** Raw v3 manifest shape — capabilities + permissions + consents. */
export interface ManifestV3 extends ManifestIdentity {
  apiVersion: '3'
  capabilities?: Capability[]
  permissions?: Permission[]
  /** Optional one-shot consent toggles (e.g. "send anonymized usage stats"). */
  consents?: Array<{ key: string; label: string; default?: boolean }>
  raw?: Record<string, unknown>
}

/** Discriminated union — the wire type as the Hub returns it. */
export type RawManifest = ManifestV2 | ManifestV3

/**
 * Normalized manifest used by all marketplace UI components.
 *
 * `permissions` collapses v2's `capabilities` AND v3's
 * `capabilities + permissions` into one ordered list. The original
 * version-specific shape is preserved on `raw` for advanced renderers
 * that need to draw a per-section diff.
 */
export interface Manifest extends ManifestIdentity {
  apiVersion: ManifestApiVersion
  /** Ordered, de-duplicated capability+permission list. */
  permissions: Permission[]
  /** v3-only — empty array on v2 manifests. */
  consents: Array<{ key: string; label: string; default?: boolean }>
  /** The original wire shape — useful for full-fidelity rendering. */
  raw: RawManifest
}

// ---------------------------------------------------------------------------
// Hub catalog DTOs
// ---------------------------------------------------------------------------

/** Marketplace listing visibility. */
export type AddonVisibility = 'public' | 'unlisted' | 'private'

/** Lightweight catalog item shown in grids and search results. */
export interface AddonSummary {
  /** Addon `key` — globally unique. */
  key: string
  name: string
  /** Latest published version (semver). */
  latest_version: string
  description?: string
  category?: string
  author?: string
  icon_type?: string
  icon_slug?: string
  icon_color?: string
  visibility?: AddonVisibility
  /** Number of installs across all tenants — display only, not authoritative. */
  install_count?: number
  /** Tags for filtering. */
  tags?: string[]
  /** Whether the addon is paid; pricing details live in the detail endpoint. */
  paid?: boolean
}

/** A single screenshot in the addon detail page. */
export interface AddonScreenshot {
  url: string
  alt?: string
  /** Order index — Hub may return them already sorted, but we re-sort defensively. */
  order?: number
}

/** A specific version available for install — exposed by the detail endpoint. */
export interface AddonVersion {
  version: string
  apiVersion: ManifestApiVersion
  /** When this version was published. ISO-8601. */
  published_at: string
  /** Human-authored changelog markdown. */
  changelog?: string
  /** The manifest as-published for this version. */
  manifest: RawManifest
}

/** Full detail returned by `GET /addons/{key}`. */
export interface AddonDetail extends AddonSummary {
  /** Full README markdown — rendered by the detail panel. */
  readme?: string
  screenshots: AddonScreenshot[]
  /** Versions, newest first. */
  versions: AddonVersion[]
  /** Pricing copy if the addon is paid. */
  pricing?: { currency: string; amount: number; interval?: 'monthly' | 'yearly' }
  /** Vendor support contact, separate from `author`. */
  support_url?: string
  support_email?: string
}

/** Pagination envelope for catalog queries. */
export interface CatalogPage {
  items: AddonSummary[]
  total: number
  page: number
  page_size: number
}

/** Filter shape for `listCatalog`. Every field is optional. */
export interface CatalogQuery {
  search?: string
  category?: string
  tags?: string[]
  /** Pagination — both 1-indexed for symmetry with the rest of the SDK. */
  page?: number
  page_size?: number
  /** Sort order. */
  sort?: 'popular' | 'newest' | 'name'
}

// ---------------------------------------------------------------------------
// Install flow — Hub → consent → Ops
// ---------------------------------------------------------------------------

/**
 * Result of `initiateInstall()` — the Hub returns a short-lived token the
 * caller redeems against their local Ops kernel. The token encodes the
 * target organization + addon version so the kernel can re-verify before
 * actually installing.
 *
 * The wire response from the hub uses `install_token` / `expires_in` /
 * `verification_url`; `HubClient.initiateInstall` normalises that into
 * this shape (with `expires_at` resolved to an absolute ISO timestamp).
 */
export interface InstallToken {
  /** Opaque install token (`itk_…`) — pass to `OpsClient.claimInstall`. */
  token: string
  /** Absolute expiry as ISO-8601 (derived from the hub's `expires_in` seconds). */
  expires_at: string
  /** Echo of the addon+version the token is bound to. */
  addon_key: string
  version: string
  /**
   * Hub-rendered verification URL the user can paste / be redirected to
   * if they want to complete the handshake via the hub UI rather than
   * a programmatic ops claim. Optional — older hub deploys may omit it.
   */
  verification_url?: string
}

/**
 * Payload for `POST /install/initiate`. Mirrors the hub's
 * `initiateInstallRequest` contract — addon key is carried in the body,
 * NOT the URL. The `key` argument to `HubClient.initiateInstall` is
 * what becomes `addonKey` on the wire; consumers should not pass it in
 * this struct.
 */
export interface InitiateInstallInput {
  /** Version to install. Defaults to the latest approved version. */
  version?: string
  /**
   * Optional Ops instance UUID to bind the token to. When set, the
   * redeem path will sanity-check the instance matches.
   */
  instance_id?: string
}

// ---------------------------------------------------------------------------
// Ops — installed addon lifecycle
// ---------------------------------------------------------------------------

/** Lifecycle state of an installation as tracked by the local kernel. */
export type InstallationStatus =
  | 'installing'
  | 'installed'
  | 'failed'
  | 'upgrading'
  | 'uninstalling'

/** A single installation row exposed by the kernel. */
export interface Installation {
  /** Addon key — primary identifier. */
  addon_key: string
  /** Installed version. */
  version: string
  status: InstallationStatus
  installed_at: string
  /** Last upgrade timestamp; equal to `installed_at` until first upgrade. */
  upgraded_at?: string
  /** Cached marketing fields so a kernel-only call can still render a list. */
  name: string
  description?: string
  icon_type?: string
  icon_slug?: string
  icon_color?: string
  /** Capability set the user consented to at install time. */
  granted_capabilities: Capability[]
}

/** Payload for `POST /kernel/addons/install` (after redeeming a Hub token). */
export interface ClaimInstallInput {
  /** Hub-issued token from `initiateInstall()`. */
  token: string
}

/** Payload for `POST /kernel/addons/{key}/upgrade`. */
export interface UpgradeInput {
  /** Version to upgrade to. */
  target_version: string
  /** Snapshot of the diff the user just approved, so the kernel can verify. */
  accepted_capabilities: Capability[]
}

// ---------------------------------------------------------------------------
// Permission diff
// ---------------------------------------------------------------------------

/** Change kind for a single permission row in a version diff. */
export type PermissionChange = 'added' | 'removed' | 'modified' | 'unchanged'

/** One row of a `diffPermissions()` output. */
export interface PermissionDiffRow {
  change: PermissionChange
  /** Stable identity per row (kind+target). */
  id: string
  current?: Permission
  next?: Permission
}
