---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Títulos legibles y feeds de compras (Google Merchant Center y ChatGPT Merchants), para todas las tiendas. Solo cambian cómo se presenta el catálogo: nunca escriben en OPS ni agregan datos.

- `@asteby/storefront`: `productTitle`, `distinctProductTitles`, `normalizeTitleText`, `normalizeName`, `productPartNumber` y `PART_TITLE_KEYS`. Un nombre del ERP («ROTULA IZQ 4X2 TOYOTA TACOMA 2.4 L4 1995 2004») queda como «Rótula izquierda 4x2 para Toyota Tacoma 2.4 L4 1995–2004». Se arma con tipo, posición, marca y modelo, motor y rango de años, en tipo oración, con acentos y con los años repetidos colapsados. Con `identifiers: true` agrega la marca y el número de parte, así que es único por pieza. En un listado, `distinctProductTitles` solo diferencia los títulos que chocan. Se probó con 66 productos reales de ProtekAuto y con los 5,106 del catálogo: ningún código alfanumérico se pierde y hay 0 títulos repetidos con identificadores (antes, 1,246 productos compartían nombre).
- Nuevo subpaquete `@asteby/storefront/merchant`:
  - `collectFeed` / `productFeedItems` generan una fila por variante.
  - Toman de OPS precio, oferta y disponibilidad, `brand` del `vendor`, `mpn` del `part_number` y `gtin` solo si tiene un dígito verificador válido.
  - `identifier_exists=no` cuando no hay GTIN.
  - Excluyen los productos internos o de prueba, sin precio, sin imagen rasterizada, sin marca y, por omisión, los agotados.
  - Escritores: `googleFeedXml` (RSS 2.0 con `g:`), `googleFeedTsv` y `openAiFeedJsonl` (Product Feed Spec: `item_id`, `title`, `description`, `url`, `brand`, `seller_name`, `image_url`, `availability`, `price`).
  - `robotsTxt`: permite explícitamente Googlebot, Storebot-Google, OAI-SearchBot y ChatGPT-User, y bloquea GPTBot y los demás de entrenamiento.
  - `verificationTokens`: lee de la configuración el token de verificación del sitio.
- `@asteby/storefront-react`: `productJsonLd` acepta `{ name, mpn, priceValidUntil, returnPolicy, shipping }`. Con ellas emite `mpn`, `hasMerchantReturnPolicy` y `shippingDetails` coherentes con el feed, pero solo cuando la tienda pasa datos reales. Sin opciones, la salida es la misma de antes y nunca emite `aggregateRating`.
