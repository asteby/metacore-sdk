---
"create-metacore-addon": minor
---

Plantilla `embedded-page` y comando `add view`.

- `--template embedded-page`: addon con una página federada embebida (`frontend.pages[]`, layout `shell`, `budget_kb` 60) hecha con `definePage` y los hooks del host (`useHostApi`, `usePageChrome`, `useBreadcrumbs`, `useAddonNavigate`), su prueba con `renderWithHost`, un harness de desarrollo con host simulado, una ruta `contributions.api` servida por un export WASM (`summary`, auth `staff`) y, al lado, una vista declarativa `split` del modelo. El README pide justificar la página (declarativo primero). El build usa `metacoreFederationShared({ manifest })` y `metacorePageBudgetPlugin`.
- `create-metacore-addon add view --type <map|timeline|calendar|chart|split> [--model …] [dir]`: agrega a `manifest.json` solo JSON declarativo (una entrada de navegación con `view_type` y su bloque `view`), infiere columnas del modelo y rechaza columnas inexistentes, tipos fuera del conjunto y duplicados. Las salidas de referencia se validan con el kernel (`v3.Validate`) en la suite de Go.
- Toda plantilla sustituye los marcadores en sus archivos de texto (`.ts`, `.tsx`, `.json`, `.go`, `.sql`…), no solo en una lista fija de nombres.
