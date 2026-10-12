---
"@asteby/metacore-starter-config": minor
"@asteby/metacore-runtime-react": minor
---

`@module-federation/vite` (starter-config) y `@module-federation/runtime` (runtime-react) pasan de `dependencies` a `peerDependencies` opcionales. Las apps sin microfrontends ya no los instalan; `runtime-react` carga `@module-federation/runtime` de forma diferida sólo al cargar un addon federado. Migración para apps con federación: agregar explícitamente `@module-federation/vite` (devDependency) y `@module-federation/runtime` (dependency) a su `package.json`. La API no cambia.
