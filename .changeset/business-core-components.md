---
"@asteby/metacore-runtime-react": minor
---

Componentes de negocio compartidos con contrato estable (benchmark Pitsline §7, §6.4-6.7) en `@asteby/metacore-runtime-react`.

- Componentes: `CustomerPicker`, `ProductPicker` (medida de llanta, código de barras, SKU/clave de proveedor, variantes, existencia por almacén), `LineItemsEditor` (secciones/notas, política de sobreventa, `serializeLineItems` como única salida hacia el backend — corrige el guardado de renglones PIT-018), `PaymentCapture` (cobro mixto, cambio solo en efectivo, referencia y cuenta) y `RefundDestination` (efectivo, tarjeta, monedero, saldo a favor, NC CFDI).
- Utilidades: formateador único `formatMoney` / `formatDate` / `formatDateTime` / `createFormatter` / `useFormatter` (es-MX, moneda y zona de la org, sin mezclar locale — PIT-023/025); `mapApiError` (409/422 → mensaje por campo + banner, PIT-002/003/013/021/029); `notify`, `SystemNoticeBanner`, `FormErrorBanner`, `ACTION_SAFE_TOASTER_PROPS` (avisos que no tapan acciones, PIT-005) y `EmptyState` accionable.
- `BUSINESS_COMPONENTS`: catálogo legible por máquina (props, eventos, permisos, dónde se usa). Guía en `docs/business-components.md`.
