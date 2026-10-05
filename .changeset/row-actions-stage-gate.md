---
"@asteby/metacore-runtime-react": patch
---

Las acciones por fila con `requiresState` se filtran contra el `stage_field` del modelo cuando hay máquina de etapas, igual que el kernel. Antes se comparaban con `status`, y por eso la OT de taller no mostraba «Procesar», «Esperar refacciones» ni «Cancelar» en la tabla ni en el kanban. Nuevo export `lifecycleStageField(metadata)`.
