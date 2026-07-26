---
"@asteby/metacore-runtime-react": minor
---

Los renderers de formulario (`DynamicForm` y `DynamicRecordDialog`) ahora consumen el primitivo `form_layout` del modelo (kernel PR #230): agrupan los campos por su `section` respetando el orden de `sections`. En `mode: "sections"` cada grupo se dibuja como una sección con `title`/`description` y soporte de `collapsed` (colapsable); en `mode: "steps"` se dibuja un wizard multi-paso con navegación Anterior/Siguiente y submit en el último paso. Los campos sin `section` (o con sección desconocida) caen en un grupo por defecto al inicio, y una sección sin campos visibles se oculta. Sin `form_layout` el comportamiento (lista plana) queda idéntico; `visible_when`, el gate de required y el strip de ocultos en el submit se respetan.
