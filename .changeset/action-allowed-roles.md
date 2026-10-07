---
'@asteby/metacore-runtime-react': minor
---

Filtro UX de acciones por rol: `allowedRoles` (también `allowed_roles`) en `ActionDefinition`, y `PermissionsProvider` acepta `roles`, `superRoles` y `rolesLoading`. `gateTableMetadata`/`resolveRowActions` (tabla y kanban) ocultan una acción con `allowedRoles` no vacío si el usuario no comparte ningún rol, salvo bypass por `superRoles` o `isAdmin`. Nuevos exports: `useRoleGate`, `isActionAllowedForRoles`, `RoleGate`.

Decisión de seguridad/compat: el filtro es opt-in. Sin provider, o con provider sin `roles` (`undefined`), o con `rolesLoading`, no se oculta nada (comportamiento actual, sin parpadeo durante la hidratación). Con `roles` resuelto (incluso `[]`) es fail-closed. `superRoles` por defecto es `[]` (sin bypass; el host pasa p. ej. `['admin','super_admin']`). Solo UX: el backend sigue siendo la autoridad.
