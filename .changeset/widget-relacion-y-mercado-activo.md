---
"@asteby/metacore-runtime-react": minor
---

Widgets de relación y mercado de la sucursal activa.

- `registerRelationWidget(name, Component)`: una relación `create_inline` con `widget: "<name>"` (y `addon`) en la metadata se pinta con el componente del host en lugar de la tabla inline. Recibe `relation`, `fields`, `rows`, `onChange`, `values` (valores VIVOS del formulario del padre), `readOnly`, `errors`/`formError` (422 por fila ya localizados), `onCellEdited`/`onRowRemoved` y `context: { branchId, market }`. Sus filas viajan en `_children[relation.name]` igual que las de la tabla. Sin registro cae a la tabla: compatibilidad total.
- `useActiveMarket()`: `branches.market_code` de la sucursal activa (`BranchProvider`), con caché por sucursal y sin petición si no hay sucursal o no hay widget que lo use.
- `createWidgetRegistry()`: el patrón de registro observable, ahora una sola fábrica; `registerFieldWidget` y los widgets de relación la comparten (misma API pública).
- `RelationMeta` suma `widget` y `addon`.
