---
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-app-providers': minor
---

feat: useOptionsResolver hook + locale-aware Validation via OrgConfigProvider

**runtime-react:**

- New `useOptionsResolver(args)` hook that consumes the v0.9.0 kernel
  envelope `{ success, data, meta: { type, count } }` from
  `GET /api/options/:model?field=…`. Replaces the ad-hoc `/data/<model>`
  reads `<DynamicRelation>` used to do.
- `<DynamicForm>` now renders a Ref-driven `<RefSelect>` whenever an
  `ActionFieldDef.ref` is present — apps stop hardcoding option lists for
  belongs_to FKs.
- `<DynamicRelation>` (kind="many_to_many") prefers the canonical options
  endpoint via `useOptionsResolver`. The legacy `referencesEndpoint` prop
  remains a working escape hatch for apps wired against custom routes.
- `ColumnDefinition.ref` and `ColumnDefinition.validation` are now part of
  the metadata contract the SDK reads. `ActionFieldDef.ref` joins the
  field-level type so addons can declare ref-aware modal fields.
- New `setOrgConfigBridge` / `resolveValidatorToken` surface lets apps
  feed a `useOrgConfig`-backed resolver into the SDK's validator
  pipeline. Validators with `custom: '$org.<key>'` are resolved at form
  build time; unresolved tokens degrade to no-op so missing config does
  not crash forms.
- New `registerValidator(slug, fn)` lets apps install their own
  region-specific validators (e.g. `mx.rfc`, `co.nit`) without leaking
  fiscal vocabulary into the SDK.

**app-providers:**

- New `OrgConfigProvider` + `useOrgConfig()` companion to
  `PlatformConfigProvider`. Apps wire a per-org config fetcher and the
  provider exposes typed `currency`, `locale`, `validators` plus a
  `resolveValidator(refOrKey)` helper for the `$org.<key>` reference
  contract the kernel ≥ v0.9.0 emits.
