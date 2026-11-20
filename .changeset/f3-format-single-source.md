---
"@asteby/metacore-lib": minor
"@asteby/metacore-app-providers": patch
"@asteby/metacore-runtime-react": patch
"@asteby/metacore-genui": patch
"@asteby/metacore-charts": patch
"@asteby/metacore-dataload": patch
"@asteby/metacore-inbox": patch
---

Formateo unificado en `@asteby/metacore-lib`, sin defaults regionales.

- lib (minor): `formatAmount` (moneda con decimales propios de la divisa via Intl: JPY 0, KWD 3; sin moneda -> numero plano sin simbolo), `formatLocalizedDate`, `relativeTime`, `formatBytes`, `compareVersions`. `formatCurrency` queda `@deprecated` con el mismo comportamiento. Solo presentacion: el calculo/redondeo va en `MoneyValue` y en moneykit del backend.
- app-providers: nuevo `useFormatMoney()` (moneda y locale de `useOrgConfig`). `FALLBACK_ORG_CONFIG` ahora tiene `currency`/`locale` vacios (antes `USD`/`en-US`): una org sin configurar ya no inventa moneda.
- genui, runtime-react (panels, card-spec), charts: se quitan los fallbacks `MXN`/`USD`; sin moneda se muestra el numero sin simbolo. `ConfigurableCard`/`resolveCard` aceptan `currency`.
- dataload, inbox: `formatBytes` delega en lib (inbox: 10-100 KB ahora muestra un decimal).
