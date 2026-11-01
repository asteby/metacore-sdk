---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

Rastreo público alineado con el contrato del servidor (`TrackingView` = `{ order_number, status, shipments[] }`).

Antes `sf.tracking.lookup` solo daba `found` si la respuesta traía `events` en la raíz; el servidor (storefront_customers 0.25) responde con `shipments[]`, así que todo pedido real, incluso con correo correcto, se mostraba como «No encontramos un envío con esos datos».

- `@asteby/storefront`: `TrackingView` cambia a `{ order_number?, status: ShipmentStatus | null, shipments: Shipment[] }`. La forma plana anterior queda como `LegacyTrackingView` (obsoleta). `tracking.lookup` da `found` cuando llega `shipments` como arreglo, aunque esté vacío (pedido confirmado sin guía); si un servidor responde con la forma plana, se pliega en un solo envío. Nuevos `normalizeTrackingView` y `visibleTrackingShipments` (nunca deja pasar un envío de prueba). El mock sirve `POST /storefront/customer/track` con la forma real (pendiente sin envíos, envío con escaneos, por guía, envío de prueba oculto, 404 uniforme).
- `@asteby/storefront-react/tracking`: nuevo `TrackingResult` (resultado por defecto de `TrackOrderLookup`): «Pedido SO-…», un `ShipmentTracker` por envío con su línea de tiempo y mapa, y el aviso «Tu pedido está confirmado; aún no tiene guía. Te avisaremos por correo cuando salga.» cuando no hay envíos. `ShipmentTracker` acepta también el `TrackingView` completo. `resultClassNames`, textos `result.*` y `headingLevel` hasta 6.

Migración: `TrackOrderLookup` + `resolveTrackingLookup` no requieren cambios. Si usas `renderTracker` o lees el resultado tú mismo, recorre `tracking.shipments` en vez de `tracking.events` / `tracking.carrier`. Los tipos que construían la forma plana a mano pasan a `LegacyTrackingView`.
