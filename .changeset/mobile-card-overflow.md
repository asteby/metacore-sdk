---
'@asteby/metacore-runtime-react': patch
---

DynamicTable: las cards móviles ya no desbordan el viewport cuando una celda contiene badges largos — el valor de cada fila se contiene con `overflow-hidden` y los badges internos pueden envolver a multilínea (`max-w-full` + `whitespace-normal`) en vez de empujar el ancho de toda la página.
