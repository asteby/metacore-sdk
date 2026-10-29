---
'@asteby/storefront': minor
---

Precios por mercado (contrato Storefront API 1.22.0), solo aditivo: `Shop.market?: ShopMarket | null` (`code`, `currency_code`, `locale`, `prices_include_tax`, `pricing` `legacy`|`same`|`strict`), `Cart.market?: string | null` y los códigos de error `not_available_in_market` (422), `cart_market_mismatch` (409: el carrito es de otro mercado, crea otro) y `address_outside_market` (422) en `StorefrontErrorCode`. El mock acepta `createMockStorefront({ market })` para simular un mercado en otra moneda (tienda, precios, carrito, cabeceras `X-Storefront-Market`/`Vary` y `409 cart_market_mismatch`); sin la opción responde igual que antes. `toMoney` y el formato no cambian.
