# @asteby/metacore-inbox

## 0.1.3

### Patch Changes

- 5dae350: Postbuild fix-dist-esm-imports: los imports relativos de dist/ llevan extension (.js) para que Node ESM los resuelva; i18n importa sus JSON con `with { type: 'json' }`.
- Updated dependencies [5dae350]
  - @asteby/metacore-lib@0.12.1

## 0.1.2

### Patch Changes

- 3a77028: Skeletons por tokens y densidad: `Skeleton` toma el radio de `--skeleton-radius`; nuevos `SkeletonRow`/`SkeletonList` dimensionados por `--skeleton-row-h`, `--skeleton-avatar` y `--skeleton-line-h`, que se compactan con `data-ui-density='compact'` (tokens en `@asteby/metacore-theme`). El dropdown de notificaciones muestra filas esqueleto del tamano de la fila real en vez de texto; el esqueleto de `inbox` usa los mismos tokens.
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

- 4c3b32c: Dos paquetes nuevos. `@asteby/metacore-inbox`: componentes de bandeja agnósticos del canal (ConversationList virtualizada, ThreadView con mensajes agrupados, citas colapsables y adjuntos, Composer con borradores autoguardados, identidad de envío y adjuntos, HtmlSandboxFrame con iframe sin scripts, CSP estricta e imágenes remotas bloqueadas por defecto, ProposalCard, atajos de teclado estilo Superhuman, estados vacío/carga/error, es/en). `@asteby/metacore-setup-wizard`: StepWizard genérico (estados pendiente/en curso/ok/error, diagnóstico, reintento, reanudable, verificación en vivo con polling configurable), DomainSetupWizard, DnsRecordRow y LiveStatusBadge.
