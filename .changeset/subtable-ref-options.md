---
"@asteby/metacore-runtime-react": patch
---

fix(runtime-react): las sub-tablas de relación resuelven las columnas `ref` al
nombre del registro en vez del uuid crudo.

`OneToManyRelation` construía sus columnas sin precargar las opciones de las
columnas `ref` (a diferencia de `<DynamicTable>`, que las mete en `OptionsContext`),
así que una celda `ref` (p.ej. el Producto de un renglón de orden de compra)
mostraba el uuid. Ahora la sub-tabla precarga `/api/options/<Model>` de sus
columnas `useOptions && searchEndpoint` y las provee vía `OptionsContext.Provider`,
igual que la tabla principal — el chip muestra "Nombre / SKU".
