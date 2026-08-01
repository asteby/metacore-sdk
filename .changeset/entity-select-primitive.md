---
"@asteby/metacore-runtime-react": minor
---

Nuevo primitivo `EntitySelect`: combobox async de un modelo relacionado con las dos affordances del modal dinámico — "+" para CREAR (sin selección) que auto-selecciona el creado, y lápiz para EDITAR el seleccionado. Ambas gateadas por permisos del kernel (useCan: `<model>.create`/`.update`) y 100% dinámicas (el form sale de `/metadata/modal/:model` vía CreateRecordDialog). Reemplaza los pickers bespoke duplicados en POS/purchases por una sola implementación reusable.
