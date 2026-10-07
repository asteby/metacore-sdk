---
"@asteby/metacore-runtime-react": minor
---

Selectores con presentación declarativa (`option_display` del kernel): el
`DynamicSelectField` pinta la fila que resolvió el servidor — avatar 32px,
título a 2 líneas, subtítulo atenuado, badges y métricas a la derecha con
`tabular-nums` (precio con la moneda de la org, existencia como chip con tono:
«Agotado» en danger atenuando la fila pero seleccionable, poco stock en
warning) — y el disparador muestra un resumen compacto; una opción `blocked`
no se puede elegir. Sin display, la fila de siempre. Nuevos
`OptionDisplayRow`, `OptionDisplayValue`, `getOptionDisplay`,
`formatTrailingValue`; `ResolvedOption.display`; contexto del selector
(`useOptionsResolver({ context })` / `DynamicSelectField optionsContext` →
`?ctx.<key>=`, también en el token del batch). El buscador de renglones del
`DocumentEditor` completa sus resultados con una sola consulta `?ids=` al
catálogo (`withOptionDisplays`, con el almacén del encabezado como contexto),
así la celda de producto muestra precio + existencia con su tono.
