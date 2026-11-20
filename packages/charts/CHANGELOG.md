# @asteby/metacore-charts

## 0.1.2

### Patch Changes

- Updated dependencies [4b0ce51]
  - @asteby/metacore-lib@0.12.0

## 0.1.1

### Patch Changes

- 2393365: Formateo unificado en `@asteby/metacore-lib`, sin defaults regionales.

  - lib (minor): `formatAmount` (moneda con decimales propios de la divisa via Intl: JPY 0, KWD 3; sin moneda -> numero plano sin simbolo), `formatLocalizedDate`, `relativeTime`, `formatBytes`, `compareVersions`. `formatCurrency` queda `@deprecated` con el mismo comportamiento. Solo presentacion: el calculo/redondeo va en `MoneyValue` y en moneykit del backend.
  - app-providers: nuevo `useFormatMoney()` (moneda y locale de `useOrgConfig`). `FALLBACK_ORG_CONFIG` ahora tiene `currency`/`locale` vacios (antes `USD`/`en-US`): una org sin configurar ya no inventa moneda.
  - genui, runtime-react (panels, card-spec), charts: se quitan los fallbacks `MXN`/`USD`; sin moneda se muestra el numero sin simbolo. `ConfigurableCard`/`resolveCard` aceptan `currency`.
  - dataload, inbox: `formatBytes` delega en lib (inbox: 10-100 KB ahora muestra un decimal).

- Updated dependencies [2393365]
  - @asteby/metacore-lib@0.11.0

## 0.1.0

### Minor Changes

- bb03d31: New `@asteby/metacore-charts` package (the `ui.charts` page share): shared chart palette and value formatting, a dependency-free SVG `Sparkline`, and lazy `BarChart`/`LineChart`/`AreaChart`/`PieChart`/`DonutChart` (recharts loads on demand; eager bodies at `@asteby/metacore-charts/recharts`). `@asteby/metacore-runtime-react` now builds its dashboard chart widgets on it, keeps re-exporting everything it exposed before (`BarWidget`…, `formatWidgetValue`, `paletteColor`, …) and also re-exports `Sparkline`.
