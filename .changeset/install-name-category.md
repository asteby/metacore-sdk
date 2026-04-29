---
'@asteby/metacore-app-providers': patch
---

`MetacoreInstallRequest` now carries `name` + `category` from the Hub. The install listener forwards them to the backend so the host can persist a display name and render "Activos Fijos" in the sidebar instead of the raw `addon_key`.

Pairs with `metacore-kernel/marketplace` adding the same columns and `asteby-hq/hub` forwarding the localised values from the iframe.
