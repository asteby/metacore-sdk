# @asteby/metacore-starter-config

## 0.3.0

### Minor Changes

- 046ad96: feat(starter-config): export `metacoreOptimizeDeps` preset

  Apps que consumen `@asteby/metacore-*` (linkeados via `file:`/workspace) topaban
  con `Failed to resolve module specifier` en el browser porque Vite por defecto
  no pre-bundlea linked deps y los `dist/*.js` se servían con imports bare.

  Se expone un nuevo preset `metacoreOptimizeDeps` (lista de includes para
  esbuild) y se mergea automáticamente dentro de `defineMetacoreConfig`, así las
  apps consumidoras quedan blindadas con una sola línea:

  ```ts
  import { metacoreOptimizeDeps } from "@asteby/metacore-starter-config/vite";

  export default defineConfig({
    optimizeDeps: metacoreOptimizeDeps,
    // ...
  });
  ```

## 0.2.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.
