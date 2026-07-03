---
'@asteby/metacore-runtime-react': minor
---

Pule el layout de los modales de create/acción: grid responsivo de dos columnas compartido (`FieldGrid`/`FieldCell`/`FieldLabel`) para el modal de `placement:create` (p. ej. "Crear Issue" del addon github) y el create/edit automático (CRUD). Los campos escalares fluyen en dos columnas (una sola en móvil), textareas/line-items ocupan el ancho completo, y cada celda lleva `min-w-0` para que un valor largo de select/input no reviente las columnas ni genere scroll horizontal. Ancho del dialog de acción a `sm:max-w-xl`, labels con estilo consistente y asterisco de requerido unificado.
