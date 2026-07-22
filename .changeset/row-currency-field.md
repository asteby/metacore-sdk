---
'@asteby/metacore-runtime-react': patch
---

DynamicTable: columnas currency con moneda POR FILA — `display_config.currency_field`
nombra la columna hermana que trae el código ISO del monto de esa fila (tablas
multi-moneda: un pago en Bs ya no se renderiza como USD de la org). Código no-ISO
se prefija verbatim en vez de reventar el Intl.NumberFormat.
