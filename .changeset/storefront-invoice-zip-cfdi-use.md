---
"@asteby/storefront": patch
---

mock: `validateInvoiceRequest` (CSF/CFDI) acepta `zip` y `cfdi_use`, ya en uso por
storefronts en producción, como alias de `postal_code` y `use`. Antes el mock los
rechazaba con "Not a valid postal code" aunque el dato fuera válido, porque solo
reconocía `postal_code`/`cp` y `use`/`uso_cfdi`/`invoice_use`.
