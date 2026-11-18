# @asteby/metacore-genui

## 2.4.0

### Minor Changes

- d0b72c4: Sincroniza el esquema genui/v2, los vectores de conformidad y el validador TS con el kernel (metacore-kernel#631): `tabs` extendido (variant, default, keep_alive, chrome, label, mobile; opciones con icon, permission y component+props), bloque `section`, `grid.areas/rows/mobile` y `columns` como lista de pistas, `kpi_card`, `stats.items[].action`, `map.select`, `area` en todos los bloques y `component` con formato `<addon>.<nombre>@<n>`. `validate-v2.ts` aplica las mismas reglas que el kernel (opciones de tabs, section, plantilla rectangular y hijos colocados del grid) y pasa los 77 vectores nuevos. Los tipos de `PageGridDef`, `PageSectionDef`, `PageTabsDef`, `PageTabOption` y `PageKpiCardDef` reutilizan los tipos generados.
- d2693f7: Conmutador de vistas en paginas genui: el bloque `tabs` de pagina (`PageBlocks`/`PageView`) admite `variant: "segmented"`, vista activa en `state.<clave>` (deep link via `url_state` de la pagina), opciones con `icon`/`permission`, vistas declarativas, hibridas o custom (`component`), montaje perezoso con `keep_alive` opcional, `chrome` card|bare, teclado/aria y select en movil. Ejemplo: `examples/fleet-switcher.page.json`.

## 2.3.0

### Minor Changes

- d4d52e3: Renderers de pagina para genui v2 (aditivo, sin cambiar lo existente): `PageProvider`/`usePageState`/bus de eventos con `url_state` opcional, `grid` con `areas` (y orden movil), `stats`/`kpi_card` con `$ref` y acciones `set`/`emit`, `section` (modos declarative/hybrid/custom, `chrome` card|bare, estados de carga/error/vacio, ErrorBoundary, `permission`/`on_denied`), `map` con seleccion que escribe estado y emite `select`, y el contrato `defineBlock` (block@1) con stub para el modo custom (sin federacion).

## 2.2.0

### Minor Changes

- 171fb0f: genui/v2 fase 1: bloques `map`, `metric` y `diagram` en el contrato (esquema, reglas por posición y vectores de conformidad compartidos con el kernel), `GenUIProvider` + `registerGenUIBlockRenderer`, renderer `GenUI` (acepta v1 y v2) con bloques stack, grid, tabs, section, text, markdown seguro (sin HTML), alert, empty, card, list, metric y diagram (SVG con layout automático). `@asteby/metacore-maps/genui` registra el bloque `map` como fachada sobre MapView (tono por estado, leyenda por agrupación, tooltip al hover, panel de detalle). `GenerativeUI` (v1) no cambia.

## 2.1.1

### Patch Changes

- 5b7f8e5: Endurecimiento del contrato `genui/v2` antes de los renderizadores: ningún segmento (separado por `.`, `:` o `@`) de una clave i18n `$t`, de `formField.depends_on`, de una clave de fila (`table.rows[]`, `data.*.inline[]`) ni de los identificadores usados como clave de registro (`widget`, `icon`, `addon`, `invoke.action`, `emit.id`, `slot.name`, `ext`, `id` de bloque, `name`) puede ser `__proto__`, `constructor` ni `prototype` (`genui.forbidden_key`; `asset:<id>` de `media.src` por patrón). `key` cierra los segmentos vacíos (`a..b`, `a.`), `depends_on` debe apuntar a un campo del mismo formulario (`genui.unknown_target`) y `propertyNames` admite `x-no-proto`. Un overlay o una fuente llamados `constructor` ahora fallan antes con `genui.forbidden_key`.

## 2.1.0

### Minor Changes

- 5f08fa1: Contrato `genui/v2` (ADR 0001 del SDK, §3 fila 4: primer PR de código del plan): JSON Schema versionado (`schema/genui-v2.schema.json`) como fuente única, tipos TS y tablas de bloques generados (`pnpm codegen`), vectores de conformidad compartidos con el kernel (`conformance/`) y validador ampliado. Nuevas exportaciones: `parseUISpecV2`, `parseGenUI` (acepta v1 y v2 y devuelve v2), `upgradeV1`, `downgrade`, `GENUI_V2_LIMITS` (profundidad 6, 200 bloques, 128 KB), `GENUI_ERROR_CODES` y `GenUIError`. Rechaza claves de prototipo, mide texto en puntos de código y bytes UTF-8, y aplica las reglas por posición en el esquema. Aditivo: sin renderizadores nuevos; `parseUISpec` y `GenerativeUI` (v1) no cambian.

## 2.0.0

### Patch Changes

- Updated dependencies [944dd83]
  - @asteby/metacore-ui@2.28.0

## 1.0.0

### Minor Changes

- 4039e53: Nuevos paquetes. `@asteby/metacore-genui`: UI generativa segura por metadatos — valida (`parseUISpec`) y dibuja especificaciones `genui/v1` del agente con una lista blanca de componentes (texto, KPI, tarjeta, tabla, enlaces, línea de tiempo, gráfica SVG con resumen accesible y formulario de confirmación), sin HTML ni scripts; `createGenerativeUIResult` la registra en el registro de resultados del agente. `@asteby/metacore-automations`: cliente REST, hooks y pantalla de automatizaciones dinámicas (lista con filtros, detalle con autoría «persona con asistente», confirmación de propuestas, pausa/reanudación, simulación, historial y editor generado del JSON Schema `automation/v1`), más `automationUIActionHandler` para las tarjetas del chat.

### Patch Changes

- Updated dependencies [019192d]
- Updated dependencies [bdc8a60]
  - @asteby/metacore-ui@2.27.0
