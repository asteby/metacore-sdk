---
"@asteby/metacore-sdk": patch
---

feat(marketplace): expand `CatalogAddon` and `AddonVersion` with the
fields the hub catalog UI needs to render version selectors, install
gates, and entitlement state.

All new fields are optional so existing consumers keep compiling
unchanged.

Added to `AddonVersion`:

- `changelog?: string` — per-version release notes (markdown).
- `review_status?: AddonVersionReviewStatus` — `"pending" | "approved" |
  "rejected" | "scan_failed" | "deprecated"`, used to badge versions
  in the version selector. Also exported as a named type.

Added to `CatalogAddon`:

- `installable?: boolean` — server-side gate, used to disable the
  install button when the hub already knows the install would fail
  (ABI mismatch, region block, publisher suspended, etc.).
- `entitled?: boolean` — whether the caller's tenant already holds a
  valid licence for this addon. Drives the "Install" vs "Buy" /
  "Upgrade plan" branch in the UI.
- `reason?: string` — human-readable explanation when `installable`
  or `entitled` is `false` ("License required", "Upgrade to Pro",
  "Requires kernel ≥ 1.4", etc.).

These fields are populated by the hub from
`GET /v1/catalog/addons[/{key}]` and
`GET /v1/catalog/addons/{key}/versions`; see the JSDoc on each field
for the exact semantics.
