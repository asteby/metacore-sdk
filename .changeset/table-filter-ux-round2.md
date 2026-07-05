---
'@asteby/metacore-runtime-react': patch
---

fix(data-table/kanban): filtros con un solo indicador y scroll infinito sin atascos

- La tabla ya no renderiza la fila de chips de filtros activos: el indicador del header de columna es la única señal (los chips seguían duplicando la info).
- La tabla re-sincroniza sus filtros cuando el router del host reescribe la query string sin remontar (p. ej. entradas hermanas del sidebar que deep-linkean distintos `f_` sobre la misma ruta); antes quedaba mostrando el filtro anterior.
- El sentinel de scroll infinito encadena la siguiente página cuando una carga termina y el sentinel sigue visible (pantallas pequeñas / páginas cortas); antes se atascaba hasta que el usuario movía el scroll.
