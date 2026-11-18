---
"@asteby/metacore-maps": minor
---

Mapa: UX de ubicaciones aproximadas y coincidentes.

- Spiderfy: los miembros que comparten ubicacion (cluster atascado, burbuja o punto con vecinos) se despliegan en circulo/espiral con lineas guia; cada pin es un boton con popup, se cierra con Esc, clic fuera o al alejar el zoom (mas de 24 miembros: lista).
- Precision: `MapPointItem.precision?: 'exact' | 'city' | 'country'` y `area?` (texto de la burbuja, "CA · 8"). Los puntos aproximados se agregan en una burbuja por ubicacion (radio ~ raiz del conteo). Tope de zoom al seleccionar/ajustar: country 5, city 10 (prop `precisionZoom`, export `DEFAULT_PRECISION_ZOOM`); exact usa `selectZoom`.
- Popup/lista pulidos y con tema: titulo, estado como chip con el color del estado, filas clave:valor, ancho maximo, cierre visible; hover con "N instancias".
- Tema oscuro: halo bajo puntos y burbujas, controles y atribucion oscuros, fondo base menos negro.
- Limites de viewport configurables (props de `MapView` o `configureMaps`): `renderWorldCopies: false`, `minZoom: 'auto'` (el mundo llena el contenedor), `maxZoom: 18`, `maxBounds` [-180,-85]..[180,85] (`null` lo desactiva). Ya no se repite el mundo ni se triplican clusters.
- Titulo del punto en el renderer `view_type: map`: primera columna de `popup`, luego `name > title > label > host`, por ultimo el id. El renderer lee `precision`, `precision_field` y `area_field` de la vista; estos campos aun no estan en el esquema del kernel (`view.map`): cambio aditivo y opcional pendiente.
- Presupuesto de tamano del chunk inicial: 15 KB -> 17 KB gzip.
