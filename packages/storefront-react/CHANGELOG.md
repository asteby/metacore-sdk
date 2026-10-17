# @asteby/storefront-react

## 0.2.0

### Minor Changes

- 21994a8: Primitivos headless de sucursales: `useGeolocation` (solo bajo acción del usuario, errores tipados), `useNearestLocations`, `useSelectedLocation` ("Mi sucursal" en `?sucursal=` y localStorage, nunca cookie), `LocationList`, `LocationPicker`, `OpenStatus`, `DirectionsLink`, `PickupOption` y `NearestLocationForm` (GET a `?cp=` sin JavaScript). Sin estilos, SSR-safe y sin dependencias nuevas; con cero sucursales renderizan `null`.

### Patch Changes

- 270b5d8: `localBusinessJsonLd` ya no emite `openingHours` inválido con horarios de texto libre: solo se emite si cada token es sintaxis schema.org estricta (o si hay `opening_hours` estructurado), y `geo` solo con coordenadas válidas. Nuevo helper `openingHoursJsonLd`.
- Updated dependencies [270b5d8]
- Updated dependencies [21994a8]
  - @asteby/storefront@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [0c43cc2]
  - @asteby/storefront@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [63e03d2]
  - @asteby/storefront@0.2.0

## 0.1.0

### Minor Changes

- b0a30c2: Nuevo paquete `@asteby/storefront-react` (React 19, apto para SSR): `StorefrontProvider`/`useStorefront`; `CartProvider`/`useCart` con altas, cambios y bajas optimistas con reversión, id del carrito en la cookie `sf_cart` (`getCartIdFromCookie` para los loaders) e `initialCart` para hidratar; componentes `Money`, `Image` (srcset responsivo, diferida salvo `priority`), `ProductPrice` con precio de comparación, `useProductOptions`/`VariantSelector` y `AddToCartButton`; SEO con meta y JSON-LD (Product, Organization, LocalBusiness por sucursal, BreadcrumbList, FAQPage, CollectionPage) y `<JsonLd>` escapado; registro de secciones con esquema (`defineSection`, `Sections`, exportación a JSON Schema) y tema en servidor (`themeToCss`, `<ThemeStyle>`).

### Patch Changes

- Updated dependencies [b0a30c2]
  - @asteby/storefront@0.1.0
