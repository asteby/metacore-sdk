---
'@asteby/metacore-starter-core': patch
---

Replace the duplicated `direction-provider`, `font-provider`, `layout-provider`, and `search-provider` files under `src/context/` with thin re-exports from `@asteby/metacore-app-providers`, which is the source of truth for transport-agnostic context providers in the metacore ecosystem.

The duplicates were never part of starter-core's published surface (the package only ships `lib/` + `components/ui/` from `src/index.ts`), so this is a no-op for consumers — but it removes ~250 lines of drift-prone copy/paste and ensures any future tweak to a provider lands in one place.

Two real divergences from the legacy starter copies are intentional and live in the source of truth:

- `FontProvider` now requires an explicit `fonts` prop (use `import { fonts } from '@asteby/metacore-starter-config/fonts'`) instead of reading a hard-coded list.
- `SearchProvider` no longer auto-renders `<CommandMenu />`; apps mount their own command menu inside the authenticated layout.
