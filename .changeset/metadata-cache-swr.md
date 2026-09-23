---
"@asteby/metacore-runtime-react": patch
---

Always revalidate `/metadata/table` on DynamicCRUDPage cache hit and replace the catalog on `prefetchAll`, so addon toolbar actions cannot stick after HotRegister while zustand localStorage still holds the pre-upgrade snapshot.
