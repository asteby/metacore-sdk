---
"@asteby/storefront-react": minor
---

Nuevo paquete `@asteby/storefront-react` (React 19, apto para SSR): `StorefrontProvider`/`useStorefront`; `CartProvider`/`useCart` con altas, cambios y bajas optimistas con reversión, id del carrito en la cookie `sf_cart` (`getCartIdFromCookie` para los loaders) e `initialCart` para hidratar; componentes `Money`, `Image` (srcset responsivo, diferida salvo `priority`), `ProductPrice` con precio de comparación, `useProductOptions`/`VariantSelector` y `AddToCartButton`; SEO con meta y JSON-LD (Product, Organization, LocalBusiness por sucursal, BreadcrumbList, FAQPage, CollectionPage) y `<JsonLd>` escapado; registro de secciones con esquema (`defineSection`, `Sections`, exportación a JSON Schema) y tema en servidor (`themeToCss`, `<ThemeStyle>`).
