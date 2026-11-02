---
"@asteby/storefront-react": patch
---

SEO: `productJsonLd`, `collectionJsonLd`, `organizationJsonLd`, `localBusinessJsonLd` y `og:image` de `seoMeta` resuelven las imágenes relativas de OPS (`/storage/…`, `/brand/…`) contra la URL de la página o el dominio de la tienda. Google y las redes piden URLs absolutas; antes salían relativas en el JSON-LD.
