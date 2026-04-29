---
'@asteby/metacore-app-providers': patch
---

Drop the metadata cache after a successful addon install so the next read of `/metadata/all` (sidebar, dashboard) picks up whatever models the new addon registered. Best-effort — silently no-ops if `useMetadataCache` shape changes.
