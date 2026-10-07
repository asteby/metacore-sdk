---
"@asteby/metacore-runtime-react": minor
---

DocumentEditor con selects «pro»: el buscador de producto vive en la celda «Descripción» de cada renglón (con un renglón vacío siempre al final, Enter elige y pasa a «Cant.»), los resultados salen en un portal collision-aware que nunca recorta la tabla ni el modal, y los dynamic_select con `ref` traen crear/editar unidos al trigger (`RecordPickerAction`, compartido con `EntitySelect`; el lápiz despacha `metacore:edit-record`). Pulido visual del editor: cabecera agrupada en tres columnas, etiquetas en sentence case, «Cargar desde» segmentado con estado vacío, tabla densa con totales alineados a «Importe», panel de totales con estado vacío y atajo ⌘/Ctrl+Enter para guardar.
