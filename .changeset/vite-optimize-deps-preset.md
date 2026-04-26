---
'@asteby/metacore-starter-config': minor
---

feat(starter-config): export `metacoreOptimizeDeps` preset

Apps que consumen `@asteby/metacore-*` (linkeados via `file:`/workspace) topaban
con `Failed to resolve module specifier` en el browser porque Vite por defecto
no pre-bundlea linked deps y los `dist/*.js` se servían con imports bare.

Se expone un nuevo preset `metacoreOptimizeDeps` (lista de includes para
esbuild) y se mergea automáticamente dentro de `defineMetacoreConfig`, así las
apps consumidoras quedan blindadas con una sola línea:

```ts
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  optimizeDeps: metacoreOptimizeDeps,
  // ...
})
```
