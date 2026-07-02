---
'@asteby/metacore-runtime-react': minor
---

DynamicKanban: los contadores de cada columna muestran el total real de la etapa desde el primer render, sin necesidad de scrollear. Tras la carga inicial del tablero se dispara en paralelo una consulta liviana (`per_page=1`) por etapa, respetando la búsqueda y los filtros activos, para leer su total. El header ahora se lee `N` cuando ya están cargadas todas las tarjetas (antes `N/N`) y `N/M` cuando la etapa está parcialmente cargada. Los totales se refrescan al cambiar filtros/búsqueda y mantienen el ajuste optimista tras arrastrar una tarjeta.
