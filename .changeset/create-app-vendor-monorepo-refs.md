---
'@asteby/create-metacore-app': patch
---

`--example` ya deja el proyecto compilable fuera del monorepo. Además de congelar `workspace:*`, ahora descarga los archivos de la raíz que el ejemplo referencia (`../../../tsconfig.base.json` en los `extends`, `../../../scripts/*.mjs` en los scripts de `package.json`), los copia junto al paquete que los usa y reescribe la ruta. Antes el primer `pnpm build` fallaba con `TS5083: Cannot read file '/tsconfig.base.json'` y `Cannot find module '/scripts/gen-route-tree.mjs'`. Si una descarga falla se avisa y la referencia queda intacta.
