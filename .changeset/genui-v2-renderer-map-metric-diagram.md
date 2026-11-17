---
"@asteby/metacore-genui": minor
"@asteby/metacore-maps": minor
---

genui/v2 fase 1: bloques `map`, `metric` y `diagram` en el contrato (esquema, reglas por posición y vectores de conformidad compartidos con el kernel), `GenUIProvider` + `registerGenUIBlockRenderer`, renderer `GenUI` (acepta v1 y v2) con bloques stack, grid, tabs, section, text, markdown seguro (sin HTML), alert, empty, card, list, metric y diagram (SVG con layout automático). `@asteby/metacore-maps/genui` registra el bloque `map` como fachada sobre MapView (tono por estado, leyenda por agrupación, tooltip al hover, panel de detalle). `GenerativeUI` (v1) no cambia.
