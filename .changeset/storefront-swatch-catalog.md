---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Muestras de sabores y colores como datos de OPS (contrato 1.36.0). `@asteby/storefront`: `Shop.swatches?: ShopSwatch[]` (`name`, `aliases`, `colors`, `emoji`); ausente en servidores anteriores. `@asteby/storefront-react/ui`: `swatchCatalogDictionaries(shop.swatches)` convierte el catálogo en los diccionarios de `createSwatchResolver` (una entrada por nombre y alias, normalizados), así una tienda ya no escribe su vocabulario de sabores en el código: `createSwatchResolver({ colors: [...defaultColors, ...colors], emojis, prefer: 'both' })`. El atributo `colores` del producto sigue mandando sobre el catálogo. Las frases del motor ahora se escapan antes de armar la expresión regular (llegan de datos de la organización; un nombre con `(`, `[` o `.*` ya no rompe ni se interpreta).
