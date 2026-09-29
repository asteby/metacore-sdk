# @asteby/metacore-lib

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
