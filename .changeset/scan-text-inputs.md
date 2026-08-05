---
"@asteby/metacore-runtime-react": minor
---

Los inputs de texto/número de formularios declarativos aceptan el opt-in `scan`: cuando el campo lo declara y el navegador soporta cámara, aparece un botón que escanea un código de barras y **llena el input** (ej. el SKU al crear producto). El escáner queda abierto (continuo) para corregir/reintentar; se cierra con la X. Complementa el `scan` ya soportado en `dynamic_select`.
