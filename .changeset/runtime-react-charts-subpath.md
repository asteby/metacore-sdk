---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-agent-workspace": patch
---

recharts sale del grafo estático del índice de `runtime-react`. Los widgets `BarWidget`, `LineWidget`, `AreaWidget`, `PieWidget` y `DonutWidget` del índice (y `WidgetRenderer`/`DashboardGrid`) ahora son fachadas con `React.lazy` que descargan recharts solo cuando un tablero pinta una gráfica; antes el share de runtime-react lo arrastraba al primer pintado del shell. Los componentes con recharts viven en el nuevo subpath `@asteby/metacore-runtime-react/charts`, y `preloadWidgetCharts()` calienta el chunk. Los nombres exportados no cambian.

Una sola versión de recharts en el ecosistema: `runtime-react` pasa de `^2.15.0` a `^3.8.1` (la que ya usan OPS y `agent-workspace`), y el peer de `agent-workspace` sube a `>=3`. Un test de grafo estático (`index-static-graph`) falla si recharts, maplibre-gl u otras librerías pesadas vuelven a entrar al índice.
