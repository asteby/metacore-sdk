---
"@asteby/metacore-runtime-react": minor
---

Relaciones 1:N (filas anidadas):

- La columna de imagen o archivo de una fila hija usa el mismo widget de subida que el formulario del padre, con vista previa. Antes salía como texto con la ruta.
- Las columnas de auditoría ya no aparecen como campos editables, incluidas las proyecciones como `created_by.avatar` («Creado por»).
- Si el modelo hijo tiene `position`, la lista se ordena por esa columna.
- Hints opt-in en el `display_config` de la columna (llegan como `styleConfig`, sin cambios en el kernel):
  - `form: "hidden"`: la columna no aparece en el formulario.
  - `derive: "image_width" | "image_height" | "next_position"`: la columna sale del formulario y la rellena el SDK (tamaño medido en el navegador al subir, siguiente posición al crear).
  - `default_from_parent: "<campo>"`: valor inicial editable tomado del registro padre.
  - `empty_label`: placeholder del selector opcional.
- Con `gallery: true` en la columna de imagen, la relación se muestra como galería:
  - cuadrícula de miniaturas con la foto principal marcada;
  - subida múltiple por arrastre o selector, con progreso, error y reintento por foto;
  - reordenar arrastrando, con teclado o con botones, y «Hacer principal»;
  - eliminar con confirmación y «Deshacer».
- `DynamicForm` acepta `onFieldMeta` y `UploadField` acepta `onFileMeta`, para recibir el tamaño de la imagen subida.
- Los modelos sin estos hints se comportan como antes.
