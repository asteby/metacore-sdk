---
"@asteby/metacore-runtime-react": minor
---

Galería: la imagen original del padre como «Principal». Si la columna de imagen declara `display_config.main_from_parent: "<campo>"` (p. ej. `image` en el producto) y la galería aún no contiene esa imagen, el panel la muestra como primera tarjeta «Principal», de solo lectura, con la leyenda «Imagen original del producto». Mientras esa tarjeta exista, las fotos de la galería son adicionales: ninguna se marca como principal ni ofrece «Hacer principal». Cuando la galería ya la contiene (p. ej. sembrada por el addon al crear la primera foto), no se muestra la tarjeta extra y la primera de la galería es la principal. Sin el hint no cambia nada.
