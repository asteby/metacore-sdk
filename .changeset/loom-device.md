---
"@asteby/metacore-runtime-react": minor
---

Loom: `needs.device` (RFC 0005). `PartDef.device` / `GraftDef.device` (`camera`, `microphone`, `geolocation`; servido desde `ui.exposes[].needs.device`) se publican en `GraftDeviceContext`; `useDeviceAllowed(device)` responde dentro de un injerto (fuera de Loom, todo permitido). `BarcodeScanner` no abre la cámara en un injerto que no declaró `camera` y muestra un aviso. Es una barrera de los primitivos del SDK; la garantía fuerte para terceros sigue siendo el iframe sandbox del nivel marketplace.
