---
'@asteby/storefront-react': minor
'@asteby/storefront': minor
---

Nuevo subpath `@asteby/storefront-react/product` (+ `product.css`): `ProductGallery`, la galería de ficha compartida por todas las tiendas. Detecta cuántas imágenes hay: 0 → `placeholder` (o una caja neutra con nombre accesible); 1 → la imagen sola, sin miniaturas ni controles; varias → carrusel con scroll-snap (se desliza con el dedo y funciona sin JavaScript), botones anterior/siguiente, contador «2 de 5» anunciado a lectores de pantalla, teclado (←/→, Inicio/Fin) y tira de miniaturas que se mantiene a la vista. La imagen de la variante elegida (`variant_id` o la URL de `variant.image`) pasa a ser la activa. Las fotos chicas (lado largo ≤ `lowResMax`, 300 px por omisión, o `low_res: true`) se muestran a tamaño real, centradas y sin estirar. Ancho y alto en todas las imágenes y caja con proporción fija (`--sf-gallery-ratio`): sin saltos de diseño. `loader` para el `srcset` y `sources` para `<picture>` (WebP/AVIF de la tienda). Helpers puros `galleryImages`, `variantImageIndex`, `isLowResImage`. Textos es/en, `classNames` y variables `--sf-gallery-*`.

`@asteby/storefront`: el mock trae un producto con galería de 5 imágenes (`set-sartenes`, la 4.ª de 100×100) para probar el caso «varias» y el de foto chica.
