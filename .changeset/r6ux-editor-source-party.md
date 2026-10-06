---
"@asteby/metacore-runtime-react": patch
---

DocumentEditor: «Cargar desde» venta, OT o cotización deja el cliente elegido y los selectores muestran nombre o folio, no el UUID.

- La cabecera del origen (`sources[].header`, p. ej. `customer_id`, y `link_field`) se carga antes que los renglones, así que el cliente y su tarjeta llegan aunque los renglones del origen fallen.
- Los selectores que el editor llena por código (cliente, documento origen, «Factura a abonar» de la NC) se siembran con la etiqueta que ya conoce: el objeto hermano `{value,label}` que sirve el host, el nombre de la contraparte cargada o el folio del origen. El selector «Cargar desde…» también muestra el folio.
- La vista previa local muestra esas etiquetas, y un campo con `options` en objeto ya no rompe el resumen.
