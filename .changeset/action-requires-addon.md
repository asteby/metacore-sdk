---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-sdk": minor
---

Acciones que requieren un addon opcional (`requiresAddon`). Cuando el host marca una acción con `requires_addon` / `requiresAddon` (`{ key, name?, reason? }`), la acción sigue visible pero bloqueada en el menú de fila (tabla y kanban) y en `ModelActionToolbar`: candado + tooltip "Requiere «name»". Al hacer clic no abre el dispatcher, el modal federado ni llama al backend; abre un diálogo "Esta acción requiere «name»" con "Instalar" y "Cancelar". "Instalar" invoca el handler registrado con `setAddonInstallHandler(fn)` o, si no hay, navega con el router a `/marketplace/<key>`. Nuevas exportaciones: `resolveRequiresAddon`, `setAddonInstallHandler`, `getAddonInstallHandler`, `requiresAddonName`, `useRequiresAddonLabel`, `RequiresAddonLock`, `RequiresAddonDialog`, tipo `RequiresAddon`.
