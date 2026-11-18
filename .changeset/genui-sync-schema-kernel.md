---
"@asteby/metacore-genui": minor
---

Sincroniza el esquema genui/v2, los vectores de conformidad y el validador TS con el kernel (metacore-kernel#631): `tabs` extendido (variant, default, keep_alive, chrome, label, mobile; opciones con icon, permission y component+props), bloque `section`, `grid.areas/rows/mobile` y `columns` como lista de pistas, `kpi_card`, `stats.items[].action`, `map.select`, `area` en todos los bloques y `component` con formato `<addon>.<nombre>@<n>`. `validate-v2.ts` aplica las mismas reglas que el kernel (opciones de tabs, section, plantilla rectangular y hijos colocados del grid) y pasa los 77 vectores nuevos. Los tipos de `PageGridDef`, `PageSectionDef`, `PageTabsDef`, `PageTabOption` y `PageKpiCardDef` reutilizan los tipos generados.
