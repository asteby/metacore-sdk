---
'@asteby/metacore-theme': minor
'@asteby/metacore-runtime-react': minor
---

Superficies semánticas y registro de resultados del agente.

- `@asteby/metacore-theme`: tokens de estado `--success`, `--warning`, `--info` (claro y oscuro) y tokens `--surface-panel`, `--surface-raised`, `--surface-field`, `--border-rim`, `--elevation-raised|panel|float`, `--backdrop-panel`, `--radius-panel` y `--radius-field` con defaults en `tokens.css`; `glass.css` los redefine con la receta de vidrio. Una pantalla que pinta con ellos hereda cualquier theme pack sin saber cuál está activo.
- `@asteby/metacore-runtime-react`: `registerAgentResultRenderer(kind, Component, { model? })` y `<AgentResultView result />`. Cada resultado de herramienta que muestra un agente (registro, vista, conteo, plan, acción…) se pinta con el renderer registrado para su `kind` (o `kind` + modelo); un addon puede registrar el suyo y un `kind` sin renderer no muestra nada, nunca el payload crudo.
