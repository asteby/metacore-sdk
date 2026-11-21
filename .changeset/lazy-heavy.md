---
"@asteby/metacore-runtime-react": minor
---

Peso del shell de hosts federados: `InspectionChecklist`, `ImportDialog` y `ExportDialog` del índice principal (y los que usan `DynamicTable` / `DynamicCRUDPage`) pasan a ser envoltorios perezosos con el mismo nombre y props: bajan al abrirse. Medido en OPS: 839.7 → 834.5 KB gzip. `DocumentEditor`/`DocumentLinesGrid` siguen estáticos (`DocumentFormDialog` pinta el editor en el primer frame).
