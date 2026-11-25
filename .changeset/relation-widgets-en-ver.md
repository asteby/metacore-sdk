---
"@asteby/metacore-runtime-react": minor
---

Los widgets de relación pueden pintarse en «Ver» (solo lectura). El modal de detalle usaba siempre el panel genérico de relaciones, que solo lista renglones explícitos del modelo hijo (por eso «Precios por mercado» decía «No hay registros relacionados» para un producto cuyo precio sale del precio base). Ahora un widget que declare `supportsView = true` recibe `mode: 'view'`, `readOnly` y `recordId` (sin filas: lee lo suyo) y reemplaza al panel de esa relación; solo para relaciones de composición (`embed`). Es opt-in: un widget sin la marca sigue en el panel genérico. Nuevos: `relationWidgetSupportsView()`, `RelationWidgetProps.mode: 'view'` y `recordId`, y `DynamicRelations.renderRelation` (vista propia por relación). El mercado de la sucursal activa también llega al widget en «Ver».
