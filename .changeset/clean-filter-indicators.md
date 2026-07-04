---
'@asteby/metacore-ui': patch
'@asteby/metacore-runtime-react': patch
---

fix(data-table/kanban): indicadores de filtro sin duplicados y tarjetas kanban con relaciones resueltas

- El botón "Limpiar filtros" del toolbar ya no muestra badge de conteo y solo aparece para el estado propio de la tabla (column filters / búsqueda); los filtros dinámicos ya tienen su fila de chips con "Limpiar todo".
- El icono de filtro del header de columna ya no superpone un badge de conteo: el icono en color primary es el único indicador activo.
- `f_<col>=eq:<valor>` en la URL se desenvuelve al valor plano, por lo que el chip muestra la etiqueta de la opción ("Estado: Recepción") en vez de `eq:reception`.
- Las tarjetas del kanban resuelven columnas FK (`<rel>_id`) al objeto hermano resuelto por el backend (nombre/label) en vez del UUID crudo, y un FK UUID-cero se muestra como vacío (—).
