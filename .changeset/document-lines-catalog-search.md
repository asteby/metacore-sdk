---
'@asteby/metacore-runtime-react': minor
---

Crear factura (DocumentFormDialog): el paso de renglones busca en el catálogo de productos aunque el host no pase `searchProducts`. Antes solo ofrecía «Renglón libre» y la factura se guardaba en $0. Al elegir un producto, el renglón entra con precio de venta, unidad, SKU, claves de extensión (`fiscal_data`), cantidad 1 y la tasa de impuesto del producto o, si no trae, la de la organización (`OrgRuntimeProvider taxRate`, nuevo). Nuevos: `createCatalogProductSearch`, props `productModel`/`defaultTaxRate` y `lines.discount_mode` en `document_forms`. Una cantidad vacía al leer renglones ya no queda en 0.
