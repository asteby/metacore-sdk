---
"@asteby/metacore-runtime-react": minor
---

El modal de detalle de registro (`ViewRecordDialog` / `DynamicRecordDialog`) ahora renderiza los valores con los MISMOS display types "pro" que la tabla, en vez de texto plano genérico. Las primitivas de render de la tabla (`OptionBadge`, `RelationThumbnail`, `statusColorFor`, `useIsDarkTheme`) se extrajeron a un módulo compartido `display-value.tsx` que tabla y dialog consumen (cero copy-paste).

El dialog ahora resuelve cada valor por el display type declarado (`cellStyle ?? type`), igual que la tabla:

- opciones/select → Badge con color resuelto y label localizado
- `cellStyle:'status'`/`'badge'` (ej. stage de kanban) → pill con color semántico y label traducido vía i18n del manifest, en vez de "backlog" crudo
- `cellStyle:'url'`/`'link'` en columna de texto (ej. `github_url`) → enlace clickeable en pestaña nueva, truncado
- `cellStyle:'datetime'` en columna numérica/epoch (ej. `synced_at`) → fecha formateada con timezone de la org, no dígitos crudos
- arrays de labels/tags → fila de badges (con color cuando el label trae `color`)
- creator/avatar → nombre + avatar
