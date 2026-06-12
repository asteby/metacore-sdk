---
'@asteby/metacore-runtime-react': minor
---

PermissionsManager: rediseño de UX para que la elección de módulo refleje el sidebar.

- El selector de módulo plano se reemplaza por un **árbol jerárquico** agrupado por `addon_label` (acordeón colapsable, ícono por módulo, badge de acciones otorgadas N/M, búsqueda que filtra el árbol). Los módulos sin addon caen en el grupo "Sistema".
- El selector de **rol** queda limpio: combobox con acciones de **editar** y **eliminar** inline (íconos lápiz/basurero a la derecha), sin el chip removible separado.
- Estados claros del panel de acciones: "elige un rol" / "elige un módulo" / skeleton de carga; el grid se habilita en cuanto hay rol + módulo. El panel titula con el módulo activo y su addon.
- Nuevo campo opcional `icon` en `PermissionModuleDef` (lucide) para mostrar el ícono del módulo en el árbol y el panel.
- Helpers exportados nuevos: `groupModules`, `filterModuleGroups` (+ tipo `ModuleGroup`).

Sin cambios en la firma de props de `PermissionsManager` (solo render interno; `PermissionModuleDef.icon` es aditivo/opcional).
