---
'@asteby/metacore-runtime-react': minor
---

DynamicKanban: tableros por referencia y tarjeta configurable desde el manifest.

- `group_by` sobre una columna referencia (técnico, rampa, responsable...) sin `stages` ni `options` ahora arma un carril por registro referenciado (mismo endpoint de opciones que los selects del formulario), sin transiciones: arrastrar una tarjeta a otro carril la reasigna. Antes el tablero salía sin carriles.
- Nueva prop `groupBy` (el `?group_by=` de la entrada de navegación): un modelo puede ofrecer varios tableros (por etapa, por técnico, por rampa) aunque el host proyecte un solo `group_by` por modelo. Agrupar por la columna de etapa (`stage_field`, nuevo campo opcional del metadata) conserva la máquina de etapas; por otra columna la descarta y deshabilita las personalizaciones por-org de etapa (carriles propios, overrides, orden, automatizaciones).
- La tarjeta se diseña con el `display_config` de las columnas: `card_title: true` elige el título y `card: true` cada campo, en orden de columna; con eso la tarjeta muestra todos los campos marcados (sin el tope de 3). Sin marcas, el comportamiento anterior no cambia.
- `display_config.overdue: true` (con `overdue_unless: { campo: [valores] }` opcional) pinta en rojo una fecha vencida en la tarjeta, p. ej. la hora prometida de una orden que aún no se entrega.
- Nuevos helpers puros exportados: `isCardOverdue`, `refLaneSource`, `withRefLanes`, `withGroupBy`; `selectCardColumns` devuelve además `explicit`.
