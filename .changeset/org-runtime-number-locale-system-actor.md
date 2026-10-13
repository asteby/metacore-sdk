---
'@asteby/metacore-runtime-react': minor
---

OrgRuntimeProvider: nuevas props opcionales `numberLocales` (p. ej. `{ es: 'es-MX' }`, formatea números y dinero de celdas, totales del pie, kanban y diálogo de registro con el locale de la org) y `systemActor` (`{ name, avatarUrl }` para el actor de sistema en celdas `creator`/`created_by.*`, AuditInfo, ActivityTimeline, RecordHistory y el diálogo). Nuevos `useNumberLocale`, `resolveNumberLocale`, `useSystemActor` e `isSystemActorColumn`. Sin las props no cambia nada. Corrige que un idioma `en-US` fechara en español en las columnas dinámicas.
