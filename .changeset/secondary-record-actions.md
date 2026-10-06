---
'@asteby/metacore-sdk': minor
'@asteby/metacore-runtime-react': minor
'@asteby/metacore-i18n': patch
'create-metacore-addon': patch
---

Un solo registro para modales, slots y acciones, y acciones secundarias fuera de la vista principal:

- `@asteby/metacore-sdk` es la única fuente de verdad: `registerModalComponent` (modales por slug, con addon dueño y `load` perezoso), `registerRecordAction` (acciones secundarias sobre registros con su proveedor `requires: { addon | capability }`) y `slotStore`. `Registry.scope(addon).registerModal/registerAction/registerSlot` escriben ahí (antes `registerModal` no tenía lector) y `unbind` lo retira todo. `adaptActionProps` entrega a un remote ambos contratos de props (ActionModalProps y recordId/payload/close).
- `registerFederatedModal` queda como alias deprecado y compatible de `registerModalComponent`; `slotRegistry` y `<Slot>` de runtime-react leen el `slotStore` del SDK y no pintan contribuciones de addons no instalados.
- Acciones primarias/secundarias: `priority` del manifest v3 (o convención por clave: print, share, email, mail, whatsapp, chat, download, pdf, xml, acuse). `RowActionsMenu` (menú «…» por defecto de DynamicTable) muestra una primaria destacada y agrupa las secundarias y las aportadas por addons en «Más…»; las acciones por capacidad sin proveedor activo no se ofrecen. `DocumentPage` manda las secundarias de su layout a `DocumentSecondaryBar` (pie) y `resolveActions` devuelve el nuevo grupo `footer`.
- i18n: `datatable.more_actions`, `datatable.open_menu`, `datatable.secondary_actions` (es/en).
