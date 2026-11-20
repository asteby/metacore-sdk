---
'@asteby/metacore-ui': minor
'@asteby/metacore-runtime-react': minor
---

ui: `ProductTile` acepta `imageAspect` (relacion del recuadro, default `4 / 3`), `code` (SKU en mono) y `footer`; `ProductTileSkeletonGrid` acepta `imageAspect` y `fill` (sobredibuja y recorta para llenar el area); nuevo `Pagination` independiente de TanStack (`page`, `pageCount`, `onPageChange`, tamano de pagina opcional) y `DataTablePagination` pasa a ser su adaptador. runtime-react: se exporta `useInfiniteScrollSentinel` (y `dedupeById`) con sus tipos. Sin cambios de comportamiento por defecto.
