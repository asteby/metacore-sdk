---
'@asteby/storefront-react': minor
---

Nueva subruta `@asteby/storefront-react/tracking` (+ `tracking.css`): `TrackingTimeline`, `ShipmentTracker` (loading/empty/error/ready, guía copiable, enlace `https`, llegada estimada, incidencias como aviso), `TrackOrderLookup` (formulario público que funciona sin JavaScript, errores uniformes, foco al resultado), `resolveTrackingLookup` / `parseTrackingForm` para la acción de la ruta y mapa opcional (`loadMaps={() => import('@asteby/metacore-maps')}`, `geocode`) que no se importa estáticamente. `ShipmentCard` y `ShipmentDetail` comparten `TrackingEventList` sin cambiar su DOM ni sus props.
