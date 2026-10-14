# @asteby/metacore-theme

## 2.28.0

### Minor Changes

- 944dd83: Contraste WCAG AA garantizado en los tokens.

  - `@asteby/metacore-theme`: nuevo módulo `contrast` (`contrastRatio`, `composite`, `flatten`, `ensureContrast`, `mostReadable`, `parseColor`) exportado también en `@asteby/metacore-theme/contrast`. Tokens claros/oscuros/glass ajustados para AA: `--primary`, `--accent-foreground`, `--destructive`, `--success`/`--warning`/`--info` (texto y badge), `--input` como borde de control a 3:1, `--ring` legible al 50 % en oscuro, `--primary-foreground`/`--destructive-foreground` oscuros sobre los tonos claros del modo oscuro. Nuevos `--success-foreground`, `--warning-foreground`, `--info-foreground`, `--chart-6..8` y `--color-widget-*` (series de gráficas ≥ 3:1 en ambos modos). `preset.ts` vuelve a reflejar `tokens.css`. La prueba `tokens-contrast.test.ts` mide cada par (en glass, sobre la superficie compuesta y los extremos del degradado) y falla CI por debajo de AA.
  - `@asteby/metacore-app-providers`: `applyBranding` deriva la marca con contraste garantizado: en oscuro el primario sube de luminosidad hasta 4.5:1 como texto (marcas profundas como navy o índigo ya no se pierden en el lienzo), el texto sobre el primario siempre cumple 4.5:1, el anillo de foco se calcula para 3:1 al 50 % y `--input` para 3:1. Nueva función pura `deriveBrandTokens(primary, accent, mode)`.
  - `@asteby/metacore-ui`: `generateBadgeStyles` (badges de opciones por color) aclara/oscurece el texto hasta 4.5:1 sobre su fondo teñido; colores navy, pizarra o vino ya no desaparecen sobre tarjetas oscuras.

## 2.27.0

### Minor Changes

- bdc8a60: glass.css: el fondo se arma con las variables `--glass-gradient-1..3` y `--glass-backdrop`. Una marca cambia los tonos sobrescribiendo solo esas variables (sin reescribir `background-image`). El resultado visual por defecto no cambia.

## 2.26.0

### Minor Changes

- f22952c: `themeBootScript({ defaultAttrs })`: a vertical can declare the `data-*` attributes (e.g. `{ 'data-ui-theme': 'glass' }`) painted on `<html>` for a first visit, before any theme has been stored. Once the providers have stored a theme the option is ignored, so a user's or org's real pick is never overridden. Replaces hand-rolled localStorage seeding in the host's `index.html`.

## 2.25.1

### Patch Changes

- 2c03701: El pack Glass (`glass.css`) solo daba el tratamiento de "panel flotante" (rim, sombra, clip) a `sidebar-inset` y a diálogos/popovers. Cualquier `.bg-card` suelto (una tarjeta de settings, un estado vacío) solo recibía translucidez + blur, sin rim ni elevación — contra el fondo degradado ya visible se veía como un rectángulo opaco plano en vez de un panel de vidrio flotante.

  Se agrega el mismo tratamiento a `.bg-card`, pero con `--border` (el hairline oscuro, ya documentado como "a dark hairline reads on white glass, a white one doesn't") en vez de `--glass-rim` (blanco): `.bg-card` vive anidado un nivel más adentro, ya dentro del fondo casi-blanco diluido por el blur del panel padre — ahí un rim blanco es blanco sobre blanco, invisible.

## 2.25.0

### Minor Changes

- a8b3bce: glass.css: el inset flotante respeta el chrome fijo del host mediante `--app-topbar-h`, `--app-notice-h` y `--app-bottombar-h` (default 0, sin cambios si no se definen). Nuevas variables opt-in para que el panel flote en móvil (`--glass-mobile-gutter`, `--glass-mobile-radius`, `--glass-mobile-border-width`, `--glass-mobile-shadow`), `--glass-inset-max-height` y `data-glass-float` para un inset sin sidebar hermano. La hoja del sidebar móvil también descuenta topbar/notice/bottombar.

## 2.23.0

### Minor Changes

- 80ff0ba: Recargar ya no parpadea ni mueve nada por el tema o los íconos.

  - theme: `@asteby/metacore-theme/boot` con `themeBootScript()`, un script inline para el inicio de `<head>` que vuelve a pintar, antes del primer frame, el tema que el usuario vio la última vez (claro/oscuro, `data-ui-*`, clases `font-*`, variables de marca y la hoja de superficies). En la primera visita sigue `prefers-color-scheme`. `ThemeProvider` guarda ese estado (`persistBoot`, activo por defecto) y reactiva las transiciones cuando monta; no toca `<html>` si la clase ya es la correcta.
  - ui: registro de glifos compartido en `@asteby/metacore-ui/icons` (`Glyph`, `getGlyph`, `loadGlyph`, `preloadGlyphs`, `registerGlyphs`). Un glifo visto antes se dibuja en el primer render desde localStorage, cada nombre conserva un solo componente y, mientras uno nuevo carga, `<Glyph>` ocupa su tamaño con un `<svg>` vacío. `resolveIconName` usa el mismo registro.
  - runtime-react: `DynamicIcon` dibuja con `Glyph`, así que las acciones de tabla y los menús ya no aparecen sin ícono para después empujar el texto, tampoco al volver a abrir un menú. Los nombres con dígito (`Trash2`, `Building2`) resuelven su glifo. `DynamicTable` precarga los íconos de las acciones al recibir la metadata.
  - app-providers: mientras `/org/branding` responde, `PlatformConfigProvider` usa la marca cacheada, no los defaults, y solo vuelve a pintar los tokens cuando cambia claro/oscuro; aplicar la marca o la fuente no escribe en `<html>` si el valor no cambió.

## 2.21.0

### Minor Changes

- bd81d54: Superficies semánticas y registro de resultados del agente.

  - `@asteby/metacore-theme`: tokens de estado `--success`, `--warning`, `--info` (claro y oscuro) y tokens `--surface-panel`, `--surface-raised`, `--surface-field`, `--border-rim`, `--elevation-raised|panel|float`, `--backdrop-panel`, `--radius-panel` y `--radius-field` con defaults en `tokens.css`; `glass.css` los redefine con la receta de vidrio. Una pantalla que pinta con ellos hereda cualquier theme pack sin saber cuál está activo.
  - `@asteby/metacore-runtime-react`: `registerAgentResultRenderer(kind, Component, { model? })` y `<AgentResultView result />`. Cada resultado de herramienta que muestra un agente (registro, vista, conteo, plan, acción…) se pinta con el renderer registrado para su `kind` (o `kind` + modelo); un addon puede registrar el suyo y un `kind` sin renderer no muestra nada, nunca el payload crudo.

## 2.20.0

### Minor Changes

- 38537d4: `useOptimisticMutation` (runtime-react): escritura optimista sobre una entrada de caché de TanStack Query con rollback al último valor confirmado, escrituras serializadas por `queryKey` (el último clic es la última escritura), descarte de dobles clics, `debounceMs` para ráfagas (arrastrar y soltar) con flush al desmontar, `reconcile` para escribir la respuesta del servidor sin refetch y `retry()` para el toast "Reintentar".

  `useFlipAnimation` (runtime-react): animación FLIP de reordenamiento de cualquier lista (Web Animations API sobre `transform`), con snapshots en reposo fuera del render y respeto a `prefers-reduced-motion`.

  Tokens de motion (theme): `motionTokens` y variables `--motion-duration-{instant,fast,moderate,slow}` / `--motion-ease-{standard,emphasized,exit}` en `tokens.css` (duraciones en 0 con `prefers-reduced-motion: reduce`). runtime-react los lee con `motionDuration()` / `motionEasing()` y cae a los mismos valores si el host no los define.

## 2.19.0

### Minor Changes

- 9d52fc5: Nuevo `@asteby/metacore-theme/glass.css`: el tema glass (`<html data-ui-theme="glass">`) como hoja genérica sobre los `data-slot` de `@asteby/metacore-ui`. Sidebar e inset son paneles flotantes con borde hairline, brillo interior arriba, sombra en capas, blur y saturación, y funciona con el sidebar colapsado, con la sheet móvil y con las variantes `sidebar`/`floating`/`inset`. Diálogos, sheets, popovers, selects y menús usan vidrio denso con overlay difuminado. Los inputs tienen fondo translúcido y foco con el color de marca. Las tablas llevan header translúcido con blur, hover sutil en filas y celdas sticky legibles. Nunca define `--primary`: el acento es siempre el de la marca. Incluye fallback casi opaco sin `backdrop-filter` y con `prefers-reduced-transparency`, más modo oscuro.

## 2.12.2

### Patch Changes

- 676f116: fix(theme): use transition instead of keyframe for CollapsibleContent

  `.CollapsibleContent` used a keyframe `animation: slideDown/slideUp` that runs on
  initial mount. For `defaultOpen` sidebar groups the Radix height is not yet
  measured on first paint, so the group can settle at a wrong height and overlap the
  group below it (visible when returning from a full-screen route that remounts the
  sidebar, e.g. the POS). Replaced the keyframe with a `transition: height` gated
  behind `prefers-reduced-motion`, which does not run on first paint. This mirrors
  the existing ops-side fix; consuming the theme stylesheet directly no longer
  carries the latent bug.

## 2.0.0

### Major Changes

- 0e8db78: Promote three critical SDK packages to **1.0.0**. This is a stability promotion — the public surface of each package has been exercised by every metacore app in production (`link`, `ops`, `hub/landing`, `hub/frontend`, `fullstack-starter`) and is now committed under semver.

  No breaking API changes ship in this bump.
  - `@asteby/metacore-theme` (0.3 → 1.0): tokens, CSS-variable contract (`--primary`, `--background`, `--sidebar-*`, …), `themeConfig` shape, `ThemeProvider` / `useTheme`, and the `./preset` / `./fonts` / `./tokens.css` / `./index.css` subpaths are all stable. Internal `oklch` values may still re-tune in minor releases.
  - `@asteby/metacore-starter-config` (0.3 → 1.0): the four shared subpaths (`./tailwind`, `./tsconfig`, `./vite`, `./eslint`) plus `./fonts` are stable. `defineMetacoreConfig()` options stay additive within the major.
  - `@asteby/metacore-app-providers` (0.6.5 → 1.0): all providers (`DirectionProvider`, `FontProvider`, `LayoutProvider`, `SearchProvider`, `PlatformConfigProvider`), the `MetacoreAppShell` full kit, `applyBranding` / `applyCachedBranding` helpers, and persistence keys (`dir`, `font`, `layout_variant`, `layout_collapsible`, `platform-branding`) are locked. Optional peers (`@asteby/metacore-pwa`, `@asteby/metacore-runtime-react`, `@asteby/metacore-ui`, `sonner`) keep their independent cadence via the declared peer ranges.

## 0.3.0

### Minor Changes

- e23eede: Publicación inicial a npm del ecosistema metacore.

  Propaga los 13 paquetes del SDK al registry público para que las host applications consumidoras migren de `file:` a semver y Renovate pueda propagar updates.

## 0.2.0

### Minor Changes

- Add ThemeProvider and useTheme hook (cookie-based, dark/light/system) so consumer apps can drop their local theme-provider copies.
- 6d243b0: Initial release of the metacore frontend ecosystem.

  11 packages extracted from host application frontends into a publishable monorepo with auto-propagation via Changesets + Renovate.
