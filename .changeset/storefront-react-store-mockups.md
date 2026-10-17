---
"@asteby/storefront-react": minor
---

`defineMockup({ kind, match?, data?, describe?, render })` y `createStoreMockups(definiciones, { base?, labels? })`: el contrato de un mockup de tienda en un archivo y el registro + `resolveKind` listos para `<MockupProvider {...storeMockups}>`. Las piezas base (`TireMockup`, `PartMockup`, `SupplementMockup`, `GenericMockup`) se reutilizan tal cual o se reemplazan; la API publicada no cambia. El suplemento ya no corta palabras largas (CREATINA MONOHIDRATADA → "MONOHIDRATA…"): ajusta la letra a la palabra más larga (`wrapMockupText(..., wordMax)` y `mockupWordMax`).
