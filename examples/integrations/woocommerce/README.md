# WooCommerce

Consulta pedidos y gestiona tu tienda WooCommerce. Los productos se sincronizan automáticamente con búsqueda semántica. Addon **tool-only** — los tools golpean `{{wc_store_url}}` con las credenciales REST de la tienda.

## Tools

| id | descripción | params required |
|---|---|---|
| `search_orders` | Busca pedidos por número de orden, nombre o email | `query` |
| `get_order` | Obtiene los detalles completos de un pedido | `order_id` |
| `list_products` | Lista productos con búsqueda por texto | `search` |

## Settings

| key | label | type | required |
|---|---|---|---|
| `wc_store_url` | URL de la tienda (ej: https://tienda.com) | string | sí |
| `wc_consumer_key` | Consumer Key | password (secret) | sí |
| `wc_consumer_secret` | Consumer Secret | password (secret) | sí |

## Capabilities

Ninguna estática — el host del cliente (`wc_store_url`) es arbitrario, así que la capability `http:fetch` se resuelve en tiempo de install contra el dominio configurado en settings. Por eso `capabilities: []` en el manifest.

## Install

El host descarga el bundle del marketplace, valida la firma, y persiste los settings del usuario. No requiere backend propio — los tools llaman directo a la API externa con las credenciales de `settings`.
