---
"@asteby/metacore-runtime-react": minor
---

Nuevo primitivo reusable **BarcodeScanner** (+ `useScanBeep`, `isCameraScanSupported`, `RETAIL_BARCODE_FORMATS`) para escaneo por cámara en todo el ecosistema — API nativa `BarcodeDetector`, cero dependencias/assets, CSP-safe, con beep de confirmación y overlay `absolute`/`fixed`. Los campos `dynamic_select` aceptan un flag opt-in `scan` (alias `scannable`): cuando el navegador lo soporta, el picker muestra un botón de cámara que alimenta la búsqueda para "llenar rápido" una referencia (variante de producto, renglón de orden de compra) sin tipear el UUID/SKU. País/negocio-agnóstico.
