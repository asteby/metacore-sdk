---
'@asteby/storefront-react': patch
---

fix(fiscal): `request-invoice` (factura de un pedido ya hecho) ya no manda `requested` ni `document` y nombra el uso `invoice_use`, así que funciona también contra un OPS que aún no acepta esos campos (400 `requested: unknown field`). Un error de validación del servidor solo marca un control del formulario si el campo corresponde a uno (`fiscal.invoice_use` marca `invoice.use`; alias como `razon_social`, `regimen`, `cp` también); un campo sin control ya no produce `fieldErrors` ni `error.field`, para que la página no diga «revisa los datos marcados» sin nada marcado.
