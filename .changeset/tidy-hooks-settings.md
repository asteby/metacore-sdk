---
"@asteby/metacore-runtime-react": minor
---

Add `useAddonSettings` / `useUpdateAddonSettings` — the standard primitive for reading an addon's per-organization configuration from a federated addon, backed by react-query and the host-injected api client. Merges caller-provided defaults (mirroring the manifest's `settings[].default`) under the saved org values, so a never-saved setting falls back to its default. Also exports the pure `mergeAddonSettings` helper and the stable `addonSettingsKey` query key.
