---
"@asteby/metacore-runtime-react": patch
---

feat(barcode-scanner): botón de linterna (torch) cuando el dispositivo lo soporta

En ambientes oscuros se puede encender/apagar el flash de la cámara trasera
desde la barra del overlay. Si el hardware no expone `torch`, el botón no
aparece. Aplica a POS y formularios (mismo primitivo).
