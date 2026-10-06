---
"@asteby/metacore-runtime-react": patch
---

Kanban: los carriles de etapas ya no se pintan sobre otra columna. El host sirve un solo `group_by` por modelo, el del ÚLTIMO tablero de la navegación (en Taller, `service_bay_id`). Un tablero abierto sin `?group_by=` (por ejemplo, con el cambio de vista desde la lista) agrupaba las etapas por la bahía: todas las OT caían en «Sin etapa», los conteos de cada carril pedían `f_service_bay_id=diagnosis` (422) y al soltar una tarjeta se enviaba `service_bay_id = 'diagnosis'` (422 «no es un UUID válido»). `withGroupBy` ahora agrupa por el `stage_field` cuando no hay `?group_by=`. El tablero de la columna servida conserva la máquina de etapas solo si esa columna es la de etapas.
