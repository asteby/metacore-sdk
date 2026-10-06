---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-i18n": patch
---

DocumentEditor a pantalla completa para documentos con renglones (factura, cotización, pedido, OC).

- **Pantalla completa:** DocumentFormDialog abre el editor de un tipo `layout: "editor"` con renglones de venta o compra en un diálogo que ocupa la pantalla (máx. 1440 px). En pantallas anchas va a dos columnas: captura a la izquierda; totales, revisión y vista previa a la derecha. NC y cobro/REP siguen en el diálogo de 960 px.
- **Divulgación progresiva:** lo obligatorio que el tipo declara queda a la vista aunque sea de extensión (`fiscal_data.metodo_pago`, `fiscal_data.forma_pago` de la factura); las extensiones que llegan del metadata siguen plegadas en «Opciones fiscales».
- **Tarjeta de la contraparte:** sus filas usan las etiquetas del formulario del modelo de la contraparte (`/metadata/modal/<party.model>`): «RFC», «Régimen fiscal», «Uso CFDI» en vez de `tax_id` o `regimen_receptor`.
- **«Cargar desde…»:** con varias fuentes, botones por tipo de origen (venta, OT, cotización) en lugar de un `<select>`. Un origen sin dato de impuesto (p. ej. una OT de taller) toma la tasa de la org, como un renglón nuevo.
- **Vista previa local:** un tipo con renglones y sin acción `preview` del servidor ofrece una vista previa plegada del documento (encabezado, renglones y totales) sin crear borrador.
- i18n es/en: `documentEditor.source_kind`, `documentEditor.preview`, `documentEditor.advanced`.
