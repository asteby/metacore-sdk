---
'@asteby/storefront-react': patch
---

`loadAuthCapabilities` conserva `customer_types` (limpia: códigos válidos, textos, sin repetidos y con el `default` que existe), que antes descartaba por copiar solo los campos que conocía; sin él el registro nunca pintaba el selector de tipo de cliente de la organización. Sin lista, el campo no aparece.
