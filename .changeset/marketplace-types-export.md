---
"@asteby/metacore-sdk": minor
---

Export marketplace types via new `@asteby/metacore-sdk/marketplace` sub-path. Adds CatalogAddon, AddonDetail, AddonVersion (hub catalog shapes) and re-exports the manifest types so hub/landing and hub/frontend stop redeclaring them.