# Shopify

Consulta pedidos y productos de tu tienda Shopify. Addon **tool-only** — los tools llaman directo al Admin API de `{{shopify_store}}.myshopify.com` con el access token del usuario.

## Tools

| id | descripción | params required |
|---|---|---|
| `search_orders` | Busca pedidos por número de orden en Shopify | `order_number` |
| `get_product` | Obtiene información detallada de un producto por su ID | `product_id` |

## Settings

| key | label | type | required |
|---|---|---|---|
| `shopify_store` | Nombre de la tienda (subdominio en *.myshopify.com) | string | sí |
| `shopify_access_token` | Access Token | password (secret) | sí |

## Capabilities

- `http:fetch` → `*.myshopify.com` — Admin API de la tienda del cliente
- `http:fetch` → `*.shopify.com` — endpoints auxiliares de Shopify

## Install

El host descarga el bundle del marketplace, valida la firma, y persiste los settings del usuario. No requiere backend propio — los tools llaman directo a la API externa con las credenciales de `settings`.
