# @asteby/metacore-genui

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
