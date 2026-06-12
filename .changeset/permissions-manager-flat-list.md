---
'@asteby/metacore-runtime-react': minor
---

PermissionsManager: la elección de módulo pasa de un **árbol con acordeones/folders** a una **lista plana idéntica al sidebar**.

- Cada grupo se dibuja como un **header gris no colapsable** (uppercase tracking, estilo "Módulos"/"Sistema" del sidebar) seguido de sus módulos como **filas clickeables** (ícono + label + badge contador N/M). El click directo en una fila selecciona el módulo y muestra su grid de acciones a la derecha. CERO Collapsible/acordeón/folder. La búsqueda filtra las filas (accent/case-insensitive por label de módulo o título de grupo) y oculta los grupos sin coincidencias.
- **Nuevo shape de entrada (desacoplado)**: `loadModules()` ahora puede devolver `{ groups: ModuleGroup[]; general: GeneralPermissionDef[] }` donde `ModuleGroup = { title: string; modules: ModuleDef[] }` (`title: ''` → sin header) y cada módulo es `{ key, label, icon?, kind: 'model' | 'screen', actions: ActionDef[] }`. La capability final es `${module.key}.${action.key}`; para pantallas no-modelo el host manda `key: 'screen.<navKey>'` + una acción `{ key: 'access', label: 'Acceder', icon: 'Eye', kind: 'screen' }` → capability `screen.<navKey>.access`.
- **Retrocompat**: si `loadModules` devuelve el shape viejo `{ modules, general }` (flat, sin `kind`), se envuelve en grupos (agrupados por `addon_label`/`addon_key`, fallback "Sistema") y cada módulo se trata como `kind: 'model'`. Los hosts que aún mandan el shape viejo siguen funcionando.
- Tipos exportados nuevos: `ModuleGroup`, `GroupedPermissionsCatalog`, `FlatPermissionsCatalog` y `kind` en `PermissionModuleDef`/`PermissionActionDef`. Helpers exportados: `normalizeCatalogGroups`, `flattenGroups`, `filterModuleGroups` (firma actualizada a `ModuleGroup`). Se eliminó `groupModules` (reemplazado por `normalizeCatalogGroups`).
- Intacto: selector de rol limpio (edit/delete inline), permisos generales, dirty tracking + guardar (sync = set completo), guard de cambios sin guardar, i18n español, `createRole`/`updateRole`/`deleteRole` opcionales.
