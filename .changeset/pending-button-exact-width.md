---
"@asteby/storefront-react": patch
---

fix(ui): `PendingButton` conserva el ancho EXACTO mientras trabaja (antes solo un mínimo: «Descargando…» + spinner lo ensanchaba 149 -> 173 px y movía el diseño); el texto se recorta con puntos suspensivos si no cabe.
