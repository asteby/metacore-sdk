---
'@asteby/metacore-runtime-react': minor
---

Permisos dinámicos rol × módulo × acción (Pieza C del contrato de permisos dinámicos).

**Primitivas de runtime (`permissions-context`)**

- `<PermissionsProvider permissions={string[]} isAdmin={boolean}>` — el host carga `/permissions/me` y monta el provider una vez en el root.
- `useCan(): (capability: string) => boolean` — `isAdmin` ⇒ todo permitido; la lista permite la capability exacta o el wildcard `*`. **Sin provider montado devuelve siempre `true`**, así que los hosts existentes no cambian de comportamiento hasta que opten por el gating.
- `usePermissionsActive()`, `makeCan()`, `modelCapability()`, `capabilityForActionKey()` (mapea `view→index`, `edit→update`) y `gateTableMetadata()` exportados para hosts con tablas propias.

**`<PermissionsManager>` — vista pro "Permisos y Roles"**

Transport-agnostic (loaders/mutators por props: `loadModules`, `loadRoles`, `loadRolePermissions`, `syncRolePermissions`, `createRole?/updateRole?/deleteRole?`). Panel de rol con selector buscable + chip removible y CRUD de rol (oculto si faltan los mutators), sección "Permisos Generales" (`general.*` del mismo rol), selector de módulo agrupado por addon y buscable, grid "Acciones permitidas" con ícono + label por acción, contador N/M, marcar-todo/limpiar, estado dirty visible y guardado que sincroniza el set completo del rol activo. Textos en español, estética shadcn del SDK.

**Gating en las superficies dinámicas (solo con provider activo)**

- `DynamicTable`: Exportar/Importar requieren `model.export|import`; las row actions (custom y el trío implícito Ver/Editar/Eliminar) se filtran por `can(lowercase(model).<action>)`.
- `DynamicCRUDPage`: botón Crear/Exportar/Importar gated por `model.create|export|import`.
- `ModelActionToolbar`: actions `table`/`create` filtradas por capability.

Sin `<PermissionsProvider>` todo queda visible exactamente como hoy.
