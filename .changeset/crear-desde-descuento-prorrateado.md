---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-i18n": patch
---

DocumentEditor «Cargar desde…»: al precargar solo lo pendiente de un renglón, el descuento en importe (`discount_mode: amount`) se prorratea a esa cantidad (cotización de 6 piezas con $1,200 de descuento y 4 pendientes → $800), en vez de arrastrar el importe completo y chocar con «El descuento no puede superar el importe». Un descuento en porcentaje no cambia. Avisos de carga en español más claro («con lo que falta · ya completos (omitidos)», «Documento de origen»).
