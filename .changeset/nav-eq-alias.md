---
'@asteby/metacore-ui': patch
---

fix(nav): el matcher activo del sidebar trata `f_col=eq:valor` y `f_col=valor` como el mismo filtro — las entradas por estado vuelven a pintarse activas después de que la tabla normaliza la URL.
