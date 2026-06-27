---
"@asteby/metacore-runtime-react": minor
---

DynamicKanban: traduce el label de cada etapa via i18n (`t(stage.label)` con fallback al valor crudo) — antes mostraba la key cruda (ej. `integration_github.stage.backlog`) en vez de "Backlog". Y da min-height a las lanes para que el scroll horizontal del board quede abajo en vez de flotar cuando las columnas están vacías.
