---
"@asteby/metacore-sdk": patch
---

feat(marketplace): phase 2 — add `tags`, `screenshots`, `maintainer`,
`pricing`, kernel-compat range, artifact size, and signing identity to
the marketplace types.

Follow-up to the phase-1 expansion that added `installable` /
`entitled` / `reason` / `changelog` / `review_status`. All new fields
are optional so existing consumers keep compiling unchanged.

Added to `AddonVersion`:

- `min_kernel_version?: string` / `max_kernel_version?: string` —
  inclusive semver bounds, used by the catalog UI to pre-filter
  selectable versions client-side without waiting on the server-side
  `installable` gate.
- `size_bytes?: number` — raw artifact size, surfaced as "Downloads
  2.3 MB" in the install confirmation dialog.
- `signed_by?: SigningInfo` — signing-key identity (`fingerprint`,
  optional `key_id`) so the UI can render "Signed by …" provenance.
  Verification of the signature itself remains a kernel-side concern.

Added to `CatalogAddon`:

- `tags?: string[]` — free-form keyword tags complementing the single
  `category` for filtering and search.
- `screenshots?: Array<{ url: string; alt?: string }>` — detail-page
  gallery. Objects (not bare URLs) so we can extend with a11y / lazy-
  load metadata without breaking the wire format.
- `maintainer?: MaintainerInfo` — publisher display info (`name`,
  optional `url` / `email` / `verified`), preferred over the
  manifest's `author` / `website` for catalog UX. `verified` matches
  the developer-account flag on the hub.
- `pricing?: PricingInfo` — marketing-level price summary
  (`model: "free" | "one_time" | "subscription"`, `price_cents`,
  `currency`, `trial_days`), so the catalog card can render a price
  tag without a second round-trip to the billing service.

New named types: `MaintainerInfo`, `PricingInfo`, `PricingModel`,
`SigningInfo`.

These fields are populated by the hub from
`GET /v1/catalog/addons[/{key}]` and
`GET /v1/catalog/addons/{key}/versions`; see the JSDoc on each field
for the exact semantics.
