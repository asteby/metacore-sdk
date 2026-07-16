---
"@asteby/metacore-sdk": patch
---

feat(react): cache installed-addon catalog for instant reload

`MetacoreProvider` fetched manifests + navigation into empty state, so a full
reload showed the sidebar without its addon modules ("Módulos") until both calls
resolved. Persist the catalog to localStorage and hydrate the initial state from
it so a reload paints the addon modules instantly and revalidates in the
background (stale-while-revalidate).
