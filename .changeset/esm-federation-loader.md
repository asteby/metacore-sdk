---
"@asteby/metacore-runtime-react": minor
---

AddonLoader carga remotes de federación ESM vía `import()` dinámico (fix "Cannot use import statement outside a module").

Los remotes built con Vite/@originjs `format:"esm"` (el estándar de `metacoreFederationShared`) son módulos ES que hacen `import` top-level y exportan `{ init, get }` — DEBEN cargarse como módulo. El `AddonLoader` los inyectaba como `<script>` clásico → el browser tiraba `Cannot use import statement outside a module` y la UI federada nunca cargaba. Ahora hace `import()` dinámico (vía `new Function` para que ningún bundler reescriba el import del URL externo) y usa el namespace del módulo como container; los remotes legacy "var"/window siguen soportados con fallback a `<script>` + `window[scope]`.
