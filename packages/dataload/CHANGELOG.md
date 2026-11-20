# @asteby/metacore-dataload

## 0.1.4

### Patch Changes

- 5dae350: Postbuild fix-dist-esm-imports: los imports relativos de dist/ llevan extension (.js) para que Node ESM los resuelva; i18n importa sus JSON con `with { type: 'json' }`.
- Updated dependencies [5dae350]
  - @asteby/metacore-lib@0.12.1

## 0.1.3

### Patch Changes

- Updated dependencies [4b0ce51]
  - @asteby/metacore-lib@0.12.0

## 0.1.2

### Patch Changes

- 2393365: Formateo unificado en `@asteby/metacore-lib`, sin defaults regionales.

  - lib (minor): `formatAmount` (moneda con decimales propios de la divisa via Intl: JPY 0, KWD 3; sin moneda -> numero plano sin simbolo), `formatLocalizedDate`, `relativeTime`, `formatBytes`, `compareVersions`. `formatCurrency` queda `@deprecated` con el mismo comportamiento. Solo presentacion: el calculo/redondeo va en `MoneyValue` y en moneykit del backend.
  - app-providers: nuevo `useFormatMoney()` (moneda y locale de `useOrgConfig`). `FALLBACK_ORG_CONFIG` ahora tiene `currency`/`locale` vacios (antes `USD`/`en-US`): una org sin configurar ya no inventa moneda.
  - genui, runtime-react (panels, card-spec), charts: se quitan los fallbacks `MXN`/`USD`; sin moneda se muestra el numero sin simbolo. `ConfigurableCard`/`resolveCard` aceptan `currency`.
  - dataload, inbox: `formatBytes` delega en lib (inbox: 10-100 KB ahora muestra un decimal).

- Updated dependencies [2393365]
  - @asteby/metacore-lib@0.11.0

## 0.1.1

### Patch Changes

- 46da5c6: `@asteby/metacore-lib/envelope`: una sola implementación del envelope `{success,data,meta}` y de los mensajes de error. Nuevos `unwrapEnvelope(body)`, `unwrapResponse(res)`, `unwrapList(body)` / `unwrapListResponse(res)` (`items` + `meta.total`), `ApiError` / `isApiError`, `isEnvelope`, `getApiErrorMessage(err, fallback)` e `isAbortError`. Los `unwrap` locales de automations, dataload, org-ai, billing, runtime-react y agent-workspace usan ahora este módulo (agent-workspace sigue re-exportando `getApiErrorMessage`). CI rechaza `.data.data` nuevo (`scripts/check-no-data-data.mjs`, baseline ratcheteado).
- Updated dependencies [46da5c6]
  - @asteby/metacore-lib@0.10.0

## 0.1.0

### Minor Changes

- a74ae34: Nuevo paquete `@asteby/metacore-dataload`: cliente TS tipado del motor de carga genérico del kernel (perfiles, dry-run y diff, ejecución asíncrona, estado y progreso, historial y estado del respaldo de medios por sha256), hooks de React Query y el componente `DataloadLauncher` para lanzar una carga, revisar el diff y seguir el avance (temas claro/oscuro, móvil).
- a74ae34: Cliente alineado con el contrato real de OPS (`/api/dataload`):

  - `listProfiles()` devuelve `ProfileSummary[]` (versiones del catálogo base compartido y de la organización); `profileVersion()` trae una versión completa; `saveProfile` se reemplaza por `publishVersion()` (las versiones son inmutables: misma huella = no-op, otra = 409). El lanzador referencia perfiles como `nombre@versión` / `base/nombre@versión` (`profileRef`) y ya no truena con la respuesta de OPS.
  - `runPlan(id, { action, offset, limit })` devuelve `PlanPage` paginado en el servidor; `reviews()` devuelve `ReviewPage` (`items`, `counts`, `next`) y `listAllReviews()` sigue el cursor.
  - La ejecución aplica exactamente lo simulado: `expectPlanHash`, la versión resuelta por el dry-run (`run.registry`) y `source: { id }` (la fuente ya guardada; no se vuelve a subir). Ante el 409 de plan cambiado (`isPlanChanged`) el lanzador descarta el plan y pide simular de nuevo (`planChanged`).
  - Tipos al día con el kernel: `duplicates`, `maxStreamRows`, `progress.superseded`, `run.registry`, `ReviewEntry.baseHash`, estado `applying`, `ManifestEntry.validatedAt/revisions`, `MediaJob.revalidate/outcome`.
  - Prueba de contrato contra respuestas reales del handler de OPS (`src/__fixtures__/ops`).

  Cambio incompatible: `saveProfile`/`StoredProfile` se retiran; `runPlan` y `reviews` devuelven páginas.

- a74ae34: Pulido de `@asteby/metacore-dataload`:

  - **Cola de revisión** (`ReviewQueue`, `useDataloadReviews`, `useReviewActions`): filas `review` con motivo, resultado y diff (del plan guardado de la corrida), aprobar o rechazar una o en lote con comentario, estado por decisión (pendiente, aprobada, rechazada, aplicada, resuelta por otra carga) y "aplicar aprobadas" (`apply_reviewed`). Una decisión viaja con la huella de la fila; si la fila cambió (409) la cola se recarga.
  - **Subida por partes** más allá del límite en línea de 25 MB: `uploadSourceFile` / `useSourceFile` con progreso, reintento con espera exponencial por parte, reanudación sin reenviar lo que el servidor ya tiene, cancelación (descarta la subida) y sha256 por parte. Las fuentes ahora pueden ser `{ uploadId }` además de `{ content }`.
  - **UI sensible a permisos**: `capabilities` (`launch`, `cancel`, `approve`, `retryMedia`, `verifyMedia`, `editOverrides`) oculta o deshabilita controles. Sin `capabilities` se ofrece todo; con un objeto, lo que falta se niega.
  - **i18n**: todas las cadenas por clave, catálogos `es-MX` y `en-US` (`locale`), `messages` y `t` inyectables y `DataloadProvider` para fijarlo una vez. `DATALOAD_MESSAGES_ES` queda como alias obsoleto de `DATALOAD_MESSAGES_ES_MX`.
  - **Editor de ajustes por organización** (`OverridesEditor`): ignorar columnas, encabezados adicionales, quitar campos, valores por omisión y limpieza global o por campo, validado con las reglas del kernel (`validateOverrides`, `resolveProfile`) y con vista previa del plan por dry-run.
  - **Tipos al día con el kernel**: acción `review` con `review`/`outcome` por fila, `progress.review`, `run.review`, `checkpoint`, nuevas reglas de limpieza (`sanitize_html`, `collapse_blank_lines`, `auto_paragraphs`, `drop_lines:<regex>`), `cleanAdd`/`valuesAdd`, `finish`, `split`, `applyOrder`.
  - **Accesibilidad**: tablas con `caption` y encabezados, regiones desplazables enfocables, foco visible en campos nativos, `aria-live` para subida, avance y decisiones.

  Cambio de tipos: `RowPlan.review` y `DataloadRun.review` son obligatorios (el cliente los normaliza a `[]`); `DataloadSourceInput` es una unión (`InlineSourceInput | UploadedSourceInput`).
