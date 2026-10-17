---
"@asteby/storefront-react": minor
---

Primitivos headless de sucursales: `useGeolocation` (solo bajo acción del usuario, errores tipados), `useNearestLocations`, `useSelectedLocation` ("Mi sucursal" en `?sucursal=` y localStorage, nunca cookie), `LocationList`, `LocationPicker`, `OpenStatus`, `DirectionsLink`, `PickupOption` y `NearestLocationForm` (GET a `?cp=` sin JavaScript). Sin estilos, SSR-safe y sin dependencias nuevas; con cero sucursales renderizan `null`.
