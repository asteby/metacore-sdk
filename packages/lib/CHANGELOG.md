# @asteby/metacore-lib

## 0.9.0

### Minor Changes

- 3bac869: `pricing`: derivación y redondeo de precios por mercado (`roundPrice`, `derivePrice`, `validateRoundingRule`, `pricingErrorCode`), gemelo exacto (bigint, sin `number`) de `shared/pricederive` de addons. Regla `{increment, ending, direction}` por conjunto de candidatos (`up` ≥ x, `down` ≤ x, `nearest` con empate arriba): corrige la fórmula del ADR §6.3 (93.995 con `.99 up` = 94.99). Vectores `src/__fixtures__/pricing.golden.json` = copia byte a byte del Go, fijada por sha256. Nueva entrada `@asteby/metacore-lib/pricing`.

## 0.8.0

### Minor Changes

- 4be706e: Nuevo módulo `@asteby/metacore-lib/money` (también exportado desde el índice): tipo `Money = { amount, currency_code }` (mismo contrato que `@asteby/storefront` y que el kernel), `CurrencySpec`, `RoundingMode` (`halfAwayFromZero` por defecto, `halfEven`, `towardZero`, `awayFromZero`, `floor`, `ceil`) y la clase inmutable `MoneyValue` sobre `bigint` con `parse`/`parseRound`, `add`, `sub`, `mulDecimal`, `allocate` por resto mayor (las partes suman el total), `roundCash`, `convert` (tasa = unidades de QUOTE por 1 de BASE), `toJSON` y `toString`; errores `CurrencyMismatchError`, `PrecisionError`, `OverflowError` e `InvalidMoneyError`. `inverseRate` (escala 12, `halfEven`), `currencySpec(code)` con la tabla ISO 4217 del kernel (las desconocidas caen a `Intl`) y `formatMoney(m, { locale, spec, display })`, que pasa el string decimal a `Intl.NumberFormat` sin `parseFloat` y con `minorUnits` decimales. Comparte con el kernel el archivo golden de vectores (verificado por sha256). `formatCurrency` no cambia.

## 0.7.0

### Minor Changes

- bdc8a60: `formatDuration(seconds, { locale, invalid })`: duración legible con a lo sumo dos unidades («3 h 20 min»), con etiquetas de `Intl` según el locale (es-MX por defecto).

## 0.6.0

### Minor Changes

- 4525ddc: Respuestas HTML en endpoints de API ya no llegan como mensaje. `@asteby/metacore-lib/http-errors` agrega `HtmlResponseError` (mensaje humano, `details()` colapsable, `correlationId`), `detectHtmlResponse` y `looksLikeHtml`; `handleServerError` nunca devuelve una página HTML como mensaje. `createApiClient` rechaza con `HtmlResponseError` cuando la respuesta es HTML (catch-all de una SPA, página de error de un proxy) o cuando un JSON trae una página HTML en `message`; `htmlErrorMessage` permite localizar el texto y `responseType: 'text'` lo desactiva por petición.

## 0.5.0

### Minor Changes

- 825b307: Add `detectTimezone()` (browser IANA zone, empty when undetectable) and drop the Mexico-biased fallback list from `getAllTimezones()`: engines without `Intl.supportedValuesOf` now get the detected zone + UTC. No country is ever a default.

## 0.4.0

### Minor Changes

- 64de425: Add `showSubmittedData` helper (re-exported from the package root and from the `./show-submitted-data` subpath). Renders a sonner toast that pretty-prints any payload as JSON — convenience for showcase / demo forms that want to confirm the submitted shape without wiring a real success path.

  `react` and `sonner` are declared as optional peer dependencies (the rest of `@asteby/metacore-lib` remains React-free).

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
