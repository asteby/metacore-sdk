---
'@asteby/metacore-auth': minor
'@asteby/metacore-websocket': minor
---

Upstream de la migración doctores.lat:

- auth: `BaseAuthUser` + `getTypedAuthStore` — el host tipa su propio user
  sobre el store compartido sin castear en cada consumo.
- websocket: `createChannelClient` — cliente multi-canal imperativo (suscribir/
  desuscribir canales con reconexión), reemplaza los clientes WS ad-hoc de las
  apps.
