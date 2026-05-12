# Tutorials

Walking-through guides for building real metacore addons end-to-end. Each
tutorial is self-contained, copy-pasteable, and validated against the
versions called out in its preamble.

## Index

- [Your first addon — `notes`](./first-addon.md) — manifest, WASM backend,
  federated frontend, hot-swap. The "hello world" that exercises all three
  extension axes (data + UI + logic) without overshooting.

## Coming soon

The slots below are stubs — track [`#docs`](https://github.com/asteby/metacore-sdk/issues?q=label%3Adocs)
for progress.

- **Publishing to the marketplace** — bundling, signing with the addon
  bundle Ed25519 layout, the `marketplace_installations` install flow,
  semver-window declaration. See `docs/PUBLISHING.md` for the current
  draft of the signing path.
- **Custom capabilities** — declaring `http:fetch`, `event:subscribe`,
  `db:read` scopes; the runtime egress SSRF guard; per-installation
  approval prompts. See `docs/capabilities.md` for the in-flight spec.
- **Multi-tenant patterns** — `tenant_isolation: "schema-per-tenant"`,
  per-tenant migrations, regulated-data layouts.

## Reference docs (non-tutorial)

When you need the contract rather than a walkthrough:

- [`docs/manifest-spec.md`](../manifest-spec.md) — every field of
  `manifest.json`.
- [`docs/wasm-abi.md`](../wasm-abi.md) — guest exports / host imports for
  WASM backends.
- [`docs/capabilities.md`](../capabilities.md) — scoped permission model.
- [`docs/full-page-federation.md`](../full-page-federation.md) — the
  `layout: "immersive"` contract.
- [`docs/addon-cookbook.md`](../addon-cookbook.md) — short recipes.
