---
"@asteby/metacore-runtime-react": patch
---

fix(hotswap): al recibir `ADDON_MANIFEST_CHANGED`, si la invalidación scopeada
no elimina ninguna entrada (el caso real: la metadata se cachea por nombre de
TABLA — `purchase_order_items`, `suppliers` — que no lleva el prefijo del
addon), se limpia TODO el cache de metadata como fallback. Antes, actualizar un
addon dejaba el label/ref viejo en el store persistido y el usuario tenía que
borrar datos del sitio a mano para ver la metadata fresca. Un cambio de manifest
es infrecuente (install/upgrade), así que el refetch perezoso en el próximo
montaje es barato y correcto.
