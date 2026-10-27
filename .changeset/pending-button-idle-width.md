---
"@asteby/storefront-react": patch
---

fix(ui): `PendingButton` fija el ancho que tenía en reposo ANTES de pintar el spinner y el texto de estado (se medía después: «Descargando…» lo ensanchaba 149 -> 173 px en la prueba en vivo). El texto se recorta con puntos suspensivos si no cabe.
