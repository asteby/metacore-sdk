---
"@asteby/metacore-runtime-react": minor
---

Las listas se refrescan tras crear, editar o borrar (#1020). `DynamicRecordDialog` y `ActionModalDispatcher` (componente federado, wizard, formulario genérico y confirmación) emiten el evento `metacore:record-mutated` con el modelo; `DynamicTable` y `DynamicKanban` vuelven a pedir los datos cuando el modelo coincide (sin distinguir mayúsculas). Nuevos exports: `emitRecordMutation`, `subscribeRecordMutations`, `useRecordMutationTick`.
