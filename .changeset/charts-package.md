---
"@asteby/metacore-charts": minor
"@asteby/metacore-runtime-react": minor
---

New `@asteby/metacore-charts` package (the `ui.charts` page share): shared chart palette and value formatting, a dependency-free SVG `Sparkline`, and lazy `BarChart`/`LineChart`/`AreaChart`/`PieChart`/`DonutChart` (recharts loads on demand; eager bodies at `@asteby/metacore-charts/recharts`). `@asteby/metacore-runtime-react` now builds its dashboard chart widgets on it, keeps re-exporting everything it exposed before (`BarWidget`…, `formatWidgetValue`, `paletteColor`, …) and also re-exports `Sparkline`.
