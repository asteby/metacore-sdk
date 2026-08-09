---
"@asteby/metacore-runtime-react": patch
---

fix(barcode-scanner): cerrar al escanear en formularios (modal crear/editar)

`continuous={false}` en dynamic-form y dynamic-record: al llenar SKU/código el
overlay se cierra. El POS sigue con continuous (default) para varios productos.
