---
"@asteby/metacore-starter-config": minor
---

Páginas federadas en el build.

- `@tanstack/react-router` entra a `METACORE_FEDERATION_SINGLETONS` (una sola instancia del router del host). En remotes (`role: 'remote'`, por omisión cuando hay `exposes`) se declara con `import: false`, así que un addon que no instala el router sigue construyendo y nunca empaqueta su copia.
- Shares perezosos de páginas: `METACORE_PAGE_SHARES` (`@asteby/metacore-maps`, `maplibre-gl`, `@asteby/metacore-charts`, `recharts`; el conjunto cerrado del kernel) con `singleton`, `eager: false` y, en remotes, `import: false`. Cualquier otro nombre falla.
- `metacoreFederationShared({ manifest, exposes })` exige que cada `frontend.pages[].expose` esté en `exposes` y declara los `shares` de cada página; los hosts pasan `pageShares`.
- `metacorePageBudgetPlugin({ manifest, exposes })` mide cada expose sobre el grafo real de chunks (gzip, sin shares ni runtime de MF; lo perezoso se reporta aparte), falla el build si una página pasa su `budget_kb` (≤ 150) y escribe `metacore-pages.json` junto a `remoteEntry.js` para `metacore build` y el hub. Probado con un build real de Vite + `@module-federation/vite`.
