---
"@asteby/metacore-sdk": major
"create-metacore-addon": major
---

Migrate the SDK toolchain from Module Contract v2 to v3.

The CLI now validates and emits **v3** manifests (`apiVersion:
"asteby.com/v3"`) via the kernel's strict `manifest/v3` parser, and the kernel
dependency is bumped to `v0.20.0`. `metacore init` and `create-metacore-addon`
scaffold v3 manifests (`kind`, nested `metadata{}`, `compatibility{}`,
`models[]`, `contributions{}`, `extension_points{}`, `rbac{}`).

**Breaking — `@asteby/metacore-sdk`:** the canonical `Manifest` and related
exported types now mirror the v3 contract (`metadata.key`, `models[]`,
`contributions.actions[]`, …). The legacy v2 types remain available — the
v2-only names (`ModelDefinition`, `ColumnDef`, `ActionDef`, `BackendSpec`,
`HookDef`, `ToolDef`, …) are re-exported unchanged, and the names that collide
with v3 (`Manifest`, `Capability`, `NavGroup`, …) are re-exported under a
`Legacy*` alias. Runtime/host-facing surfaces (`MarketplaceClient`,
`AddonAPI`, `MetacoreProvider`) consume the host's legacy/flat manifest
projection (`LegacyManifest`), which is unchanged.

The kernel continues to dual-read v2 manifests during the 3.x line, so
already-published v2 addons keep installing.
