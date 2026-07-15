---
'@asteby/metacore-runtime-react': patch
---

DynamicTable: el sentinel de infinite scroll se detiene cuando el backend devuelve una página corta/vacía, aunque meta.total reporte más filas de las que la lista entrega (drift count vs list). Elimina el skeleton accent parpadeando bajo las filas.
