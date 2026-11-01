---
"@asteby/metacore-runtime-react": minor
---

Galería: la imagen original del padre como «Principal» cuando la galería está vacía. Si la columna de imagen declara `display_config.main_from_parent: "<campo>"` (p. ej. `image` en el producto) y la galería no tiene ninguna foto, el panel muestra esa imagen como tarjeta «Principal» de solo lectura, con la leyenda «Imagen original del producto»: es la que la tienda sirve cuando no hay galería. Con una o más fotos la tienda sirve primero la galería, así que no hay tarjeta extra y la primera foto es la principal (la imagen original entra a la galería cuando el addon la siembra al crear la primera foto). Sin el hint no cambia nada.
