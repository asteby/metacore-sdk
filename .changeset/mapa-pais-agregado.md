---
"@asteby/metacore-maps": minor
"@asteby/metacore-genui": patch
---

maps: con `precision: "country" | "city"` las instancias que comparten centroide ya NO se abren en abanico (spiderfy): cada area es UNA burbuja con el recuento, teñida por el estado dominante (o el color de los miembros) y, con logos, hasta 3 avatares apilados + «+N». Al hacer clic:

- bloque genui `map` con `detail_panel: true`: el panel lateral lista los miembros del area (scroll interno, avatar/logo, titulo, `subtitle_field`, insignia de estado traducida con su tono; flechas/Home/End/Esc; al elegir uno se abre su ficha con «Volver a la lista»).
- sin panel (o `MapView` suelto): un popup con la lista de miembros (con scroll). Nuevo `onArea(area)` en `MapView` / `ClusterLayer` para que el host pinte su propio panel.
- el spiderfy queda solo para puntos `exact` realmente coincidentes.

Popup y panel dejan de duplicarse: con `detail_panel` el popup es un resumen (titulo + subtitulo + estado, `popupDetails={false}`) y las propiedades viven en el panel; ademas no se repiten como fila el titulo, el subtitulo ni el estado.

Etiquetas e i18n (sin propiedades nuevas en el esquema): las columnas se rotulan con el `t` del host bajo `map.field.<columna>` y los estados bajo `map.status.<valor>`; sin traduccion se humaniza (`ops_version` -> «Ops version», `live_24h` -> «Live 24h»), nunca la clave cruda. El codigo de pais del area se muestra con `Intl.DisplayNames` en el idioma del host (`GT` -> «Guatemala»). Los textos nuevos (`backToList`, `closeDetail`, `legendByStatus`, `legendByGroup`) van por `metacore.maps.*` con valores por defecto en español; se elimina el truco `hideList.replace(/lista/, 'detalle')`.

El bloque tambien LEE `field_labels` y `status_labels` (mapas columna/estado -> texto o `{ $t }`), que ganan sobre la convencion, pero el esquema genui/v2 actual no los admite todavia.

SIGUIENTE PASO, REQUIERE RELEASE DEL KERNEL (esquema JSON + validadores Go/TS de genui/v2; este repo no los toca): propiedades nuevas del bloque `map`:

1. `field_labels`: objeto `{ <columna>: label }` (label = string o `{ "$t": clave, "args"? }`), claves con el patron de `status_tones`, maximo 16 (o 32) propiedades.
2. `status_labels`: objeto `{ <valor de estado>: label }`, mismo patron y limite que `status_tones`.

genui: `normalizeMapPoints` anade `field` (columna de origen) a cada fila de detalle construida desde `source`, para que el host la rotule; `label` sigue siendo la clave cruda (compatible).
