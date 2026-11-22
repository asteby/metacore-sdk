---
'@asteby/storefront-react': patch
---

fix(promos): los hitos de la barra de descuento que quedan a menos de 22 puntos porcentuales ya no se encimen. `PromoProgressBar` calcula (`crowdedAnchors`) y marca `data-crowded="end"` en el hito anterior (su etiqueta termina en su marcador) y `data-crowded="start"` en el siguiente (empieza en el suyo); el que ya está anclado al borde derecho conserva su ancla. Etiquetas sin salto de línea, a11y intacta y sin desbordar a 320–420 px. Exporta `crowdedAnchors` y `CROWDED_GAP`.
