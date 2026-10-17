---
"@asteby/storefront": minor
---

`client.locations.list({ postal_code })`, `.get(id)` y `.nearest({ lat, lng })` (Storefront API `locations.v1`), tipos `Location`, `NearestLocation`, `LocationKind`, `LocationContacts` y `LocationPickup` (y campos opcionales equivalentes en `ShopBranch`), y las tres rutas en `createMockStorefront` con tres sucursales de ejemplo ordenadas por haversine. En el mock, la recolección solo se ofrece donde `pickup.enabled` y se cobra `pickup.fee`.
